import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Admin } from "./Admin";
import { WorkflowPrototype } from "./components/WorkflowPrototype";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {window.location.pathname === "/admin" ? <Admin /> : window.location.pathname === "/prototype" ? <WorkflowPrototype /> : <App />}
  </StrictMode>,
);
