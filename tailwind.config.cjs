const { fontFamily } = require("tailwindcss/defaultTheme");

/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./public/**/*.{html,js}", "./functions/**/*.js"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Segoe UI"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Noto Sans SC"',
          ...fontFamily.sans,
        ],
        display: ['"Century Gothic"', '"Avenir Next"', ...fontFamily.sans],
      },
      colors: {
        primary: {
          50: "#f7ffe6",
          500: "#9cff00",
          600: "#7fd600",
        },
        secondary: {
          50: "#ffffff",
          500: "#111111",
          900: "#050505",
        },
        neutral: {
          100: "#f4f4f4",
          300: "#cfcfcf",
          500: "#8f8f8f",
          700: "#3a3a3a",
          900: "#151515",
        },
        page: {
          ink: "#111111",
          paper: "#f4f2ec",
        },
      },
      borderRadius: {
        panel: "0",
      },
      screens: {
        "2xl": "1400px",
        "tall-sm": { raw: "(min-height: 640px)" },
        "tall-md": { raw: "(min-height: 768px)" },
        "tall-lg": { raw: "(min-height: 1024px)" },
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        "fade-in-down": {
          "0%": { opacity: "0", transform: "translateY(-30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in-down-normal": "fade-in-down 0.8s ease-in-out forwards",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
  ],
};
