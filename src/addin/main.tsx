import React from "react";
import ReactDOM from "react-dom/client";
import { AddIn } from "./AddIn";
import "../styles.css";

declare const Office: { onReady: (cb: (info: { host?: string }) => void) => Promise<unknown> } | undefined;
const mount = (inExcel: boolean) => ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><AddIn inExcel={inExcel} /></React.StrictMode>);
// Hors d'Excel (navigateur normal), Office.onReady ne répond jamais : on affiche un message au lieu d'attendre.
if (typeof Office === "undefined") mount(false);
else { let done = false; void Office.onReady((i) => { done = true; mount(i.host === "Excel"); }); window.setTimeout(() => { if (!done) mount(false); }, 4000); }
