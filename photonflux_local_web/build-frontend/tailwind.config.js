/** @type {import('tailwindcss').Config} */
module.exports = {
safelist: [
  { pattern: /(container|grid|flex|inline-flex|block|hidden)/ },
  { pattern: /(col|row)-(auto|\d{1,2})/ },
  { pattern: /(gap|space)-(x|y)?-(px|0|1|2|3|4|6|8|10|12)/ },
  { pattern: /(p|px|py|pt|pr|pb|pl)-(0|0\.5|1|2|3|4|6|8|10|12)/ },
  { pattern: /(m|mx|my|mt|mr|mb|ml)-(0|0\.5|1|2|3|4|6|8|10|12)/ },
  { pattern: /w-(full|screen|\d+\/\d+|auto)/ },
  { pattern: /h-(full|screen|auto)/ },
  { pattern: /(text|leading|tracking)-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)/ },
  { pattern: /(font|font)-(sans|serif|mono|bold|semibold|medium)/ },
  { pattern: /(text)-(left|center|right|justify)/ },
  { pattern: /(bg|text|border)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900)/ },
  { pattern: /(bg|text|border)-(white|black)/ },
  { pattern: /(rounded(-(sm|md|lg|xl|2xl|3xl))?|rounded-(none|full))/ },
  { pattern: /(shadow(-(sm|md|lg|xl|2xl))?)/ },
  { pattern: /(hover|focus|active|disabled):.*/ },
],

  content: ["./index.html","./src/**/*.{js,ts,jsx,tsx}","./**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
        mono: ['ui-monospace','Menlo','monospace'],
      },
        colors: {
          bg: '#0b1220',
          card: '#101827',
          border: '#1e2a44',
          muted: '#9aa6bd',
          text: { DEFAULT: '#e8eef9', strong: '#cfe1ff' },
          accent: { DEFAULT: '#7c4dff', soft: '#6d28d9', glow: '#b794f4' },
          brand: {
            a: '#8b5cf6', // vibrant violet for key highlights
            b: '#22d3ee', // luminous teal for accents
            c: '#facc15', // warm highlight for gradient transitions
          },
          danger: '#ef4444', success: '#22c55e', warn: '#eab308',
        },
      boxShadow: {
        glow: '0 0 0 3px rgba(124,77,255,0.25)',
        'inner-strong': 'inset 0 1px 0 0 rgba(255,255,255,0.08)',
      },
      backdropBlur: { xs: '2px' },
      keyframes: {
        'pulse-border': {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(124,77,255,0)' },
          '50%': { boxShadow: '0 0 0 3px rgba(124,77,255,0.6)' },
        },
      },
      animation: { 'pulse-border': 'pulse-border 0.7s ease-out' },
    },
  },
  plugins: [],
};
