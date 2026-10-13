import type { Config } from "tailwindcss";

// "Claim form" look: ink-blue on pale form paper, square corners, a red
// stamp for the moment something is logged. The slate scale is remapped to
// an ink-tinted grey so every existing slate-* class picks up the look.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#12324a",
          dark: "#0a2236",
        },
        paper: {
          DEFAULT: "#e9f0ee",
          line: "#d6e3df",
          field: "#f6faf9",
        },
        stamp: "#b3123b",
        slate: {
          50: "#f3f7f6",
          100: "#e6eeec",
          200: "#cfdcd9",
          300: "#b0c3c1",
          400: "#7f9699",
          500: "#5a7178",
          600: "#3f5866",
          700: "#2b4557",
          800: "#1b3446",
          900: "#12283a",
          950: "#0b1a27",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Arial Narrow", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
    // Forms have square corners. Pills (rounded-full) stay round.
    borderRadius: {
      none: "0",
      sm: "1px",
      DEFAULT: "2px",
      md: "2px",
      lg: "2px",
      xl: "3px",
      "2xl": "3px",
      "3xl": "4px",
      full: "9999px",
    },
  },
  plugins: [],
};

export default config;
