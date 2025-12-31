import type { Metadata } from "next";
import "./globals.css";
import AmplifyProvider from "@/components/AmplifyProvider";

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
                <AmplifyProvider>
                    {children}
                </AmplifyProvider>
            </body>
        </html>
    );
}
