"use client";

import { CSSProperties, ReactNode } from "react";
import { useFont } from "@/contexts/FontContext";
import { COLORS, FONT_FAMILY, FontSize } from "@/lib/design-system";

interface TextProps {
  size?: FontSize;
  color?: string;
  weight?: number;
  caps?: boolean;
  style?: CSSProperties;
  children: ReactNode;
  className?: string;
}

// Main text component - use this for all text
export function M({
  size = "base",
  color = COLORS.textPri,
  weight = 500,
  caps = false,
  style = {},
  children,
  className,
}: TextProps) {
  const { sizes } = useFont();

  // Map semantic size to actual pixel size from context
  const fontSize = sizes[size as keyof typeof sizes];

  return (
    <span
      className={className}
      style={{
        fontFamily: FONT_FAMILY,
        fontSize,
        color,
        fontWeight: weight,
        letterSpacing: caps ? "0.11em" : "0.03em",
        textTransform: caps ? "uppercase" : "none",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// Label component - for form labels and metadata
export function Lbl({
  children,
  color = COLORS.textMuted,
  style = {},
  className,
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <M
      size="xs"
      color={color}
      weight={600}
      caps
      style={{ letterSpacing: "0.13em", ...style }}
      className={className}
    >
      {children}
    </M>
  );
}

// Heading component
export function Heading({
  level = 1,
  children,
  style = {},
  className,
}: {
  level?: 1 | 2 | 3 | 4;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  const sizeMap: Record<number, FontSize> = {
    1: "xl",
    2: "lg",
    3: "md",
    4: "base",
  };

  const weightMap: Record<number, number> = {
    1: 700,
    2: 700,
    3: 600,
    4: 600,
  };

  return (
    <M
      size={sizeMap[level]}
      weight={weightMap[level]}
      style={{ letterSpacing: "0.04em", ...style }}
      className={className}
    >
      {children}
    </M>
  );
}

// Stat value component - for large numbers
export function StatValue({
  children,
  color = COLORS.textPri,
  style = {},
  className,
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <M
      size="xxl"
      color={color}
      weight={700}
      style={{ lineHeight: 1, ...style }}
      className={className}
    >
      {children}
    </M>
  );
}
