// Thin client for Sure's /api/v1. The app holds its own OAuth token (from
// /api/v1/auth/login or /m/session_token) and refreshes it once on a 401.

export type Tokens = { access_token: string; refresh_token: string; expires_in: number; created_at: number };
export type User = { id: string; email: string; first_name?: string | null; last_name?: string | null; ai_enabled?: boolean };
type Session = Tokens & { user: User };

const SESSION_KEY = "sure.mobile.session";
const DEVICE_KEY = "sure.mobile.device";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown> | null,
  ) {
    super((body?.message as string) || (body?.error as string) || `Request failed (${status})`);
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode: the session lives for this page only.
  }
}

let memorySession: Session | null = read<Session>(SESSION_KEY);
const listeners = new Set<() => void>();

export function getSession() {
  return memorySession;
}

export function setSession(session: Session | null) {
  memorySession = session;
  write(SESSION_KEY, session);
  listeners.forEach((listener) => listener());
}

export function onSessionChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function deviceInfo() {
  let id = read<string>(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    write(DEVICE_KEY, id);
  }
  const ua = navigator.userAgent;
  const name = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : "Browser";
  return { device_id: id, device_name: `${name} (web app)`, device_type: "web", os_version: navigator.platform || "web", app_version: "pwa-0.1" };
}

function csrfToken() {
  return document.querySelector<HTMLMetaElement>("meta[name=csrf-token]")?.content ?? "";
}

async function parse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const session = memorySession;
  if (!session) return false;
  refreshing ??= (async () => {
    const response = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token, device: deviceInfo() }),
    });
    if (!response.ok) {
      setSession(null);
      return false;
    }
    const tokens = (await response.json()) as Tokens;
    setSession({ ...session, ...tokens });
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, unknown> } = {}): Promise<T> {
  const url = new URL(`/api/v1${path}`, location.origin);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(`${key}[]`, String(v)));
    else url.searchParams.set(key, String(value));
  }

  const send = () =>
    fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(memorySession ? { Authorization: `Bearer ${memorySession.access_token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

  let response = await send();
  if (response.status === 401 && memorySession && (await refresh())) response = await send();

  const body = await parse(response);
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

// Password sign-in straight against the API (handles MFA with otp_code).
export async function passwordLogin(email: string, password: string, otpCode?: string) {
  const response = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password, otp_code: otpCode, device: deviceInfo() }),
  });
  const body = await parse(response);
  if (!response.ok) throw new ApiError(response.status, body);
  setSession(body as Session);
}

// Exchanges a web session cookie (from passkey, SSO or the web sign-in
// page) for an API token. Returns false when there is no web session.
export async function exchangeWebSession() {
  const response = await fetch("/m/session_token", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": csrfToken() },
    body: JSON.stringify(deviceInfo()),
  });
  if (response.status === 401) return false;
  const body = await parse(response);
  if (!response.ok) throw new ApiError(response.status, body);
  setSession(body as Session);
  return true;
}

function base64urlToBuffer(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

function bufferToBase64url(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Discoverable-passkey sign-in through the web endpoints, then the token
// exchange. The browser picks the credential, so no email is needed.
export async function passkeyLogin() {
  const headers = { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": csrfToken() };
  const optionsResponse = await fetch("/sessions/passkey_options", { method: "POST", credentials: "same-origin", headers });
  if (!optionsResponse.ok) throw new ApiError(optionsResponse.status, await parse(optionsResponse));
  const options = await optionsResponse.json();

  const credential = (await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: base64urlToBuffer(options.challenge),
      allowCredentials: (options.allowCredentials ?? []).map((c: { id: string }) => ({ ...c, id: base64urlToBuffer(c.id) })),
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey sign-in was cancelled");

  const assertion = credential.response as AuthenticatorAssertionResponse;
  const payload = {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(assertion.clientDataJSON),
      authenticatorData: bufferToBase64url(assertion.authenticatorData),
      signature: bufferToBase64url(assertion.signature),
      userHandle: assertion.userHandle ? bufferToBase64url(assertion.userHandle) : null,
    },
  };

  const verify = await fetch("/sessions/passkey", { method: "POST", credentials: "same-origin", headers, body: JSON.stringify({ credential: payload }) });
  if (!verify.ok) throw new ApiError(verify.status, await parse(verify));
  if (!(await exchangeWebSession())) throw new Error("Passkey sign-in did not start a session");
}

export function signOut() {
  const token = memorySession?.access_token;
  setSession(null);
  // Drop cached API responses: they hold this user's financial data.
  navigator.serviceWorker?.controller?.postMessage("sign-out");
  if (token) fetch("/api/v1/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}
