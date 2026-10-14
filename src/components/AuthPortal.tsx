import React, { useState } from 'react';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  firebaseSignOut,
} from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { BLUEPRINT_LIMITS, sanitizeString, UserProfile } from '../types';
import {
  ShieldCheck,
  Wallet,
  GraduationCap,
  ArrowRight,
  AlertCircle,
  UserPlus,
  LogIn,
  KeyRound,
  CheckCircle2,
  Mail,
  Lock,
  RefreshCw,
} from 'lucide-react';

interface AuthPortalProps {
  onAuthenticated: (profile: UserProfile) => void;
}

interface PendingTwoFactorState {
  challengeId: string;
  profile: UserProfile;
  email: string;
  maskedEmail: string;
  purpose: 'signin' | 'signup' | 'google' | 'recover';
  needsEmailInput?: boolean;
}

export async function computeCredentialKey(username: string, password: string): Promise<string> {
  const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const encoder = new TextEncoder();
  const data = encoder.encode(`fundtracker_v1:${cleanUser}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  return `${cleanUser.slice(0, 30)}_${hashHex}`;
}

/**
 * Computes a single unified deterministic UID from an email address (or username fallback)
 * so that signing in with Google (Gmail) and signing up/in with Username + that same Gmail
 * ALWAYS resolve to the exact same account UID, roles, and rooms.
 */
export async function computeUnifiedUidFromEmail(email: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(`fundtracker_unified_email_uid:${cleanEmail}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 28);
  const localPrefix = (cleanEmail.split('@')[0] || 'user')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 16);
  return `usr_${localPrefix || 'acct'}_${hashHex}`;
}

