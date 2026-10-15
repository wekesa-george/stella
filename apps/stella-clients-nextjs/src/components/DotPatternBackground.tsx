"use client";

import { useEffect, useRef } from "react";

export function DotPatternBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setCanvasSize();
    window.addEventListener("resize", setCanvasSize);

    // Dot configuration
    const dotSpacing = 30;
    const dotRadius = 1.5;
    const glowRadius = 80;
    const waveSpeed = 0.001;
    const waveAmplitude = 0.3;

    // Mouse position
    let mouseX = -1000;
    let mouseY = -1000;
    let time = 0;

    // Track mouse movement
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Calculate dots grid
    const cols = Math.ceil(canvas.width / dotSpacing) + 1;
    const rows = Math.ceil(canvas.height / dotSpacing) + 1;

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += waveSpeed;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * dotSpacing;
          const y = row * dotSpacing;

          // Calculate distance from mouse
          const dx = mouseX - x;
          const dy = mouseY - y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Mouse glow effect
          let glowIntensity = 0;
          if (distance < glowRadius) {
            glowIntensity = 1 - distance / glowRadius;
          }

          // Ambient wave effect
          const waveOffset = Math.sin(x * 0.01 + time * 50) * Math.cos(y * 0.01 + time * 50);
          const waveIntensity = (waveOffset + 1) * 0.5 * waveAmplitude;

          // Combined intensity
          const totalIntensity = Math.max(glowIntensity, waveIntensity);

          // Color interpolation between base and glow
          const baseColor = { r: 26, g: 35, b: 64 }; // #1a2340
          const glowColor = { r: 0, g: 229, b: 160 }; // #00e5a0

          const r = Math.round(baseColor.r + (glowColor.r - baseColor.r) * totalIntensity);
          const g = Math.round(baseColor.g + (glowColor.g - baseColor.g) * totalIntensity);
          const b = Math.round(baseColor.b + (glowColor.b - baseColor.b) * totalIntensity);

          // Opacity calculation
          const baseOpacity = 0.2;
          const glowOpacity = 0.8;
          const opacity = baseOpacity + (glowOpacity - baseOpacity) * totalIntensity;

          // Draw dot
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
          ctx.fill();

          // Add extra glow for mouse proximity
          if (glowIntensity > 0.5) {
            ctx.beginPath();
            ctx.arc(x, y, dotRadius * 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, ${
              glowIntensity * 0.3
            })`;
            ctx.fill();
          }
        }
      }

      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", setCanvasSize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
