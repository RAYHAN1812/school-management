/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dae6ff',
          200: '#bdd3ff',
          300: '#90b7ff',
          400: '#5c8ffd',
          500: '#3767f8',
          600: '#2149ed',
          700: '#1a37d9',
          800: '#1c2fb0',
          900: '#1d2e8a',
          950: '#161d54',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.05), 0 1px 3px rgba(16, 24, 40, 0.06)',
      },
    },
  },
  plugins: [],
};
