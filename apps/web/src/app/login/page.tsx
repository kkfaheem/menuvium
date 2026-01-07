"use client";

import { Authenticator, ThemeProvider, useAuthenticator, View } from "@aws-amplify/ui-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";
import { Logo } from "@/components/Logo";

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
                fontPrimary: "#fafafa",
                fontSecondary: "rgba(250, 250, 250, 0.6)",
                border: "rgba(255, 255, 255, 0.08)",
                backgroundPrimary: "#141414",
                backgroundSecondary: "#0a0a0a"
            }
            : {
                fontPrimary: "#1a1a1a",
                fontSecondary: "rgba(26, 26, 26, 0.55)",
                border: "rgba(0, 0, 0, 0.06)",
                backgroundPrimary: "#ffffff",
                backgroundSecondary: "#fafafa"
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
                            10: "rgba(249, 115, 22, 0.10)",
                            80: "#F97316",
                            90: "#EA580C",
                            100: "#C2410C"
                        }
                    }
                },
                radii: { small: "12px", medium: "16px", large: "20px" },
                components: {
                    button: {
                        primary: {
                            backgroundColor: "#F97316",
                            color: "#FFFFFF",
                            _hover: { backgroundColor: "#EA580C" }
                        },
                        link: {
                            color: "#F97316"
                        }
                    },
                    fieldcontrol: {
                        borderColor: base.border,
                        backgroundColor: base.backgroundPrimary,
                        _focus: { borderColor: "#F97316", boxShadow: "0 0 0 2px rgba(249,115,22,0.2)" }
                    }
                }
            }
        };
    }, [resolvedTheme]);

    return (
        <div className="min-h-screen bg-[var(--cms-bg)] text-[var(--cms-text)] relative transition-colors overflow-x-hidden">
            {/* Header - glassmorphism */}
            <header className="fixed top-0 left-0 right-0 z-50 glass-subtle">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    {/* Left spacer */}
                    <div className="flex-1" />

                    {/* Centered logo */}
                    <Logo size="lg" />

                    {/* Right side */}
                    <div className="flex items-center gap-3 flex-1 justify-end">
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            {/* Background blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-[var(--cms-accent)]/20 blur-[120px]" />
                <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-pink-400/15 blur-[140px]" />
                <div className="absolute top-1/2 left-0 h-64 w-64 rounded-full bg-blue-400/10 blur-[100px]" />
            </div>

            {/* Main content */}
            <div className="relative z-10 min-h-screen flex items-center justify-center px-4 sm:px-6 pt-20 pb-10">
                <div className="w-full max-w-5xl grid gap-12 lg:grid-cols-2 lg:gap-20 items-center">
                    {/* Left side - Marketing content */}
                    <div className="space-y-6 text-center lg:text-left">
                        <p className="text-xs uppercase tracking-[0.3em] text-[var(--cms-accent)] font-semibold">Welcome back</p>
                        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
                            Sign in to your <br />
                            <span className="text-[var(--cms-accent)]">menu studio</span>
                        </h1>
                        <p className="text-base text-[var(--cms-muted)] max-w-md mx-auto lg:mx-0 leading-relaxed">
                            Design menus that feel premium on every device. Launch faster with smart import, live editing, and beautiful themes.
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs font-medium text-[var(--cms-muted)] justify-center lg:justify-start">
                            <span className="glass px-3 py-1.5 rounded-full">📱 Mobile-first</span>
                            <span className="glass px-3 py-1.5 rounded-full">🎨 Theme-ready</span>
                            <span className="glass px-3 py-1.5 rounded-full">📄 OCR import</span>
                        </div>
                    </div>

                    {/* Right side - Auth form with glassmorphism */}
                    <div className="w-full max-w-md mx-auto lg:max-w-none lg:mx-0">
                        <div className="glass rounded-3xl text-[var(--cms-text)] overflow-hidden">
                            <div className="p-6 sm:p-8">
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
        </div>
    );
}
