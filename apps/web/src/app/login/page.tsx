"use client";

import { Authenticator, ThemeProvider, useAuthenticator, View } from "@aws-amplify/ui-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Fraunces, Space_Grotesk } from "next/font/google";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["600", "700"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"] });

export default function LoginPage() {
    const router = useRouter();
    const { authStatus } = useAuthenticator(context => [context.authStatus]);
    const { resolvedTheme } = useTheme();

    useEffect(() => {
        if (authStatus !== 'authenticated') return;
        // Always redirect to mode selection page after login
        router.push("/dashboard/mode");
    }, [authStatus, router]);

    const isConfigured = process.env.NEXT_PUBLIC_USER_POOL_ID && process.env.NEXT_PUBLIC_USER_POOL_ID !== 'us-east-1_dummy';
    const hasOAuth = Boolean(process.env.NEXT_PUBLIC_COGNITO_DOMAIN);

    const amplifyTheme = useMemo(() => {
        const isDark = resolvedTheme === "dark";
        const base = isDark
            ? {
                fontPrimary: "#f6f3ee",
                fontSecondary: "rgba(246, 243, 238, 0.62)",
                border: "rgba(255, 255, 255, 0.12)",
                backgroundPrimary: "#12131a",
                backgroundSecondary: "#0b0c10"
            }
            : {
                fontPrimary: "#0f172a",
                fontSecondary: "rgba(15, 23, 42, 0.5)",
                border: "rgba(15, 23, 42, 0.12)",
                backgroundPrimary: "#ffffff",
                backgroundSecondary: "#f8fafc"
            };

        return {
            name: "menuvium-auth",
            tokens: {
                colors: {
                    font: { primary: base.fontPrimary, secondary: base.fontSecondary },
                    border: { primary: base.border },
                    background: { primary: base.backgroundPrimary, secondary: base.backgroundSecondary },
                    brand: {
                        primary: {
                            10: "rgba(255, 90, 31, 0.10)",
                            80: "#FF5A1F",
                            90: "#E04812",
                            100: "#B45309"
                        }
                    }
                },
                radii: { small: "12px", medium: "16px", large: "20px" },
                components: {
                    button: {
                        primary: {
                            backgroundColor: "#FF5A1F",
                            color: "#FFFFFF",
                            _hover: { backgroundColor: "#E04812" }
                        },
                        link: {
                            color: "#FF5A1F"
                        }
                    },
                    fieldcontrol: {
                        borderColor: base.border,
                        backgroundColor: base.backgroundPrimary,
                        _focus: { borderColor: "#FF5A1F", boxShadow: "0 0 0 2px rgba(255,90,31,0.2)" }
                    }
                }
            }
        };
    }, [resolvedTheme]);

    return (
        <div className={`min-h-screen bg-[var(--cms-bg)] text-[var(--cms-text)] ${spaceGrotesk.className} relative transition-colors`}>
            <div className="absolute top-6 right-6 z-50">
                <ThemeToggle />
            </div>

            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-32 -left-32 h-72 w-72 rounded-full bg-[var(--cms-accent)]/15 blur-[120px]" />
                <div className="absolute bottom-[-120px] right-[-120px] h-80 w-80 rounded-full bg-indigo-500/10 blur-[140px]" />
            </div>

            <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-10 px-6 py-16 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
                <div className="space-y-6">
                    <p className="text-xs uppercase tracking-[0.4em] text-[var(--cms-muted)]">Menuvium</p>
                    <h1 className={`text-4xl md:text-5xl font-bold tracking-tight ${fraunces.className}`}>
                        Login to the menu studio
                    </h1>
                    <p className="text-base text-[var(--cms-muted)] max-w-md">
                        Design menus that feel premium on every phone. Launch faster with import, edit, and themes.
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-[var(--cms-muted)]">
                        <span className="px-3 py-1 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel)]">Mobile-first</span>
                        <span className="px-3 py-1 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel)]">Theme-ready</span>
                        <span className="px-3 py-1 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel)]">OCR import</span>
                    </div>
                </div>

                <div className="w-full">
                    <div className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] shadow-2xl text-[var(--cms-text)] overflow-hidden relative">
                        {/* Light mode gradient behind form */}
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--cms-panel)] to-[var(--cms-panel-strong)] pointer-events-none -z-10" />

                        <div className="p-8">
                            {isConfigured ? (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-lg font-bold mb-1">Sign in or create an account</h2>
                                        <p className="text-sm text-[var(--cms-muted)]">Use email or a social provider.</p>
                                    </div>
                                    <ThemeProvider theme={amplifyTheme}>
                                        <View className="auth-wrapper">
                                            <Authenticator
                                                loginMechanisms={["email"]}
                                                socialProviders={hasOAuth ? ["google", "apple", "facebook"] : []}
                                                signUpAttributes={["email", "name"]}
                                            />
                                        </View>
                                    </ThemeProvider>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-4 bg-[var(--cms-pill)] border border-[var(--cms-border)] rounded-xl text-sm text-[var(--cms-text)] leading-relaxed">
                                        <p className="font-bold mb-1">Auth not configured</p>
                                        <p>Set `NEXT_PUBLIC_USER_POOL_ID` and `NEXT_PUBLIC_USER_POOL_CLIENT_ID` to enable login.</p>
                                    </div>
                                    <p className="text-xs text-[var(--cms-muted)]">Check `docs/SETUP.md` for configuration details.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
