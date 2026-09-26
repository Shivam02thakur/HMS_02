/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surface tokens: CSS variables so light/dark are two designed
        // palettes (set in src/index.css), not one inverted automatically.
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--c-surface-muted) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--c-ink-muted) / <alpha-value>)',
        'ink-subtle': 'rgb(var(--c-ink-subtle) / <alpha-value>)',
        // Status tokens (bg/fg pairs). Values chosen so every pair meets
        // WCAG AA (4.5:1) in both light and dark -- see src/index.css.
        success: { bg: 'rgb(var(--c-success-bg) / <alpha-value>)', fg: 'rgb(var(--c-success-fg) / <alpha-value>)' },
        caution: { bg: 'rgb(var(--c-caution-bg) / <alpha-value>)', fg: 'rgb(var(--c-caution-fg) / <alpha-value>)' },
        danger: { bg: 'rgb(var(--c-danger-bg) / <alpha-value>)', fg: 'rgb(var(--c-danger-fg) / <alpha-value>)' },
        info: { bg: 'rgb(var(--c-info-bg) / <alpha-value>)', fg: 'rgb(var(--c-info-fg) / <alpha-value>)' },
        neutral: { bg: 'rgb(var(--c-neutral-bg) / <alpha-value>)', fg: 'rgb(var(--c-neutral-fg) / <alpha-value>)' },
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
        // Per-section corner language: sharp KPI cards, soft chart cards,
        // balanced alert banners -- matching the approved dashboard design.
        kpi: '0.375rem',
        chart: '1.25rem',
        alert: '0.75rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
}
