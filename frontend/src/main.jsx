import React from "react";
import { createRoot } from "react-dom/client";
import Home from "./RefHome.jsx";
import "./ref-landing.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>
);
