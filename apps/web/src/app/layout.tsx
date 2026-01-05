import type { Metadata } from "next";
import "./globals.css";
import AmplifyProvider from "@/components/AmplifyProvider";
import ThemeProvider from "@/components/ThemeProvider";

export const metadata: Metadata = {
    title: "Menuvium",
    description: "Dynamic QR Menu SaaS",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body suppressHydrationWarning>
                <ThemeProvider defaultTheme="system">
                    <AmplifyProvider>
                        {children}
                    </AmplifyProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
