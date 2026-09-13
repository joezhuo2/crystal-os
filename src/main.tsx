import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initTrayBridge } from "./lib/tray";

// Outside React: the Pomodoro store and tray outlive every view and sign-in.
initTrayBridge();

createRoot(document.getElementById("root")!).render(<App />);
