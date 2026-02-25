import type { Metadata } from "next";
import "./globals.css";
import AmplifyProvider from "@/components/AmplifyProvider";
import ThemeProvider from "@/components/ThemeProvider";
import ToastProvider from "@/components/ui/ToastProvider";
import ConfirmProvider from "@/components/ui/ConfirmProvider";

export const metadata: Metadata = {
    title: "Menuvium",
    description: "Dynamic QR Menu SaaS",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const themeInitScript = `
(() => {
  try {
    const storageKey = "menuvium-theme";
    const legacyKey = "menuvium_cms_theme";
    const stored = localStorage.getItem(storageKey) || localStorage.getItem(legacyKey);
    const theme = stored || "system";
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    let effectiveTheme = theme;
    if (theme === "system") {
      effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    if (effectiveTheme !== "light" && effectiveTheme !== "dark") effectiveTheme = "light";
    root.classList.add(effectiveTheme);
    root.dataset.cmsTheme = effectiveTheme;
  } catch {}
})();
`;

    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
            </head>
            <body suppressHydrationWarning>
                <ThemeProvider defaultTheme="system">
                    <ToastProvider>
                        <ConfirmProvider>
                            <AmplifyProvider>
                                {children}
                            </AmplifyProvider>
                        </ConfirmProvider>
                    </ToastProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
