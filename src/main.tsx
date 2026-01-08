import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Apply theme before React renders to prevent flash
const savedTheme = localStorage.getItem('mai-theme-preference') || 'system';
const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const effectiveTheme = savedTheme === 'system' ? (systemDark ? 'dark' : 'light') : savedTheme;
document.documentElement.classList.add(effectiveTheme);

createRoot(document.getElementById("root")!).render(<App />);
