import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Stage accent colors, referenced by name in components.
        stage: {
          applied: "#64748b",
          responded: "#0ea5e9",
          screen: "#6366f1",
          interview: "#8b5cf6",
          final: "#a855f7",
          offer: "#10b981",
          rejected: "#ef4444",
          withdrawn: "#94a3b8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
