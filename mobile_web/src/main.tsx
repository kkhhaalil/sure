import { Component, type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// A render error shows a way out instead of a blank screen.
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page plain" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", minHeight: "100dvh" }}>
        <h1 className="display" style={{ fontSize: 28, margin: 0 }}>
          Something went wrong
        </h1>
        <p className="muted">Your data is safe on your server.</p>
        <button className="btn primary pressable" style={{ maxWidth: 240 }} onClick={() => location.assign("/m")}>
          Reload
        </button>
      </main>
    );
  }
}

// Chrome/Android: keep the install prompt for the onboarding screen.
addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  (window as Window & { sureInstallPrompt?: Event }).sureInstallPrompt = event;
});

if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("/m/sw.js", { scope: "/m" }).catch(() => {}));
}

createRoot(document.getElementById("sure-mobile-root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
