import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "bg-base": "#16121f",
        "bg-surface": "#1f1a2e",
        "bg-elevated": "#2a2340",
        "accent-purple": "#a78bfa",
        "accent-pink": "#f0a6c4",
        "accent-yellow": "#f5d68a",
        "text-primary": "#f2eef9",
        "text-muted": "#a99fc2",
        border: "#35304a",
      },
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
