/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: {
    colors: { ink: '#080d12', surface: '#101820', line: '#1d2a32', mint: '#45d6ad', coral: '#ff776f', lime: '#b8f36b' },
    fontFamily: { sans: ['var(--font-sans)', 'sans-serif'], mono: ['var(--font-mono)', 'monospace'] },
    boxShadow: { glow: '0 0 28px rgba(69,214,173,.08)' }
  } },
  plugins: [],
};
