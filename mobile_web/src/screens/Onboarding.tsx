import { KeyRound, PlusSquare, Share } from "lucide-react";
import { useState } from "react";
import { ApiError, passkeyLogin, passwordLogin } from "../lib/api";

export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

function Hero({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="hero">
      <span className="logo" aria-hidden>
        S
      </span>
      <h1 className="display">{title}</h1>
      {children}
    </div>
  );
}

// Shown in a mobile browser tab (not the installed app): how to install.
export function InstallPrompt({ onSkip }: { onSkip: () => void }) {
  const [deferred] = useState(() => (window as Window & { sureInstallPrompt?: { prompt: () => void } }).sureInstallPrompt);
  return (
    <div className="app onboarding">
      <Hero title="Sure, on your phone">
        <p>Your own server, installed like an app: full screen, works offline, sends notifications.</p>
      </Hero>
      <main className="page">
        {deferred && !isIOS() ? (
          <button className="btn brand pressable" onClick={() => deferred.prompt()}>
            <PlusSquare size={20} /> Install app
          </button>
        ) : (
          <section className="card pad">
            <h2 className="card-title">Install from Safari</h2>
            <ol className="steps">
              <li>
                <span>
                  Tap <b>Share</b>. In newer Safari it is in the <b>≡</b> menu of the address bar.
                </span>
                <Share size={20} color="var(--brand)" aria-hidden />
              </li>
              <li>
                <span>
                  Choose <b>Add to Home Screen</b>, under <b>More</b> if it isn't listed.
                </span>
                <PlusSquare size={20} color="var(--brand)" aria-hidden />
              </li>
              <li>
                <span>Open Sure from your Home Screen.</span>
              </li>
            </ol>
          </section>
        )}
        <button className="link pressable" style={{ alignSelf: "center", padding: 12 }} onClick={onSkip}>
          Continue in the browser
        </button>
      </main>
    </div>
  );
}

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [needsOtp, setNeedsOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passkeysSupported = typeof window.PublicKeyCredential !== "undefined";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.body?.mfa_required) {
        setNeedsOtp(true);
        setError(null);
      } else setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app onboarding">
      <Hero title={needsOtp ? "Enter your code" : "Sign in to Sure"}>
        <p>{needsOtp ? "Open your authenticator app for the 6-digit code." : location.host}</p>
      </Hero>
      <main className="page" style={{ gap: 14 }}>
        {needsOtp ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => passwordLogin(email, password, otp));
            }}
            className="form"
          >
            <input className="field" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-label="6-digit code" maxLength={6} autoFocus />
            <button className="btn primary pressable" disabled={busy || otp.length < 6}>
              {busy ? "Checking…" : "Verify"}
            </button>
            <button type="button" className="link pressable" style={{ alignSelf: "center", padding: 8 }} onClick={() => (setNeedsOtp(false), setOtp(""))}>
              Use a different account
            </button>
          </form>
        ) : (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(() => passwordLogin(email, password));
              }}
              className="form"
            >
              <label className="stack">
                <span className="label">Email</span>
                <input className="field" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="stack">
                <span className="label">Password</span>
                <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <button className="btn primary pressable" disabled={busy || !email || !password}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <p className="or">or</p>
            {passkeysSupported && (
              <button className="btn soft pressable" disabled={busy} onClick={() => run(passkeyLogin)}>
                <KeyRound size={20} /> Sign in with a passkey
              </button>
            )}
            <a href="/sessions/new" className="btn soft pressable">
              Use single sign-on
            </a>
          </>
        )}
        {needsOtp && error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
