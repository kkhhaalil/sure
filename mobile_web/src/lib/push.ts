import { api } from "./api";

// Web Push through the app's service worker. iOS only allows it once the
// app runs from the Home Screen (16.4+), so "unsupported" usually means
// "open the installed app".

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export async function pushState(): Promise<"unsupported" | "denied" | "off" | "on"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  // getSubscription can hang where push has no backend (the iOS
  // simulator); treat no answer as "not subscribed".
  const lookup = navigator.serviceWorker.getRegistration("/m").then((registration) => registration?.pushManager.getSubscription());
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
  const subscription = await Promise.race([lookup, timeout]).catch(() => null);
  return subscription ? "on" : "off";
}

export async function subscribeToPush() {
  const { public_key } = await api<{ public_key: string }>("/push_subscriptions/vapid_public_key");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications were not allowed");

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(public_key) });
  const json = subscription.toJSON();
  const saved = await api<{ id: string }>("/push_subscriptions", { method: "POST", body: { platform: "web", endpoint: json.endpoint, keys: json.keys } });
  localStorage.setItem("sure.mobile.push", saved.id);
}

export async function unsubscribeFromPush() {
  const registration = await navigator.serviceWorker.getRegistration("/m");
  await (await registration?.pushManager.getSubscription())?.unsubscribe();
  const id = localStorage.getItem("sure.mobile.push");
  if (id) await api(`/push_subscriptions/${id}`, { method: "DELETE" }).catch(() => {});
  localStorage.removeItem("sure.mobile.push");
}
