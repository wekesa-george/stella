"use client";

import { FontProvider, useFont } from "@/contexts/FontContext";
import { ReactNode, useEffect } from "react";

function FontInjector({ children }: { children: ReactNode }) {
  const { multiplier } = useFont();

  useEffect(() => {
    // Inject CSS variable for font scale multiplier
    document.documentElement.style.setProperty('--font-scale', multiplier.toString());
  }, [multiplier]);

  return <>{children}</>;
}

export function ClientWrapper({ children }: { children: ReactNode }) {
  return (
    <FontProvider>
      <FontInjector>{children}</FontInjector>
    </FontProvider>
  );
}
