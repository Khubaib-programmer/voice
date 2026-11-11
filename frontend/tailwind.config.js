import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sand: "#E8DCC5",
        purple: "#8B5CF6",
        "warm-white": "#FAF8F2",
      },
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui"],
        display: ["Plus Jakarta Sans", "DM Sans", "ui-sans-serif", "system-ui"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [forms],
};
