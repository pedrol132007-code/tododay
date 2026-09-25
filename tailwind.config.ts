import type { Config } from "tailwindcss";

// Cores vêm de variáveis CSS (src/index.css), uma versão para o tema claro e outra para o escuro.
// Canais RGB soltos para os modificadores de opacidade (bg-danger/10) continuarem funcionando.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "bg-base": token("bg-base"),
        "bg-surface": token("bg-surface"),
        "bg-elevated": token("bg-elevated"),
        "bg-column": token("bg-column"),
        "bg-card": token("bg-card"),
        primary: token("primary"),
        danger: token("danger"),
        highlight: token("highlight"),
        "on-accent": token("on-accent"),
        "text-primary": token("text-primary"),
        "text-muted": token("text-muted"),
        border: token("border"),
      },
      fontFamily: {
        sans: ["Montserrat", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Cantos quase retos, como no site da Benner (0.3rem nos botões).
      borderRadius: {
        lg: "0.25rem",
        xl: "0.375rem",
        "2xl": "0.5rem",
      },
      boxShadow: {
        card: "0 4px 12px rgb(0 0 0 / 0.08)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(90deg, #2538ff 0%, #8a2be2 50%, #e51e47 100%)",
        "brand-hero": "radial-gradient(120% 140% at 85% 15%, #e51e47 0%, #b8206a 35%, #5a2fd6 65%, #2538ff 100%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
