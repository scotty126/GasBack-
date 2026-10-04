/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gb: {
          // Solid colours — plain CSS variable (no opacity modifier needed)
          bg:       'var(--gb-bg)',
          surface:  'var(--gb-surface)',
          elevated: 'var(--gb-elevated)',
          border:   'var(--gb-border)',
          text:     'var(--gb-text)',
          'text-muted': 'var(--gb-text-muted)',

          // Brand greens — use RGB channels so bg-gb-green/10 etc. work correctly
          green:        'rgb(var(--gb-green-rgb) / <alpha-value>)',
          'green-dark': 'rgb(var(--gb-gd-rgb)   / <alpha-value>)',
          'green-dim':  'rgb(var(--gb-gdim-rgb)  / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'green-radial': 'radial-gradient(ellipse at top, #16a34a 0%, #0b1a10 70%)',
      },
    },
  },
  plugins: [],
};
