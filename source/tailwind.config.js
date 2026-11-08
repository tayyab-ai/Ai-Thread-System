/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class', // we toggle `.dark` on our own wrapper based on the host page's background
  theme: { extend: {} },
};
