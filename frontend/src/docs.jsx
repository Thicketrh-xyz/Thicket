import React from "react";
import { createRoot } from "react-dom/client";
import { Docs } from "./components/Docs.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Docs />
  </React.StrictMode>
);
