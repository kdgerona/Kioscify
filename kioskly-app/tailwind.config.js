/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
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