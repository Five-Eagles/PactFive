import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import NotificationsDemo from "./index";

const root = document.getElementById("root");
if (!root) throw new Error("Notification preview root is missing.");
createRoot(root).render(<StrictMode><NotificationsDemo /></StrictMode>);
