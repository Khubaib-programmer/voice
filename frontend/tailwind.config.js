import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#E8DCC5",
        panel: "#FAF8F2",
        line: "#D4C6AE",
        mint: "#174D38",
        forest: "#174D38",
        sand: "#E8DCC5",
        purple: "#8B5CF6",
        "purple-dark": "#5B21B6",
        "deep-green": "#103A2B",
        "warm-white": "#FAF8F2",
        charcoal: "#242424",
        muted: "#514A40",
        subtle: "#685F53",
        error: "#8B2E27",
        slate: {
          100: "#242424",
          200: "#2E2B26",
          300: "#3D382F",
          400: "#514A40",
          500: "#5D564B",
          600: "#685F53",
          700: "#514A40",
        },
      },
      boxShadow: { glow: "0 12px 36px rgba(23, 77, 56, .10)" },
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui"],
        display: ["Plus Jakarta Sans", "DM Sans", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [forms],
};
