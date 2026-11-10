import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#080b10",
        panel: "#10151d",
        line: "#222b37",
        mint: "#9ee7cb",
      },
      boxShadow: { glow: "0 0 60px rgba(110, 231, 183, .08)" },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui"] },
    },
  },
  plugins: [forms],
};
