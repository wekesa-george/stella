"use client";

import { useFont } from "@/contexts/FontContext";
import { useEffect, useState } from "react";

export function FontDebug() {
  const { config, multiplier } = useFont();
  const [cssVar, setCssVar] = useState("");

  useEffect(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--font-scale');
    setCssVar(value);
  }, [multiplier]);

  return (
    <div style={{
      position: "fixed",
      bottom: 20,
      right: 20,
      background: "#000",
      color: "#0f0",
      padding: "10px",
      fontFamily: "monospace",
      fontSize: "10px",
      borderRadius: "4px",
      zIndex: 9999,
      border: "1px solid #0f0"
    }}>
      <div>Scale: {config.scale}</div>
      <div>Multiplier: {multiplier}</div>
      <div>CSS Var: {cssVar || "NOT SET"}</div>
      <div style={{ fontSize: "calc(12px * var(--font-scale, 1))", marginTop: "5px" }}>
        Test Text (12px base)
      </div>
    </div>
  );
}
