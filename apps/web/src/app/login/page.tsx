"use client";

import { Authenticator, ThemeProvider, useAuthenticator, View } from "@aws-amplify/ui-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

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
                fontPrimary: "#e2e8f0",
                fontSecondary: "rgba(226, 232, 240, 0.7)",
                border: "rgba(226, 232, 240, 0.12)",
                backgroundPrimary: "#0f172a",
                backgroundSecondary: "#0b1020"
            }
            : {
                fontPrimary: "#0f172a",
                fontSecondary: "rgba(15, 23, 42, 0.64)",
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
        <div className="min-h-screen bg-background text-foreground transition-colors">
            <header className="sticky top-0 z-40 border-b border-border bg-panel">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
                    <div className="flex-1" />
                    <Logo size="lg" />
                    <div className="flex flex-1 items-center justify-end gap-3">
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-16">
                <section className="flex flex-col justify-center gap-6">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--cms-accent-strong)]">
                            Welcome back
                        </p>
                        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                            Sign in to your <span className="text-[var(--cms-accent-strong)]">menu studio</span>
                        </h1>
                        <p className="max-w-xl text-base leading-relaxed text-muted">
                            Create, edit, and publish menus that look premium on every device. Import fast, refine in real‑time, and ship
                            beautiful themes.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">Mobile-first</Badge>
                        <Badge variant="outline">Live editing</Badge>
                        <Badge variant="outline">Theme-ready</Badge>
                    </div>
                </section>

                <section className="flex items-center justify-center lg:justify-end">
                    <div className="w-full max-w-md">
                        <Card>
                            <CardHeader>
                                <CardTitle>Sign in</CardTitle>
                                <CardDescription>Use email (and optionally a social provider) to continue.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isConfigured ? (
                                    <ThemeProvider theme={amplifyTheme}>
                                        <View className="auth-wrapper">
                                            <Authenticator
                                                loginMechanisms={["email"]}
                                                socialProviders={hasOAuth ? ["google", "apple", "facebook"] : []}
                                                signUpAttributes={["email", "name"]}
                                            />
                                        </View>
                                    </ThemeProvider>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="rounded-xl border border-border bg-[var(--cms-accent-subtle)] px-4 py-3 text-sm leading-relaxed">
                                            <p className="font-semibold">Auth not configured</p>
                                            <p className="mt-1 text-muted">
                                                Set <code>NEXT_PUBLIC_USER_POOL_ID</code> and <code>NEXT_PUBLIC_USER_POOL_CLIENT_ID</code> to
                                                enable login.
                                            </p>
                                        </div>
                                        <p className="text-xs text-muted">
                                            Check <code>docs/SETUP.md</code> for configuration details.
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </section>
            </main>
        </div>
    );
}
