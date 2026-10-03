import type { CSSProperties } from "react";
import { GateLean } from "./GateLean";

type Chip = {
  outcome: "pass" | "stop" | "hold";
  /** Negative, so the loop is already mid-flow on first paint. */
  delay: number;
  /** Reduced-motion frame: x offset and colour. */
  sx: number;
  sf: "success" | "danger" | "warning" | "border-strong";
};

// 5 pass / 2 stop / 1 held — a picture of the idea, not a measurement.
const chips: Chip[] = [
  { outcome: "pass", delay: 0, sx: 320, sf: "success" },
  { outcome: "pass", delay: -7.5, sx: 90, sf: "border-strong" },
  { outcome: "stop", delay: -3, sx: 174, sf: "danger" },
  { outcome: "pass", delay: -10.5, sx: 360, sf: "success" },
  { outcome: "hold", delay: -5.5, sx: 214, sf: "warning" },
  { outcome: "pass", delay: -1.5, sx: 40, sf: "border-strong" },
  { outcome: "pass", delay: -9, sx: 290, sf: "success" },
  { outcome: "stop", delay: -4.5, sx: 174, sf: "danger" },
];

const laneY = (index: number) => 105 + index * 50;

/** Decorative login panel: requests drift toward the gateway and are passed, stopped or held. */
export function GatewayFlow() {
  return (
    <svg
      viewBox="0 0 400 560"
      className="size-full"
      aria-hidden
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      {chips.map((_, index) => (
        <line
          key={index}
          x1="0"
          x2="400"
          y1={laneY(index)}
          y2={laneY(index)}
          stroke="var(--color-border)"
          strokeDasharray="2 8"
          strokeLinecap="round"
        />
      ))}
      {chips.map((chip, index) => (
        <circle
          key={index}
          cx="10"
          cy={laneY(index)}
          r="6"
          className={`flow-chip flow-${chip.outcome}`}
          style={
            {
              animationDelay: `${chip.delay}s`,
              "--sx": `${chip.sx}px`,
              "--sy": chip.outcome === "hold" ? "30px" : "0px",
              "--sf": `var(--color-${chip.sf})`,
            } as CSSProperties
          }
        />
      ))}
      <GateLean>
        <rect
          x="190"
          y="60"
          width="20"
          height="440"
          rx="10"
          fill="var(--color-surface)"
          stroke="var(--color-border-strong)"
        />
        <rect
          x="193"
          y="276"
          width="14"
          height="8"
          rx="4"
          fill="var(--color-fg)"
          opacity="0.18"
          className="flow-scan"
        />
      </GateLean>
    </svg>
  );
}
