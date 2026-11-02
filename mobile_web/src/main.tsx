import { Component, type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./App";
import { queryClient } from "./lib/query";
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
      <div className="app">
        <header className="header">
          <div className="header-bar">
            <span className="wordmark" style={{ margin: "0 auto" }}>
              Sure
            </span>
          </div>
        </header>
        <main className="page" style={{ flex: 1, justifyContent: "center" }}>
          <h1 className="display" style={{ fontSize: 30, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ margin: 0, color: "var(--ink-2)" }}>Your data is safe on your server. Reloading usually fixes this.</p>
          <button className="btn primary pressable" onClick={() => location.assign("/m")}>
            Reload
          </button>
        </main>
      </div>
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
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);

