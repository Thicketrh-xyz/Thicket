import React from "react";
import { createRoot } from "react-dom/client";
import Nodes from "./Nodes.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Nodes />
  </React.StrictMode>
);
