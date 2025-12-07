import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./contexts/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "#ea580c",
          orange: "#ea580c",
        },
        secondary: {
          DEFAULT: "#fb923c",
          gold: "#fb923c",
        },
        accent: {
          DEFAULT: "#fdba74",
          yellow: "#fdba74",
        },
      },
    },
  },
  plugins: [],
};
export default config;
