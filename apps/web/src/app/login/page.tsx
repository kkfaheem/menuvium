"use client";

import { Authenticator, ThemeProvider, useAuthenticator, View } from "@aws-amplify/ui-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

export default function LoginPage() {
    const router = useRouter();
    const { authStatus } = useAuthenticator(context => [context.authStatus]);

    useEffect(() => {
        if (authStatus !== 'authenticated') return;
        // Keep current mode sticky across refresh/reloads.
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem("menuvium_user_mode");
            if (stored === "admin" || stored === "manager") {
                router.push("/dashboard/menus");
                return;
            }
        }
        router.push("/dashboard/mode");
    }, [authStatus, router]);

    const isConfigured = process.env.NEXT_PUBLIC_USER_POOL_ID && process.env.NEXT_PUBLIC_USER_POOL_ID !== 'us-east-1_dummy';
    const hasOAuth = Boolean(process.env.NEXT_PUBLIC_COGNITO_DOMAIN);

    const amplifyTheme = useMemo(() => {
        const base = {
            fontPrimary: "var(--cms-text)",
            fontSecondary: "var(--cms-muted)",
            border: "var(--cms-border)",
            backgroundPrimary: "var(--cms-panel)",
            backgroundSecondary: "var(--cms-panel-strong)"
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
                            backgroundColor: "var(--cms-accent)",
                            color: "#FFFFFF",
                            _hover: { backgroundColor: "var(--cms-accent-strong)" }
                        },
                        link: {
                            color: "var(--cms-accent)"
                        }
                    },
                    fieldcontrol: {
                        borderColor: base.border,
                        backgroundColor: base.backgroundPrimary,
                        _focus: { borderColor: "var(--cms-accent)", boxShadow: "0 0 0 2px var(--cms-accent-subtle)" }
                    }
                }
            }
        };
    }, []);

    return (
        <div className="landing-shell relative isolate min-h-screen overflow-x-hidden bg-transparent text-foreground selection:bg-[var(--cms-accent-subtle)] transition-colors">
            <div aria-hidden="true" className="landing-bg">
                <span className="landing-bg-blob landing-bg-blob-emerald" />
                <span className="landing-bg-blob landing-bg-blob-blue" />
                <span className="landing-bg-blob landing-bg-blob-orange" />
                <span className="landing-bg-blob landing-bg-blob-teal" />
                <span className="landing-bg-noise" />
                <span className="landing-bg-vignette" />
                <span className="landing-bg-fade" />
            </div>

            <header className="relative z-40 sticky top-0 border-b border-border bg-panel/90 supports-[backdrop-filter]:bg-panel/80 backdrop-blur-xl">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
                    <div className="flex-1" />
                    <Logo size="lg" />
                    <div className="flex flex-1 items-center justify-end gap-3">
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main className="relative z-10 mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-16">
                <section className="flex flex-col justify-center gap-6 animate-fade-in-up motion-reduce:animate-none">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--cms-accent-strong)]">
                            Welcome back
                        </p>
                        <h1 className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">
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

                <section className="flex items-center justify-center lg:justify-end animate-fade-in-up animation-delay-100 motion-reduce:animate-none">
                    <div className="w-full max-w-md">
                        <Card className="backdrop-blur-md bg-panel/88">
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