export async function computeEmailHashKey(email: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(`fundtracker_email_v1:${cleanEmail}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 50);
  return `em_${hashHex}`;
}

export function maskEmailAddress(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const parts = trimmed.split('@');
  if (parts.length !== 2) return 'user***@mail';
  const [local, domain] = parts;
  const visibleLocal = local.slice(0, 2);
  return `${visibleLocal}***@${domain}`.slice(0, 120);
}

/**
 * Links a verified email to the account (used for recovery and Google/username unification).
 * Only called AFTER the server has confirmed the 2FA code, so nobody can attach an
 * email address they do not own.
 */
async function linkEmailToAccount(profile: UserProfile, cleanEmail: string): Promise<void> {
  if (!cleanEmail) return;
  try {
    const emailHashId = await computeEmailHashKey(cleanEmail);
    const emailRef = doc(db, 'email_recovery', emailHashId);
    const emailSnap = await getDoc(emailRef);
    if (!emailSnap.exists()) {
      await setDoc(emailRef, {
        id: emailHashId,
        uid: profile.uid,
        username: profile.username,
        displayName: profile.displayName,
        maskedEmail: maskEmailAddress(cleanEmail),
        createdAt: serverTimestamp(),
      });
    }
    localStorage.setItem(`ft_user_email_${profile.uid}`, cleanEmail);
    localStorage.setItem(`ft_user_email_uname_${profile.username.toLowerCase()}`, cleanEmail);
  } catch {
    // Ignore optional email cache update errors
  }
}

/**
 * Resolves and unifies a Google Sign-In user with any existing Username/Email account
 * sharing the same Gmail address so both login methods share the exact same UID and profile.
 */
export async function resolveUnifiedGoogleProfile(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
}): Promise<UserProfile> {
  const cleanEmail = (user.email || '').trim().toLowerCase();
  const baseUsername = (cleanEmail.split('@')[0] || user.displayName || 'user')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 30);
  const fallbackUsername = baseUsername.length >= 2 ? baseUsername : 'google_user';
  const fallbackDisplay = sanitizeString(
    user.displayName || fallbackUsername || 'Member',
    BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
  );

  if (cleanEmail) {
    const emailHashId = await computeEmailHashKey(cleanEmail);
    const emailRef = doc(db, 'email_recovery', emailHashId);
    const emailSnap = await getDoc(emailRef);

    if (emailSnap.exists()) {
      const rec = emailSnap.data();
      const canonicalUid: string = rec.uid;
      const canonicalUsername: string = rec.username || fallbackUsername;
      const canonicalDisplay: string = rec.displayName || fallbackDisplay;

      const userRef = doc(db, 'users', canonicalUid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        return userSnap.data() as UserProfile;
      }

      const unifiedProfile: UserProfile = {
        uid: canonicalUid,
        username: canonicalUsername,
        displayName: canonicalDisplay,
      };
      await setDoc(userRef, {
        ...unifiedProfile,
        createdAt: serverTimestamp(),
      });
      return unifiedProfile;
    }

    const existingGoogleUserSnap = await getDoc(doc(db, 'users', user.uid));
    const canonicalUid = existingGoogleUserSnap.exists()
      ? user.uid
      : await computeUnifiedUidFromEmail(cleanEmail);

    const userRef = doc(db, 'users', canonicalUid);
    const userSnap = await getDoc(userRef);
    let profile: UserProfile;

    if (userSnap.exists()) {
      profile = userSnap.data() as UserProfile;
    } else {
      profile = {
        uid: canonicalUid,
        username: fallbackUsername,
        displayName: fallbackDisplay,
      };
      await setDoc(userRef, {
        ...profile,
        createdAt: serverTimestamp(),
      });
    }

    await setDoc(emailRef, {
      id: emailHashId,
      uid: profile.uid,
      username: profile.username,
      displayName: profile.displayName,
      maskedEmail: maskEmailAddress(cleanEmail),
      createdAt: serverTimestamp(),
    });

    return profile;
  }

  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    return snap.data() as UserProfile;
  }
  const profile: UserProfile = {
    uid: user.uid,
    username: fallbackUsername,
    displayName: fallbackDisplay,
  };
  await setDoc(userRef, {
    ...profile,
    createdAt: serverTimestamp(),
  });
  return profile;
}

// DEVELOPMENT ONLY skip-login. Double lock:
//  1) Vite sets import.meta.env.DEV to false in production builds (removes the code), and
//  2) it is also refused on any *.onrender.com address, even if a dev server runs there by mistake.
const DEV_LOGIN_ENABLED =
  import.meta.env.DEV && !/onrender\.com$/i.test(window.location.hostname);

export const AuthPortal: React.FC<AuthPortalProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'recover'>('signin');
  const [username, setUsername] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Two-Factor Authentication (2FA) Challenge State
  const [pending2FA, setPending2FA] = useState<PendingTwoFactorState | null>(null);
  const [twoFactorCodeInput, setTwoFactorCodeInput] = useState('');
  const [twoFactorEmailInput, setTwoFactorEmailInput] = useState('');

  // Ask the server to email a 6-digit 2FA code to the user
  const issueTwoFactorChallenge = async (
    profile: UserProfile,
    targetEmail: string,
    purpose: 'signin' | 'signup' | 'google' | 'recover'
  ) => {
    const cleanEmail = targetEmail.trim().toLowerCase();
    sessionStorage.setItem('ft_pending_2fa', '1');

    // If this account didn't have an email address provided yet, prompt the user for their email first
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setPending2FA({
        challengeId: '',
        profile,
        email: '',
        maskedEmail: '',
        purpose,
        needsEmailInput: true,
      });
      setTwoFactorEmailInput('');
      setTwoFactorCodeInput('');
      return;
    }

    const masked = maskEmailAddress(cleanEmail);

    // The SERVER generates the 6-digit code and emails it. The browser never receives the code.
    let challengeId = '';
    try {
      const resp = await fetch('/api/auth/send-2fa-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          username: profile.displayName || profile.username,
          purpose,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok || !data.challengeId) {
        throw new Error(data.error || 'Could not send the verification email. Please try again.');
      }
      challengeId = data.challengeId as string;
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not send the verification email. Please try again.'
      );
      // Never let someone in when the code could not be sent.
      if (!pending2FA) {
        sessionStorage.removeItem('ft_pending_2fa');
        try {
          await firebaseSignOut(auth);
        } catch {
          // Ignore
        }
      }
      return;
    }

    setPending2FA({
      challengeId,
      profile,
      email: cleanEmail,
      maskedEmail: masked,
      purpose,
      needsEmailInput: false,
    });
    setTwoFactorCodeInput('');
    setSuccessMsg(`A 6-digit verification code has been sent to ${cleanEmail}.`);
  };

  // Handle verifying the 6-digit 2FA code entered by the user
  const handleVerifyTwoFactorCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending2FA) return;
    setErrorMsg('');
    setSuccessMsg('');

    // Step A: If the user needed to supply their email first, validate and send the 2FA code now
    if (pending2FA.needsEmailInput) {
      const enteredEmail = twoFactorEmailInput.trim().toLowerCase();
      if (!enteredEmail.includes('@') || enteredEmail.length < 5) {
        setErrorMsg('Please enter a valid Gmail or email address to receive your 2FA code.');
        return;
      }
      setBusy(true);
      try {
        await issueTwoFactorChallenge(pending2FA.profile, enteredEmail, pending2FA.purpose);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    // Step B: Verify the 6-digit code with the server
    const cleanCode = twoFactorCodeInput.trim().replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanCode)) {
      setErrorMsg('Please enter the 6-digit numeric verification code.');
      return;
    }

    setBusy(true);
    try {
      // The SERVER checks the code (expiry, attempt limit, single use).
      const resp = await fetch('/api/auth/verify-2fa-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: pending2FA.challengeId, code: cleanCode }),
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data.ok || data.email !== pending2FA.email) {
        setErrorMsg(
          data.error ||
            'Invalid 6-digit verification code. Please check the code sent to your email and try again.'
        );
        setBusy(false);
        return;
      }

      // Code verified: now it is safe to link this email to the account.
      await linkEmailToAccount(pending2FA.profile, pending2FA.email);

      // Mark 2FA verified and complete login!
      sessionStorage.removeItem('ft_pending_2fa');
      localStorage.setItem('ft_2fa_verified_uid', pending2FA.profile.uid);
      localStorage.setItem('ft_active_session', JSON.stringify(pending2FA.profile));
      if (pending2FA.email) {
        localStorage.setItem('ft_active_email', pending2FA.email.toLowerCase());
      }
      onAuthenticated(pending2FA.profile);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResendTwoFactorCode = async () => {
    if (!pending2FA || !pending2FA.email) return;
    setBusy(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await issueTwoFactorChallenge(pending2FA.profile, pending2FA.email, pending2FA.purpose);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCancelTwoFactor = async () => {
    sessionStorage.removeItem('ft_pending_2fa');
    setPending2FA(null);
    setTwoFactorCodeInput('');
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await firebaseSignOut(auth);
    } catch {
      // Ignore
    }
  };

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setErrorMsg('');
    setSuccessMsg('');
    sessionStorage.setItem('ft_pending_2fa', '1');
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const profile = await resolveUnifiedGoogleProfile(cred.user);
      const targetEmail = (cred.user.email || '').trim().toLowerCase();
      await issueTwoFactorChallenge(profile, targetEmail, 'google');
    } catch (err: unknown) {
      sessionStorage.removeItem('ft_pending_2fa');
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  // DEVELOPMENT ONLY: lets you preview/edit the app without the email 2FA.
  // Locked by DEV_LOGIN_ENABLED (see top of this component): off in production builds
  // and on onrender.com.
  const handleDevSkipLogin = async () => {
    if (!DEV_LOGIN_ENABLED) return;
    setBusy(true);
    setErrorMsg('');
    setSuccessMsg('');
    const devProfile: UserProfile = {
      uid: 'dev_local_tester',
      username: 'devtester',
      displayName: 'Dev Tester',
    };
    try {
      const userRef = doc(db, 'users', devProfile.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, { ...devProfile, createdAt: serverTimestamp() });
      }
      localStorage.setItem('ft_2fa_verified_uid', devProfile.uid);
      localStorage.setItem('ft_active_session', JSON.stringify(devProfile));
      onAuthenticated(devProfile);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // ACCOUNT RECOVERY / LINK PASSWORD TO GMAIL MODE
    if (mode === 'recover') {
      const cleanEmail = recoveryEmail.trim().toLowerCase();
      if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
        setErrorMsg('Please enter the valid Gmail / recovery email address linked to your account.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('New password must be at least 6 characters.');
        return;
      }

      setBusy(true);
      try {
        const emailHashId = await computeEmailHashKey(cleanEmail);
        const emailRef = doc(db, 'email_recovery', emailHashId);
        const emailSnap = await getDoc(emailRef);

        if (!emailSnap.exists()) {
          setErrorMsg(
            'No account found matching that email address yet. Use the Sign Up tab with that email to create or link your username.'
          );
          setBusy(false);
          return;
        }

        const recData = emailSnap.data();
        const recoveredUsername: string = recData.username;
        const recoveredUid: string = recData.uid;
        const recoveredDisplayName: string = recData.displayName;

        const newCredKey = await computeCredentialKey(recoveredUsername, password);
        const newCredRef = doc(db, 'username_credentials', newCredKey);
        await setDoc(newCredRef, {
          id: newCredKey,
          uid: recoveredUid,
          username: recoveredUsername,
          displayName: recoveredDisplayName,
          createdAt: serverTimestamp(),
        });

        const profile: UserProfile = {
          uid: recoveredUid,
          username: recoveredUsername,
          displayName: recoveredDisplayName,
        };
        await issueTwoFactorChallenge(profile, cleanEmail, 'recover');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setErrorMsg(message);
      } finally {
        setBusy(false);
      }
      return;
    }

    // SIGN UP Mode (Also seamlessly merges with an existing Google account if the same Gmail is entered!)
    if (mode === 'signup') {
      const trimmedUsername = username.trim().replace(/[^a-zA-Z0-9_-]/g, '');
      const cleanEmail = recoveryEmail.trim().toLowerCase();

      if (trimmedUsername.length < BLUEPRINT_LIMITS.USERNAME_MIN) {
        setErrorMsg('Username must be at least 2 alphanumeric characters.');
        return;
      }
      if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
        setErrorMsg(
          'Please enter a valid Gmail or recovery email address so we can send your 2FA verification code and unify your account.'
        );
        return;
      }
      if (password.length < 6) {
        setErrorMsg('Password must be at least 6 characters.');
        return;
      }

      setBusy(true);
      sessionStorage.setItem('ft_pending_2fa', '1');
      try {
        const emailHashId = await computeEmailHashKey(cleanEmail);
        const emailRef = doc(db, 'email_recovery', emailHashId);
        const existingEmailSnap = await getDoc(emailRef);

        const unifiedUid = existingEmailSnap.exists()
          ? (existingEmailSnap.data().uid as string)
          : await computeUnifiedUidFromEmail(cleanEmail);

        const finalDisplay = sanitizeString(
          displayName ||
            (existingEmailSnap.exists() ? existingEmailSnap.data().displayName : '') ||
            trimmedUsername,
          BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
        );

        const userRef = doc(db, 'users', unifiedUid);
        const userSnap = await getDoc(userRef);

        try {
          const fbCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          await updateProfile(fbCred.user, { displayName: finalDisplay });
        } catch {
          // Proceed with unified Firestore SHA-256 Username & Email credential linking
        }

        if (userSnap.exists()) {
          await setDoc(userRef, {
            uid: unifiedUid,
            username: trimmedUsername,
            displayName: finalDisplay,
            createdAt: userSnap.data().createdAt || serverTimestamp(),
          });
        } else {
          await setDoc(userRef, {
            uid: unifiedUid,
            username: trimmedUsername,
            displayName: finalDisplay,
            createdAt: serverTimestamp(),
          });
        }

        const credKey = await computeCredentialKey(trimmedUsername, password);
        await setDoc(doc(db, 'username_credentials', credKey), {
          id: credKey,
          uid: unifiedUid,
          username: trimmedUsername,
          displayName: finalDisplay,
          createdAt: serverTimestamp(),
        });

        const emailPrefixUsername = (cleanEmail.split('@')[0] || '')
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 30);
        if (
          emailPrefixUsername.length >= 2 &&
          emailPrefixUsername.toLowerCase() !== trimmedUsername.toLowerCase()
        ) {
          const prefixCredKey = await computeCredentialKey(emailPrefixUsername, password);
          await setDoc(doc(db, 'username_credentials', prefixCredKey), {
            id: prefixCredKey,
            uid: unifiedUid,
            username: trimmedUsername,
            displayName: finalDisplay,
            createdAt: serverTimestamp(),
          });
        }

        await setDoc(emailRef, {
          id: emailHashId,
          uid: unifiedUid,
          username: trimmedUsername,
          displayName: finalDisplay,
          maskedEmail: maskEmailAddress(cleanEmail),
          createdAt: serverTimestamp(),
        });

        const profile: UserProfile = {
          uid: unifiedUid,
          username: trimmedUsername,
          displayName: finalDisplay,
        };
        await issueTwoFactorChallenge(profile, cleanEmail, 'signup');
      } catch (err: unknown) {
        sessionStorage.removeItem('ft_pending_2fa');
        const message = err instanceof Error ? err.message : String(err);
        setErrorMsg(message);
      } finally {
        setBusy(false);
      }
      return;
    }

    // SIGN IN Mode (Accepts EITHER Username OR Gmail/Recovery Email + Password, then triggers Email 2FA)
    const rawIdentifier = username.trim();
    if (rawIdentifier.length < 2) {
      setErrorMsg('Please enter your Username or Gmail / Recovery Email.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    sessionStorage.setItem('ft_pending_2fa', '1');
    try {
      let resolvedUsername = rawIdentifier.replace(/[^a-zA-Z0-9_-]/g, '');
      let matchedEmail = '';

      if (rawIdentifier.includes('@')) {
        matchedEmail = rawIdentifier.toLowerCase();
        const emailHashId = await computeEmailHashKey(matchedEmail);
        const emailSnap = await getDoc(doc(db, 'email_recovery', emailHashId));
        if (emailSnap.exists()) {
          resolvedUsername = emailSnap.data().username;
        }
      }

      if (resolvedUsername.length >= 2) {
        const credKey = await computeCredentialKey(resolvedUsername, password);
        const credSnap = await getDoc(doc(db, 'username_credentials', credKey));
        if (credSnap.exists()) {
          const data = credSnap.data();
          const userSnap = await getDoc(doc(db, 'users', data.uid));
          const profile: UserProfile = userSnap.exists()
            ? (userSnap.data() as UserProfile)
            : {
                uid: data.uid,
                username: data.username,
                displayName: data.displayName,
              };

          const cachedEmail =
            matchedEmail ||
            localStorage.getItem(`ft_user_email_${profile.uid}`) ||
            localStorage.getItem(`ft_user_email_uname_${profile.username.toLowerCase()}`) ||
            '';

          await issueTwoFactorChallenge(profile, cachedEmail, 'signin');
          return;
        }
      }

      // Fallback: try Firebase Email/Password auth
      try {
        const emailToTry = rawIdentifier.includes('@')
          ? rawIdentifier.toLowerCase()
          : `${resolvedUsername.toLowerCase()}@fundtracker.app`;
        const fbCred = await signInWithEmailAndPassword(auth, emailToTry, password);
        const profile = await resolveUnifiedGoogleProfile(fbCred.user);
        const targetEmail = rawIdentifier.includes('@')
          ? rawIdentifier.toLowerCase()
          : localStorage.getItem(`ft_user_email_${profile.uid}`) || '';
        await issueTwoFactorChallenge(profile, targetEmail, 'signin');
      } catch {
        sessionStorage.removeItem('ft_pending_2fa');
        setErrorMsg(
          'Invalid username/email or password. If you previously signed in with Google, use "Sign Up" or "Recover" with the same Gmail address to link a password to your Google account.'
        );
      }
    } catch (err: unknown) {
      sessionStorage.removeItem('ft_pending_2fa');
      const message = err instanceof Error ? err.message : String(err);
      setErrorMsg(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Top Bar Contract: 3 Zones */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <a href="/" className="text-lg font-bold tracking-tight text-slate-900">
          FundTracker Ledger
        </a>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a href="#roles" className="hover:text-slate-900 transition-colors">Role Architecture</a>
          <a href="#verification" className="hover:text-slate-900 transition-colors">Audit Verification</a>
          <a href="#transparency" className="hover:text-slate-900 transition-colors">Student Reports</a>
        </nav>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={busy}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            Continue with Google
          </button>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-6 py-12 grid lg:grid-cols-12 gap-12 items-start">
        {/* Left Column: Editorial Domain Overview & 3-POV Governance */}
        <div className="lg:col-span-7 space-y-8 pt-2">
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-500">
              Email Two-Factor Authentication (2FA) · Unified Google & Username Account
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 max-w-xl" style={{ textWrap: 'balance' }}>
              Transparent organizational fund tracking across three accountable viewpoints.
            </h1>
            <p className="text-base text-slate-600 max-w-xl leading-relaxed">
              Every Sign-In, Sign-Up, and Google login is protected by a 6-digit Email Two-Factor Authentication (2FA) verification code and connects to your unified account.
            </p>
          </div>

          <div id="roles" className="border-t border-slate-200 pt-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-900">
              Three Distinct Points of View (POVs)
            </h2>
            <div className="grid sm:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>01. Treasurer POV</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Full ledger authority to record contributions, modify expenses, approve incoming room members, and authorize the Auditor to edit expenses.
                </p>
              </div>

              <div id="verification" className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>02. Auditor POV</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Verifies ledger entries, flags discrepancies with audit notes, approves new room members, and modifies expenses when authorized by the Treasurer.
                </p>
              </div>

              <div id="transparency" className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <GraduationCap className="w-4 h-4 text-slate-700 shrink-0" />
                  <span>03. Student POV</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Read-only dashboard monitoring once approved into the room, full ledger transparency, and a dedicated Personal Contributions Report.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Authentication Box (or 2FA Verification Step) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          {pending2FA ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-slate-900 text-white shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    Step 2 of 2 · Email 2FA Security
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">
                    Two-Factor Authentication
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {pending2FA.needsEmailInput ? (
                      <>
                        Enter the Gmail or email address for{' '}
                        <strong className="text-slate-900">@{pending2FA.profile.username}</strong> so
                        we can send your 6-digit verification code.
                      </>
                    ) : (
                      <>
                        We sent a 6-digit verification code to{' '}
                        <strong className="text-slate-900">{pending2FA.email}</strong> for account{' '}
                        <strong className="text-slate-900">@{pending2FA.profile.username}</strong>.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <form onSubmit={handleVerifyTwoFactorCode} className="space-y-4">
                {pending2FA.needsEmailInput ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      <span>Your Gmail / Email Address for 2FA Code</span>
                    </label>
                    <input
                      type="email"
                      required
                      maxLength={120}
                      value={twoFactorEmailInput}
                      onChange={(e) => setTwoFactorEmailInput(e.target.value)}
                      placeholder="e.g. yourname@gmail.com"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Enter 6-Digit Email Verification Code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      autoFocus
                      value={twoFactorCodeInput}
                      onChange={(e) =>
                        setTwoFactorCodeInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))
                      }
                      placeholder="000000"
                      className="w-full border-2 border-slate-900 rounded-lg px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.35em] text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                )}

                {errorMsg && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  <span>
                    {busy
                      ? 'Verifying 2FA Code…'
                      : pending2FA.needsEmailInput
                      ? 'Send 6-Digit 2FA Code to Email'
                      : 'Verify 6-Digit Code & Enter Workspace'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  {!pending2FA.needsEmailInput ? (
                    <button
                      type="button"
                      onClick={handleResendTwoFactorCode}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Resend 6-Digit Code</span>
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={handleCancelTwoFactor}
                    disabled={busy}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900">
                  {mode === 'signin'
                    ? 'Sign in to FundTracker (2FA Protected)'
                    : mode === 'signup'
                    ? 'Create or Link Username to Gmail'
                    : 'Recover Account / Set Password'}
                </h2>
                <p className="text-xs text-slate-500">
                  {mode === 'recover'
                    ? 'Enter your Gmail / recovery email to receive a 6-digit 2FA verification code and set a new password.'
                    : 'A 6-digit Two-Factor Authentication (2FA) verification code will be sent to your email when signing in or signing up.'}
                </p>
              </div>

              {/* Primary Google Auth Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={busy}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-900 font-medium text-sm rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Sign in with Google + Email 2FA</span>
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-3 text-xs text-slate-400">
                  or use unified username & Gmail (with 2FA)
                </span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              {/* 3-Way Segmented Mode Selector */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className={`flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    mode === 'signin'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className={`flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    mode === 'signup'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Sign Up / Link</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('recover');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className={`flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    mode === 'recover'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Recover</span>
                </button>
              </div>

              <form onSubmit={handleUsernameSubmit} className="space-y-4">
                {mode !== 'recover' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {mode === 'signin' ? 'Username or Gmail Address' : 'Username'}
                    </label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={100}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={
                        mode === 'signin'
                          ? 'e.g. jdelacruz_2026 or yourname@gmail.com'
                          : 'e.g. jdelacruz_2026'
                      }
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                )}

                {mode !== 'signin' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {mode === 'signup'
                        ? 'Gmail / Email Address (Receives 2FA Code & Links Google)'
                        : 'Registered Gmail / Recovery Email (Receives 2FA Code)'}
                    </span>
                  </label>
                  <input
                    type="email"
                    required={mode === 'signup' || mode === 'recover'}
                    maxLength={120}
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    placeholder="e.g. yourname@gmail.com"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  {mode === 'signup' && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      We will send a 6-digit verification code to this email and link it with "Sign in with Google".
                    </p>
                  )}
                </div>
                )}

                {mode === 'signup' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Full Name (for Student & Ledger Attribution)
                    </label>
                    <input
                      type="text"
                      maxLength={80}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Juan Dela Cruz"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {mode === 'recover' ? 'New Password (to Restore Access)' : 'Password'}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {errorMsg && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  <span>
                    {busy
                      ? 'Sending 2FA Verification Code…'
                      : mode === 'signin'
                      ? 'Send 2FA Code & Sign In'
                      : mode === 'signup'
                      ? 'Send 2FA Code & Create Account'
                      : 'Send 2FA Code & Recover Account'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {DEV_LOGIN_ENABLED && (
                <div className="pt-4 border-t border-dashed border-amber-300 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                    Development only · not shown on the live site
                  </p>
                  <button
                    type="button"
                    onClick={handleDevSkipLogin}
                    disabled={busy}
                    className="w-full py-2 px-4 text-sm font-medium text-amber-900 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
                  >
                    Skip login as "Dev Tester"
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500 flex items-center justify-between">
        <span>FundTracker Ledger · Role-Based Financial Calendar</span>
        <span>Secured by Email 2FA, Firebase Auth & Cloud Firestore</span>
      </footer>
    </div>
  );
};
