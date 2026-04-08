// Centralized Design System Configuration
// Import this in all pages for consistent styling

export const COLORS = {
  bg: "#0B0D11",
  surface: "#12151C",
  surfaceAlt: "#0E111A",
  surfaceHov: "#161B26",
  border: "#1C2338",
  borderSub: "#161B28",
  green: "#00E5A0",
  greenDim: "#00E5A012",
  greenMid: "#00E5A035",
  red: "#F04F59",
  redDim: "#F04F5912",
  redMid: "#F04F5935",
  amber: "#F59E0B",
  amberDim: "#F59E0B12",
  amberMid: "#F59E0B35",
  blue: "#3B82F6",
  blueDim: "#3B82F612",
  blueMid: "#3B82F635",
  purple: "#A78BFA",
  purpleDim: "#A78BFA12",
  cyan: "#06B6D4",
  cyanDim: "#06B6D412",
  textPri: "#C8CDE0",
  textMid: "#6B7590",
  textMuted: "#4A5578",
  textDim: "#2A3050",
  sidebar: "#0E111A",
} as const;

export const FONT_FAMILY = "'JetBrains Mono','Fira Code',monospace";

// Font size mapping for semantic names
// These will be multiplied by the scale from FontContext
export const FONT_SIZES = {
  xs: "xs",      // Labels, meta text (9-11px depending on scale)
  sm: "sm",      // Small text, secondary info (10-12px)
  base: "base",  // Body text, default (11-13px)
  md: "md",      // Emphasized text (12-14px)
  lg: "lg",      // Subheadings (14-16px)
  xl: "xl",      // Headings (18-22px)
  xxl: "xxl",    // Large numbers, hero text (22-26px)
} as const;

export type FontSize = keyof typeof FONT_SIZES;
