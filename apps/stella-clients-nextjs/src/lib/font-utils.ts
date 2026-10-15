// Font size helper - multiplies base size by the global scale
// Example: fs(11) with scale 1.4 = calc(11px * 1.4) = 15.4px

export function fs(baseSize: number): string {
  return `calc(${baseSize}px * var(--font-scale, 1))`;
}
