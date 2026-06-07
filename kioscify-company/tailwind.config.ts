import type { Config } from "tailwindcss";
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary:   { DEFAULT: "#ea580c" },
        secondary: { DEFAULT: "#fb923c" },
        accent:    { DEFAULT: "#fdba74" },
      },
    },
  },
  plugins: [],
};
export default config;
