import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import AmplifyProvider from "@/components/AmplifyProvider";
import ThemeProvider from "@/components/ThemeProvider";
import ToastProvider from "@/components/ui/ToastProvider";
import ConfirmProvider from "@/components/ui/ConfirmProvider";

export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#ffffff" },
        { media: "(prefers-color-scheme: dark)", color: "#0b0f16" },
    ],
};

export const metadata: Metadata = {
    metadataBase: new URL("https://menuvium.com"),
    title: {
        default: "Menuvium — QR menus, made modern",
        template: "%s — Menuvium",
    },
    description:
        "Create, edit, and publish QR menus with a calm, modern workflow. Import fast, ship beautiful themes, and add photoreal AR dishes from a short video — without reprinting.",
    applicationName: "Menuvium",
    alternates: {
        canonical: "/",
    },
    openGraph: {
        type: "website",
        url: "https://menuvium.com",
        title: "Menuvium — QR menus, made modern",
        description:
            "Create, edit, and publish QR menus with a calm, modern workflow. Import fast, ship beautiful themes, and add photoreal AR dishes from a short video — without reprinting.",
        siteName: "Menuvium",
    },
    twitter: {
        card: "summary_large_image",
        title: "Menuvium — QR menus, made modern",
        description:
            "Create, edit, and publish QR menus with a calm, modern workflow. Import fast, ship beautiful themes, and add photoreal AR dishes from a short video — without reprinting.",
    },
    icons: {
        icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
        shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
    },
};

const sans = Plus_Jakarta_Sans({
    subsets: ["latin"],
    variable: "--font-sans",
    display: "swap",
});

const heading = Space_Grotesk({
    subsets: ["latin"],
    variable: "--font-heading",
    display: "swap",
});

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
            <body className={`${sans.variable} ${heading.variable} antialiased`} suppressHydrationWarning>
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
