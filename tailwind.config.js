/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"], // include all your source files
  darkMode: "class",
  theme: {
    extend: {},
  },
  plugins: [require("tailwindcss-animate")],
};
