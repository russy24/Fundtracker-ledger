import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

// ---------------------------------------------------------------------------
// 2FA settings
// ---------------------------------------------------------------------------
const CODE_TTL_MS = 10 * 60 * 1000; // code is valid for 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 code per email per minute
const MAX_ATTEMPTS = 5; // wrong guesses allowed per code
const PURPOSES = ['signin', 'signup', 'google', 'recover'] as const;
type Purpose = (typeof PURPOSES)[number];

// Used to hash codes. Challenges live in memory, so a random secret per boot is fine.
const HASH_SECRET = process.env.CODE_HASH_SECRET || crypto.randomBytes(32).toString('hex');

interface Challenge {
  email: string;
  purpose: Purpose;
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

// NOTE: in-memory storage. Pending codes are lost if the server restarts,
// and this only works with a single server instance (fine for Render's default).
const challenges = new Map<string, Challenge>();
const lastSentByEmail = new Map<string, number>();
const rateBuckets = new Map<string, number[]>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    rateBuckets.set(key, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  return false;
}

function hashCode(challengeId: string, code: string): string {
  return crypto.createHmac('sha256', HASH_SECRET).update(`${challengeId}:${code}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Clean up expired codes and old rate-limit entries every minute.
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of challenges) {
    if (c.expiresAt <= now) challenges.delete(id);
  }
  for (const [email, t] of lastSentByEmail) {
    if (now - t > RESEND_COOLDOWN_MS) lastSentByEmail.delete(email);
  }
  for (const [key, times] of rateBuckets) {
    if (!times.some((t) => now - t < 15 * 60 * 1000)) rateBuckets.delete(key);
  }
}, 60 * 1000).unref();

// ---------------------------------------------------------------------------
// Email sending
//   1) BREVO_API_KEY set  -> Brevo HTTPS API (port 443, works on Render FREE)
//   2) SMTP_* set         -> SMTP (works locally and on paid Render; blocked on Render free)
//   3) neither, dev only  -> code is printed to the server console
// ---------------------------------------------------------------------------
interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

async function sendMail(mail: OutgoingMail): Promise<void> {
  if (process.env.BREVO_API_KEY) {
    const senderEmail = process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER;
    if (!senderEmail) throw new Error('MAIL_FROM_EMAIL is not set.');
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: process.env.MAIL_FROM_NAME || 'FundTracker Security', email: senderEmail },
        to: [{ email: mail.to }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Brevo API error ${res.status}: ${detail}`);
    }
    return;
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"FundTracker Security" <${process.env.SMTP_USER}>`,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return;
  }

  if (!IS_PROD) {
    console.log(`\n[DEV ONLY] Email not configured. Would send to ${mail.to}:\n${mail.text}\n`);
    return;
  }

  throw new Error('No email provider is configured on the server.');
}

function buildEmail(opts: { email: string; username: string; purpose: Purpose; code: string }): OutgoingMail {
  const actionLabel =
    opts.purpose === 'signup'
      ? 'Account Sign-Up'
      : opts.purpose === 'recover'
      ? 'Account Password Recovery'
      : opts.purpose === 'google'
      ? 'Google Sign-In Verification'
      : 'Account Sign-In';

  const user = escapeHtml(opts.username);
  const email = escapeHtml(opts.email);

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #0f172a;">
      <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; margin-bottom: 8px;">
        FundTracker Ledger · Two-Factor Authentication (2FA)
      </div>
      <h2 style="font-size: 20px; font-weight: 700; margin: 0 0 12px 0; color: #0f172a;">
        Your 6-Digit Verification Code
      </h2>
      <p style="font-size: 14px; color: #334155; line-height: 1.5; margin: 0 0 20px 0;">
        Hello <strong>${user}</strong>, a verification code was requested for <strong>${actionLabel}</strong> on FundTracker Ledger using <strong>${email}</strong>.
      </p>
      <div style="background-color: #f8fafc; border: 2px solid #0f172a; border-radius: 10px; padding: 18px; text-align: center; margin-bottom: 20px;">
        <div style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">
          Verification Code (Valid for 10 Minutes)
        </div>
        <div style="font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.25em; color: #0f172a;">
          ${opts.code}
        </div>
      </div>
      <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
        Enter this code in FundTracker to finish. Never share it with anyone. If you did not request this code, you can safely ignore this email.
      </p>
    </div>
  `;

