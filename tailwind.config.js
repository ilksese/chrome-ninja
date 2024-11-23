/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{tsx,html}"],
  important: "#root",
  theme: {
    extend: {}
  },
  corePlugins: {
    preflight: false
  },
  plugins: ['prettier-plugin-tailwindcss']
}
