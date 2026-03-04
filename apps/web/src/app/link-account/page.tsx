"use client";

import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession } from "aws-amplify/auth";
import { useCallback, useEffect, useState } from "react";
import { Link2, SkipForward, Loader2, Mail, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { getApiBase } from "@/lib/apiBase";

export default function LinkAccountPage() {
    const router = useRouter();
    const { user, authStatus, signOut } = useAuthenticator(context => [context.user, context.authStatus]);
    const apiBase = getApiBase();

    const [checking, setChecking] = useState(true);
    const [needsLink, setNeedsLink] = useState(false);
    const [existingEmail, setExistingEmail] = useState<string | null>(null);
    const [existingName, setExistingName] = useState<string | null>(null);
    const [provider, setProvider] = useState<string | null>(null);
    const [linking, setLinking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const callLinkApi = useCallback(async <T,>(
        path: "/auth/check-link" | "/auth/link-accounts",
        method: "GET" | "POST",
        forceRefresh = false,
    ): Promise<T> => {
        const session = await fetchAuthSession({ forceRefresh });
        const token = session.tokens?.idToken?.toString();
        if (!token) {
            throw new Error("Not authenticated");
        }

        const response = await fetch(`${apiBase}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const text = await response.text();
        const body = text ? JSON.parse(text) : {};

        if (!response.ok) {
            const detail =
                typeof body === "object" && body && "detail" in body
                    ? String((body as { detail?: string }).detail || "")
                    : "";
            throw new Error(detail || `Request failed (${response.status})`);
        }

        return body as T;
    }, [apiBase]);

    const proceedToDashboard = useCallback(() => {
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem("menuvium_user_mode");
            if (stored === "admin" || stored === "manager") {
                router.push("/dashboard/menus");
                return;
            }
        }
        router.push("/dashboard/mode");
    }, [router]);

    const proceedAfterSuccessfulLink = useCallback(async () => {
        try {
            if (typeof window !== "undefined") {
                window.localStorage.removeItem("menuvium_user_mode");
            }
            await signOut();
        } catch {
            // If sign-out fails, continue to login anyway.
        }
        router.replace("/login?linked=1");
    }, [router, signOut]);

    useEffect(() => {
        if (authStatus !== "authenticated") {
            router.push("/login");
            return;
        }

        const checkLinkWithRetry = async () => {
            const maxAttempts = 3;
            let lastError: unknown = null;
            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                try {
                    return await callLinkApi<{
                        needs_link: boolean;
                        provider: string | null;
                        existing_email: string | null;
                        existing_name: string | null;
                    }>("/auth/check-link", "GET", attempt > 0);
                } catch (err) {
                    lastError = err;
                    if (attempt < maxAttempts - 1) {
                        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
                    }
                }
            }
            throw lastError;
        };

        const check = async () => {
            try {
                const result = await checkLinkWithRetry();
                if (result.needs_link) {
                    setNeedsLink(true);
                    setExistingEmail(result.existing_email);
                    setExistingName(result.existing_name);
                    setProvider(result.provider);
                } else {
                    // No linking needed — proceed to dashboard
                    proceedToDashboard();
                }
            } catch (err) {
                console.error("check-link failed:", err);
                proceedToDashboard();
            } finally {
                setChecking(false);
            }
        };

        void check();
    }, [authStatus, router, callLinkApi, proceedToDashboard]);

    const handleLink = async () => {
        setLinking(true);
        setError(null);
        try {
            await callLinkApi<{ ok: boolean; detail: string }>("/auth/link-accounts", "POST", true);
            setSuccess(true);
            setTimeout(() => {
                void proceedAfterSuccessfulLink();
            }, 1200);
        } catch (err: any) {
            setError(err.detail || err.message || "Failed to link accounts");
        } finally {
            setLinking(false);
        }
    };

    const handleSkip = () => {
        proceedToDashboard();
    };

    // While checking or redirecting, show a minimal blank screen
    if (checking || (!needsLink && !success)) {
        return (
            <div className="min-h-screen bg-transparent" />
        );
    }

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
                            Account detected
                        </p>
                        <h1 className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">
                            Link your <span className="text-[var(--cms-accent-strong)]">accounts</span>
                        </h1>
                        <p className="max-w-xl text-base leading-relaxed text-muted">
                            We found an existing account with the same email. Link them together to keep all your menus,
                            settings, and team memberships in one place.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">One account</Badge>
                        <Badge variant="outline">Keep all data</Badge>
                        <Badge variant="outline">Seamless</Badge>
                    </div>
                </section>

                <section className="flex items-center justify-center lg:justify-end animate-fade-in-up animation-delay-100 motion-reduce:animate-none">
                    <div className="w-full max-w-md">
                        <Card className="backdrop-blur-md bg-panel/88">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Link2 className="w-5 h-5 text-[var(--cms-accent)]" />
                                    Link Accounts
                                </CardTitle>
                                <CardDescription>
                                    Merge your {provider || "Google"} sign-in with your existing account.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                {success ? (
                                    <div className="flex flex-col items-center justify-center gap-3 py-8">
                                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                            <ShieldCheck className="w-6 h-6 text-emerald-500" />
                                        </div>
                                        <p className="text-sm font-semibold text-emerald-500">Accounts linked successfully!</p>
                                        <p className="text-xs text-muted">Redirecting to your dashboard...</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Current Google account */}
                                        <div className="rounded-xl border border-border p-4 space-y-1">
                                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                                </svg>
                                                Google Sign-In (new)
                                            </div>
                                            <p className="text-sm font-medium text-foreground">{user?.signInDetails?.loginId || existingEmail}</p>
                                        </div>

                                        {/* Arrow */}
                                        <div className="flex items-center justify-center">
                                            <div className="w-8 h-8 rounded-full bg-[var(--cms-accent-subtle)] flex items-center justify-center">
                                                <Link2 className="w-4 h-4 text-[var(--cms-accent)]" />
                                            </div>
                                        </div>

                                        {/* Existing account */}
                                        <div className="rounded-xl border border-border p-4 space-y-1">
                                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                                                <Mail className="w-4 h-4" />
                                                Existing Account
                                            </div>
                                            {existingName && (
                                                <p className="text-sm font-semibold text-foreground">{existingName}</p>
                                            )}
                                            <p className="text-sm text-muted">{existingEmail}</p>
                                        </div>

                                        {error && (
                                            <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-3 text-sm">
                                                {error}
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex flex-col gap-3 pt-2">
                                            <button
                                                onClick={handleLink}
                                                disabled={linking}
                                                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-[var(--cms-accent)] text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-all text-sm"
                                            >
                                                {linking ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Link2 className="w-4 h-4" />
                                                )}
                                                {linking ? "Linking..." : "Link Accounts"}
                                            </button>
                                            <button
                                                onClick={handleSkip}
                                                disabled={linking}
                                                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-border text-muted hover:text-foreground hover:bg-panelStrong/50 transition-all text-sm"
                                            >
                                                <SkipForward className="w-4 h-4" />
                                                Keep Separate
                                            </button>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </section>
            </main>
        </div>
    );
}
