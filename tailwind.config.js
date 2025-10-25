/** @type {import('tailwindcss').Config} */
export default {
  // IMPORTANT: This 'content' array must list all files that use Tailwind classes.
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Assumes your React components are in the 'src' folder
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}