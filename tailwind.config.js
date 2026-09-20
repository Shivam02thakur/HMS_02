/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep teal primary — clinical but warmer than the old default blue.
        primary: {
          50: '#eefbfa',
          100: '#d4f3f0',
          200: '#aae6e1',
          300: '#75d2cc',
          400: '#43b6b0',
          500: '#2a9691',
          600: '#217b78',
          700: '#1e6462',
          800: '#1c5150',
          900: '#1a4443',
        },
        medical: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        // Soft violet accent used sparingly for highlights/badges — adds
        // personality without competing with the primary teal.
        accent: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          600: '#7c5cd6',
          700: '#6947b8',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          600: '#d69411',
          700: '#a86308',
        },
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
}
