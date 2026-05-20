import { type SVGProps } from "react";

/** Stylized peony bloom — used as logo + "seen" indicator. */
export function PeonyIcon({
  size = 24,
  glow = false,
  ...rest
}: { size?: number; glow?: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      style={glow ? { filter: "drop-shadow(0 0 6px rgba(224,109,120,0.65))" } : undefined}
      {...rest}
    >
      <g fill="currentColor">
        {/* outer petals */}
        <ellipse cx="24" cy="11" rx="6.5" ry="9" opacity=".85" />
        <ellipse cx="35" cy="18" rx="9" ry="6.5" opacity=".75" transform="rotate(35 35 18)" />
        <ellipse cx="35" cy="32" rx="9" ry="6.5" opacity=".7" transform="rotate(-35 35 32)" />
        <ellipse cx="24" cy="39" rx="6.5" ry="9" opacity=".85" />
        <ellipse cx="13" cy="32" rx="9" ry="6.5" opacity=".7" transform="rotate(35 13 32)" />
        <ellipse cx="13" cy="18" rx="9" ry="6.5" opacity=".75" transform="rotate(-35 13 18)" />
        {/* inner */}
        <circle cx="24" cy="24" r="6" opacity=".95" />
        <circle cx="24" cy="24" r="2.4" fill="#F7FAF9" opacity=".9" />
      </g>
    </svg>
  );
}

