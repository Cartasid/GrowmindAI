import type { Config } from "tailwindcss";
import animatePlugin from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "brand-dark": "#05070B",
        "brand-ink": "#0B1120",
        "brand-cyan": "#2FE6FF",
        "brand-blue": "#4C7DFF",
        "brand-purple": "#6C5BFF",
        "brand-orange": "#FF8A3D",
        "brand-red": "#FF3B5C",
        "brand-glass": "rgba(10, 14, 26, 0.72)",
        "glass-bg": "rgba(12, 18, 32, 0.74)",
        "cult-dark": "#05070B",
        "cult-ink": "#0B1120",
        "grow-cyan": "#35D7FF",
        "grow-violet": "#6C5BFF",
        "grow-indigo": "#4B63FF",
        "grow-lime": "#48FF8A",
        "grow-blue": "#4C88FF"
      },
      fontFamily: {
        body: ["Sora", "system-ui", "sans-serif"],
        grotesk: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "Courier New",
          "monospace"
        ]
      },
      keyframes: {
        glow: {
          "0%, 100%": {
            boxShadow:
              "0 0 0 rgba(47,230,255,0.0), 0 0 20px rgba(47,230,255,0.16), inset 0 0 18px rgba(108,91,255,0.12)",
          },
          "50%": {
            boxShadow:
              "0 0 0 rgba(47,230,255,0.0), 0 0 32px rgba(47,230,255,0.26), inset 0 0 24px rgba(108,91,255,0.16)",
          },
        },
        "pulse-glow": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 rgba(255,138,61,0.0), 0 0 18px rgba(255,138,61,0.2), 0 0 44px rgba(255,138,61,0.12)",
          },
          "50%": {
            boxShadow:
              "0 0 0 rgba(255,138,61,0.0), 0 0 28px rgba(255,138,61,0.34), 0 0 64px rgba(255,138,61,0.18)",
          },
        },
      },
      animation: {
        glow: "glow 2.6s ease-in-out infinite",
        "pulse-glow": "pulse-glow 1.6s ease-in-out infinite",
      },
      boxShadow: {
        neon: "0 24px 64px rgba(47,230,255,0.18)",
        "neon-soft": "0 14px 36px rgba(108,91,255,0.24)",
        "glass-inner": "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -16px 40px rgba(0,0,0,0.45)",
        "brand-glow": "0 0 18px rgba(47,230,255,0.18), 0 0 38px rgba(108,91,255,0.18)",
        "warning-glow": "0 0 18px rgba(255,138,61,0.2), 0 0 46px rgba(255,138,61,0.12)",
        "alarm-glow": "0 0 18px rgba(255,59,92,0.22), 0 0 56px rgba(255,59,92,0.16)",
      },
      backgroundImage: {
        "grid-mask": "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
        "grow-gradient":
          "radial-gradient(circle at 20% 0%, rgba(47,230,255,0.22), transparent 55%), radial-gradient(circle at 80% 20%, rgba(108,91,255,0.22), transparent 55%)",
        "brand-gradient": "linear-gradient(135deg, #2FE6FF 0%, #4C7DFF 45%, #6C5BFF 100%)",
      }
    }
  },
  plugins: [animatePlugin]
};

export default config;
