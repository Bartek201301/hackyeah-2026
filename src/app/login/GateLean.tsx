"use client";

import { useEffect, useRef, type ReactNode } from "react";

const MAX_DEG = 4;

/**
 * Leans the gate a few degrees toward the pointer. Mouse/trackpad only and not under reduced motion;
 * one rAF loop that stops once settled, ignores the pointer while the panel is off-screen, and is a
 * plain static gate without JS.
 */
export function GateLean({ children }: { children: ReactNode }) {
  const ref = useRef<SVGGElement>(null);

  useEffect(() => {
    const gate = ref.current;
    const svg = gate?.ownerSVGElement;
    if (!gate || !svg) return;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let visible = false;
    let current = 0;
    let target = 0;
    let frame = 0;

    const tick = () => {
      current += (target - current) * 0.08;
      if (Math.abs(target - current) < 0.01) current = target;
      gate.style.transform = `rotate(${current.toFixed(2)}deg)`;
      frame = current === target || document.hidden ? 0 : requestAnimationFrame(tick);
    };
    const onMove = (event: PointerEvent) => {
      if (!visible || document.hidden) return;
      const box = svg.getBoundingClientRect();
      const offset = (event.clientX - (box.left + box.width / 2)) / (box.width / 2);
      target = Math.max(-1, Math.min(1, offset)) * MAX_DEG;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
    });

    observer.observe(svg);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <g ref={ref} className="flow-gate">
      {children}
    </g>
  );
}
