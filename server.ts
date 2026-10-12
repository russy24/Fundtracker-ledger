import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedTestAccount: nodemailer.TestAccount | null = null;

async function getMailTransporter(): Promise<{
  transporter: nodemailer.Transporter;
  isTestInbox: boolean;
  fromAddress: string;
}> {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    return {
      transporter,
      isTestInbox: false,
      fromAddress: process.env.SMTP_FROM || `"FundTracker Security" <${process.env.SMTP_USER}>`,
    };
  }

  if (!cachedTestAccount) {
    cachedTestAccount = await nodemailer.createTestAccount();
  }

  const transporter = nodemailer.createTransport({
    host: cachedTestAccount.smtp.host,
    port: cachedTestAccount.smtp.port,
    secure: cachedTestAccount.smtp.secure,
    auth: {
      user: cachedTestAccount.user,
      pass: cachedTestAccount.pass,
    },
  });

  return {
    transporter,
    isTestInbox: true,
    fromAddress: '"FundTracker 2FA Security" <security@fundtracker.org>',
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 2FA Email Delivery Endpoint
  app.post('/api/auth/send-2fa-code', async (req, res) => {
    try {
      const { email, code, username, purpose } = req.body as {
        email?: string;
        code?: string;
        username?: string;
        purpose?: string;
      };

      const cleanEmail = (email || '').trim().toLowerCase();
      const cleanCode = (code || '').trim();
      const displayUser = (username || cleanEmail.split('@')[0] || 'Member').trim();
      const actionLabel =
        purpose === 'signup'
          ? 'Account Sign-Up & Gmail Linking'
          : purpose === 'recover'
          ? 'Account Password Recovery'
          : purpose === 'google'
          ? 'Google Sign-In Verification'
          : 'Account Sign-In';

      if (!cleanEmail || !cleanEmail.includes('@') || !/^\d{6}$/.test(cleanCode)) {
        res.status(400).json({ error: 'Valid recipient email and 6-digit code are required.' });
        return;
      }

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #0f172a;">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; margin-bottom: 8px;">
            FundTracker Ledger · Two-Factor Authentication (2FA)
          </div>
          <h2 style="font-size: 20px; font-weight: 700; margin: 0 0 12px 0; color: #0f172a;">
            Your 6-Digit Verification Code
          </h2>
          <p style="font-size: 14px; color: #334155; line-height: 1.5; margin: 0 0 20px 0;">
            Hello <strong>${displayUser}</strong>, a verification code was requested for <strong>${actionLabel}</strong> on FundTracker Ledger using <strong>${cleanEmail}</strong>.
          </p>
          <div style="background-color: #f8fafc; border: 2px solid #0f172a; border-radius: 10px; padding: 18px; text-align: center; margin-bottom: 20px;">
            <div style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">
              Verification Code (Valid for 10 Minutes)
            </div>
            <div style="font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.25em; color: #0f172a;">
              ${cleanCode}
            </div>
          </div>
          <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
            Enter this 6-digit code in the FundTracker verification prompt to complete your login. If you did not request this code, you can safely ignore this email.
          </p>
        </div>
      `;

      try {
        const { transporter, isTestInbox, fromAddress } = await getMailTransporter();
        const info = await transporter.sendMail({
          from: fromAddress,
          to: cleanEmail,
          subject: `[FundTracker] ${cleanCode} is your 2FA verification code`,
          text: `Hello ${displayUser},\n\nYour FundTracker Two-Factor Authentication (2FA) verification code for ${actionLabel} is: ${cleanCode}\n\nEnter this 6-digit code to finish signing in.`,
          html: htmlBody,
        });

        const previewUrl = isTestInbox ? nodemailer.getTestMessageUrl(info) || null : null;

        res.json({
          ok: true,
          deliveredVia: isTestInbox ? 'ethereal_test_inbox' : 'smtp',
          previewUrl,
          dispatchFallbackCode: isTestInbox ? cleanCode : undefined,
        });
      } catch {
        // Fallback if outbound SMTP port is blocked in the container network
        res.json({
          ok: true,
          deliveredVia: 'simulated_outbox',
          previewUrl: null,
          dispatchFallbackCode: cleanCode,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FundTracker server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
