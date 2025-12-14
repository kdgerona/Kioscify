/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF9B00',
          orange: '#FF9B00',
        },
        secondary: {
          DEFAULT: '#FFC900',
          gold: '#FFC900',
        },
        accent: {
          DEFAULT: '#FFE100',
          yellow: '#FFE100',
        },
        light: {
          DEFAULT: '#EBE389',
          cream: '#EBE389',
        },
      },
    },
  },
  plugins: [],
}