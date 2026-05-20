import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "peony-light": "#F2A7B3",
        "peony-default": "#E06D78",
        "peony-dark": "#A93344",
        "apollo-gold": "#E8B851",
        "nymph-bg": "#F7FAF9",
        "aphrodite-dark": "#4A2E35",
      },
      fontFamily: {
        display: ["var(--font-playfair)", "Playfair Display", "serif"],
        sans: ["var(--font-quicksand)", "Quicksand", "system-ui", "sans-serif"],
      },
      boxShadow: {
        blush: "0 0 24px 6px rgba(224, 109, 120, 0.55)",
        "blush-soft": "0 0 18px 2px rgba(242, 167, 179, 0.5)",
        petal: "0 8px 24px -8px rgba(74, 46, 53, 0.25)",
      },
      keyframes: {
        bloom: {
          "0%": { transform: "scale(0.4) rotate(-12deg)", opacity: "0" },
          "55%": { transform: "scale(1.08) rotate(4deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        blush: {
          "0%": { boxShadow: "0 0 0 0 rgba(224, 109, 120, 0)" },
          "30%": { boxShadow: "0 0 28px 10px rgba(224, 109, 120, 0.55)" },
          "100%": { boxShadow: "0 0 0 0 rgba(224, 109, 120, 0)" },
        },
        sway: {
          "0%, 100%": { transform: "translateY(0px) rotate(-1deg)" },
          "50%": { transform: "translateY(-4px) rotate(1deg)" },
        },
        floatUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        bloom: "bloom 1.6s ease-out forwards",
        blush: "blush 2s ease-out",
        sway: "sway 5s ease-in-out infinite",
        floatUp: "floatUp 0.35s ease-out",
        "spin-slow": "spin 7s linear infinite",
      },
      backdropBlur: {
        petal: "12px",
      },
    },
  },
  plugins: [],
};
export default config;
