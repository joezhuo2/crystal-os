import { createRoot } from "react-dom/client";
import App from "./App.tsx";
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
import { startAppActivity } from "./lib/appActivity";

// Outside React: the Pomodoro store and tray outlive every view and sign-in.
initTrayBridge();
// Pauses animation and polling while the window is hidden.
startAppActivity();

createRoot(document.getElementById("root")!).render(<App />);
