import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// Self-hosted: the desktop CSP blocks Google Fonts, so a CDN link would
// silently fall back to the system font in built apps.
import "@fontsource-variable/inter";
import "./index.css";
import { initTrayBridge } from "./lib/tray";

// Outside React: the Pomodoro store and tray outlive every view and sign-in.
initTrayBridge();

createRoot(document.getElementById("root")!).render(<App />);
