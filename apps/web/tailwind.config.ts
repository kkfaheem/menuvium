import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: "class",
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--cms-bg)",
                foreground: "var(--cms-text)",
                panel: "var(--cms-panel)",
                panelStrong: "var(--cms-panel-strong)",
                border: "var(--cms-border)",
                muted: "var(--cms-muted)",
                accent: "var(--cms-accent)",
                accentStrong: "var(--cms-accent-strong)",
                pill: "var(--cms-pill)",
            },
        },
    },
    plugins: [],
};
export default config;
