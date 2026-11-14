import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import CommandBox from "./components/CommandBox";
// Self-hosted: the desktop CSP blocks Google Fonts, so a CDN link would
// silently fall back to the system font in built apps.
import "@fontsource-variable/inter";
// The Terminal's typeface, bundled rather than taken from the machine so the
// packaged app renders it whether or not Windows Terminal is installed. Only
// the subsets a shell actually draws: latin, latin-ext, and symbols2, which
// holds the box-drawing block (U+2500-259F) that TUIs use for borders.
import "@fontsource/cascadia-mono/latin-400.css";
import "@fontsource/cascadia-mono/latin-700.css";
import "@fontsource/cascadia-mono/latin-ext-400.css";
import "@fontsource/cascadia-mono/latin-ext-700.css";
import "@fontsource/cascadia-mono/symbols2-400.css";
import "@fontsource/cascadia-mono/symbols2-700.css";
import "./index.css";
import { initTrayBridge } from "./lib/tray";
import { initNotificationBridges } from "./lib/notifications";
import { startAppActivity } from "./lib/appActivity";
import { installGlobalErrorHandlers } from "./lib/diagnostics";
import { installButtonFx } from "./lib/buttonFx";
import { installCardGlow } from "./lib/cardGlow";

// First, so errors thrown while the rest starts up are logged too.
installGlobalErrorHandlers();

// The desktop command box is a second window on this same page (set by
// src-tauri/src/command_box.rs). It renders only the box and starts none of
// the bridges, which belong to the main window.
if ((window as { __CRYSTAL_COMMAND_BOX__?: boolean }).__CRYSTAL_COMMAND_BOX__) {
  createRoot(document.getElementById("root")!).render(<CommandBox />);
} else {
  // Outside React: the Pomodoro store and tray outlive every view and sign-in.
  initTrayBridge();
  // Pomodoro phase and Portal unread toasts, for the same reason.
  initNotificationBridges();
  // Pauses animation and polling while the window is hidden.
  startAppActivity();
  installButtonFx();
  installCardGlow();

  createRoot(document.getElementById("root")!).render(<App />);
}
