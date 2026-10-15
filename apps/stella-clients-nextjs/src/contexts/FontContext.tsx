"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type FontScale = "compact" | "normal" | "comfortable" | "large";

interface FontConfig {
  scale: FontScale;
  multiplier: number;
  family: string;
}

// Scale multipliers - each multiplies the base font size
const FONT_SCALE_MULTIPLIERS: Record<FontScale, number> = {
  compact: 0.85,      // 85% of base size
  normal: 1.0,        // 100% (default)
  comfortable: 1.2,   // 120%
  large: 1.4,         // 140%
};

interface FontContextType {
  config: FontConfig;
  setScale: (scale: FontScale) => void;
  multiplier: number;
}

const FontContext = createContext<FontContextType | undefined>(undefined);

export function FontProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState<FontScale>("normal");

  // Load font scale from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("stella-font-scale");
    if (saved && (saved === "compact" || saved === "normal" || saved === "comfortable" || saved === "large")) {
      setScaleState(saved);
    }
  }, []);

  const setScale = (newScale: FontScale) => {
    setScaleState(newScale);
    localStorage.setItem("stella-font-scale", newScale);
  };

  const config: FontConfig = {
    scale,
    multiplier: FONT_SCALE_MULTIPLIERS[scale],
    family: "'JetBrains Mono','Fira Code',monospace",
  };

  return (
    <FontContext.Provider value={{ config, setScale, multiplier: config.multiplier }}>
      {children}
    </FontContext.Provider>
  );
}

export function useFont() {
  const context = useContext(FontContext);
  if (context === undefined) {
    throw new Error("useFont must be used within a FontProvider");
  }
  return context;
}
