import { KeyRound, PlusSquare, Share } from "lucide-react";
import { useState } from "react";
import { ApiError, passkeyLogin, passwordLogin } from "../lib/api";

export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

function Logo() {
  return (
    <span style={{ width: 56, height: 56, borderRadius: 16, background: "var(--brand)", display: "grid", placeItems: "center" }}>
      <span className="display" style={{ fontSize: 30, color: "#fff", letterSpacing: "-0.04em" }}>
        S
      </span>
    </span>
  );
}

// Shown in a mobile browser tab (not the installed app): how to install.
export function InstallPrompt({ onSkip }: { onSkip: () => void }) {
  const [deferred] = useState(() => (window as Window & { sureInstallPrompt?: { prompt: () => void } }).sureInstallPrompt);
  return (
    <main className="page plain" style={{ padding: "calc(var(--safe-top) + 40px) 28px 32px", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Logo />
        <h1 className="display" style={{ fontSize: 36, lineHeight: "40px", margin: 0 }}>
          Sure, on your phone
        </h1>
        <p className="muted" style={{ fontSize: 16, lineHeight: "24px", margin: 0, color: "var(--ink-2)" }}>
          This is your own server. Install it like an app: full screen, works offline, sends notifications.
        </p>
      </div>
      {deferred && !isIOS() ? (
        <button className="btn brand pressable" onClick={() => deferred.prompt()}>
          <PlusSquare size={20} /> Install app
        </button>
      ) : (
        <div className="card" style={{ background: "var(--surface-sunk)", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="eyebrow" style={{ color: "var(--brand)" }}>
            Install in 2 taps
          </span>
          <Step n={1} icon={<Share size={20} color="#0A84FF" />}>
            Tap <b>Share</b> in Safari's toolbar
          </Step>
          <Step n={2} icon={<PlusSquare size={20} />}>
            Choose <b>Add to Home Screen</b>
          </Step>
        </div>
      )}
      <button className="link pressable" style={{ fontSize: 15, alignSelf: "center" }} onClick={onSkip}>
        Continue in browser instead
      </button>
    </main>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ width: 28, height: 28, borderRadius: 14, background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{n}</span>
      <span style={{ flex: 1, fontSize: 16 }}>{children}</span>
      {icon}
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
    <main className="page plain" style={{ padding: "calc(var(--safe-top) + 32px) 28px 32px", gap: 24, minHeight: "100dvh" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>
          {location.host}
        </span>
        <h1 className="display" style={{ fontSize: 36, margin: 0 }}>
          {needsOtp ? "Two-factor code" : "Welcome back"}
        </h1>
      </div>

      {needsOtp ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => passwordLogin(email, password, otp));
          }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <input className="field" value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" autoFocus />
          <button className="btn primary pressable" disabled={busy || otp.length < 6}>
            Verify
          </button>
        </form>
      ) : (
        <>
          {passkeysSupported && (
            <button className="btn brand pressable" disabled={busy} onClick={() => run(passkeyLogin)}>
              <KeyRound size={20} /> Sign in with passkey
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <span className="muted" style={{ fontSize: 13 }}>
              or with password
            </span>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => passwordLogin(email, password));
            }}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <input className="field" type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="field" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="btn primary pressable" disabled={busy || !email || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <a href="/sessions/new" className="btn outline pressable" style={{ textDecoration: "none", color: "var(--ink)", fontSize: 16 }}>
            Use single sign-on
          </a>
        </>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--over)", margin: 0, fontSize: 14 }}>
          {error}
        </p>
      )}
    </main>
  );
}