  return {
    to: opts.email,
    subject: `[FundTracker] ${opts.code} is your verification code`,
    text:
      `Hello ${opts.username},\n\n` +
      `Your FundTracker verification code for ${actionLabel} is: ${opts.code}\n\n` +
      `It is valid for 10 minutes. Never share it with anyone.`,
    html,
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
async function startServer() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render sits behind a proxy; needed for correct req.ip
  app.use(express.json({ limit: '10kb' }));

  // POST /api/auth/send-2fa-code
  // Body: { email, purpose, username? }
  // The SERVER makes the code. The browser never receives it.
  app.post('/api/auth/send-2fa-code', async (req: Request, res: Response) => {
    const body = (req.body || {}) as { email?: unknown; purpose?: unknown; username?: unknown };

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const purpose = body.purpose as Purpose;
    const username =
      typeof body.username === 'string' && body.username.trim()
        ? body.username.trim().slice(0, 40)
        : email.split('@')[0] || 'Member';

    if (!isValidEmail(email) || !PURPOSES.includes(purpose)) {
      res.status(400).json({ error: 'A valid email and purpose are required.' });
      return;
    }

    const ip = req.ip || 'unknown';
    if (rateLimited(`send-ip:${ip}`, 10, 15 * 60 * 1000) || rateLimited(`send-email:${email}`, 5, 15 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
      return;
    }

    const last = lastSentByEmail.get(email);
    if (last && Date.now() - last < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - last)) / 1000);
      res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
      return;
    }

    // Invalidate any older pending code for the same email + purpose.
    for (const [id, c] of challenges) {
      if (c.email === email && c.purpose === purpose) challenges.delete(id);
    }

    const challengeId = crypto.randomBytes(24).toString('hex');
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

    challenges.set(challengeId, {
      email,
      purpose,
      codeHash: hashCode(challengeId, code),
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
    });

    try {
      await sendMail(buildEmail({ email, username, purpose, code }));
      lastSentByEmail.set(email, Date.now());
      res.json({ ok: true, challengeId, expiresInSeconds: CODE_TTL_MS / 1000 });
    } catch (err) {
      challenges.delete(challengeId);
      console.error('2FA email failed:', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'Could not send the verification email. Please try again later.' });
    }
  });

  // POST /api/auth/verify-2fa-code
  // Body: { challengeId, code }
  app.post('/api/auth/verify-2fa-code', (req: Request, res: Response) => {
    const body = (req.body || {}) as { challengeId?: unknown; code?: unknown };
    const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (!challengeId || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'A challengeId and a 6-digit code are required.' });
      return;
    }

    if (rateLimited(`verify-ip:${req.ip || 'unknown'}`, 30, 15 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
      return;
    }

    const challenge = challenges.get(challengeId);
    if (!challenge || challenge.expiresAt <= Date.now()) {
      challenges.delete(challengeId);
      res.status(400).json({ error: 'This code has expired or is invalid. Please request a new one.' });
      return;
    }

    challenge.attempts += 1;
    if (challenge.attempts > MAX_ATTEMPTS) {
      challenges.delete(challengeId);
      res.status(429).json({ error: 'Too many wrong attempts. Please request a new code.' });
      return;
    }

    if (!safeEqual(challenge.codeHash, hashCode(challengeId, code))) {
      res.status(400).json({
        error: 'Incorrect code.',
        attemptsLeft: MAX_ATTEMPTS - challenge.attempts,
      });
      return;
    }

    // Success: the code can only be used once.
    challenges.delete(challengeId);
    res.json({ ok: true, email: challenge.email, purpose: challenge.purpose });
  });

  // Return JSON (not an HTML stack trace) for bad request bodies.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(400).json({ error: 'Invalid request.' });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
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
