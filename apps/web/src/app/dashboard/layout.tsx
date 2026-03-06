"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, UtensilsCrossed, LogOut, Settings, Building2, Menu, X, Palette, Zap, Activity, BarChart3, Shield, UserCircle, CreditCard, Bell, Check } from "lucide-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";
import { useCallback, useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";
import { getApiBase } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/authToken";
import { decodeJwtPayload } from "@/lib/jwt";
import { getStoredUserMode } from "@/lib/userMode";

const LINK_PROMPT_SKIP_KEY = "menuvium_skip_link_prompt";
const OPAQUE_USERNAME_PREFIX = /^(google|facebook|loginwithamazon|signinwithapple|oidc|saml)_/i;

type OwnershipTransferNotification = {
    id: string;
    org_id: string;
    org_name: string;
    requested_by_email?: string | null;
    target_email: string;
    created_at: string;
    expires_at: string;
    is_read: boolean;
};

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, signOut, authStatus } = useAuthenticator((context) => [context.user, context.authStatus]);
    const [mounted, setMounted] = useState(false);
    const [navOpen, setNavOpen] = useState(false);
    const [mode, setMode] = useState<"admin" | "manager" | null>(null);
    const [modeReady, setModeReady] = useState(false);
    const [linkCheckReady, setLinkCheckReady] = useState(false);
    const [userEmail, setUserEmail] = useState<string>("");
    const [isSuperAdminFromApi, setIsSuperAdminFromApi] = useState<boolean | null>(null);
    const [ownershipNotifications, setOwnershipNotifications] = useState<OwnershipTransferNotification[]>([]);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [notificationError, setNotificationError] = useState<string | null>(null);
    const [notificationActionId, setNotificationActionId] = useState<string | null>(null);
    const isModePage = pathname.startsWith("/dashboard/mode");

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        if (authStatus === "unauthenticated") {
            if (typeof window !== "undefined") {
                window.sessionStorage.removeItem(LINK_PROMPT_SKIP_KEY);
            }
            setUserEmail("");
            setIsSuperAdminFromApi(null);
            router.replace("/login");
        }
    }, [mounted, authStatus, router]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setMode(getStoredUserMode());
        setModeReady(true);
    }, [pathname]);

    useEffect(() => {
        if (!mounted || authStatus !== "authenticated" || !user) {
            setLinkCheckReady(false);
            return;
        }

        if (typeof window !== "undefined") {
            const skipLinkPrompt = window.sessionStorage.getItem(LINK_PROMPT_SKIP_KEY);
            if (skipLinkPrompt === "1") {
                setLinkCheckReady(true);
                return;
            }
        }

        let cancelled = false;
        setLinkCheckReady(false);

        const checkLinkRequirement = async () => {
            try {
                const session = await fetchAuthSession({ forceRefresh: true });
                const token = session.tokens?.idToken?.toString();
                if (!token) {
                    if (!cancelled) setLinkCheckReady(true);
                    return;
                }

                const res = await fetch(`${getApiBase()}/auth/check-link`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (res.ok) {
                    const data = (await res.json()) as { needs_link?: boolean };
                    if (data.needs_link) {
                        router.replace("/link-account");
                        return;
                    }
                }
            } catch (error) {
                console.error("dashboard link-check failed:", error);
            }

            if (!cancelled) setLinkCheckReady(true);
        };

        void checkLinkRequirement();

        return () => {
            cancelled = true;
        };
    }, [mounted, authStatus, user, router]);

    useEffect(() => {
        if (!mounted || !user || !modeReady || !linkCheckReady) return;

        const resolveIdentityContext = async () => {
            setIsSuperAdminFromApi(null);

            try {
                const session = await fetchAuthSession();
                const idToken = session.tokens?.idToken?.toString();
                if (idToken) {
                    const res = await fetch(`${getApiBase()}/auth/session-info`, {
                        headers: { Authorization: `Bearer ${idToken}` },
                    });
                    if (res.ok) {
                        const data = (await res.json()) as {
                            email?: string | null;
                            is_admin?: boolean;
                        };
                        const apiEmail =
                            typeof data.email === "string"
                                ? data.email.trim().toLowerCase()
                                : "";
                        if (apiEmail) {
                            setUserEmail(apiEmail);
                        }
                        if (typeof data.is_admin === "boolean") {
                            setIsSuperAdminFromApi(data.is_admin);
                        }
                        if (apiEmail || typeof data.is_admin === "boolean") {
                            return;
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to fetch session-info", error);
            }

            const loginId =
                typeof user.signInDetails?.loginId === "string"
                    ? user.signInDetails.loginId.trim().toLowerCase()
                    : "";

            // For native/email logins this is reliable.
            // For federated users it can be an opaque id like `google_123...`, so ignore those.
            if (loginId && loginId.includes("@") && !OPAQUE_USERNAME_PREFIX.test(loginId)) {
                setUserEmail(loginId);
                return;
            }

            try {
                const attrs = await fetchUserAttributes();
                const attrEmail = attrs.email?.trim().toLowerCase();
                if (attrEmail) {
                    setUserEmail(attrEmail);
                    return;
                }
            } catch (error) {
                console.error("Failed to fetch user attributes for email", error);
            }

            try {
                const session = await fetchAuthSession();
                const idToken = session.tokens?.idToken?.toString();
                if (idToken) {
                    const payload = decodeJwtPayload<{ email?: string }>(idToken);
                    const claimEmail = payload?.email?.trim().toLowerCase();
                    if (claimEmail) {
                        setUserEmail(claimEmail);
                        return;
                    }
                }
            } catch (error) {
                console.error("Failed to read id token email claim", error);
            }

            setUserEmail("");
        };

        void resolveIdentityContext();

        if (mode === null && !isModePage) {
            router.replace("/dashboard/mode");
            return;
        }
        if (mode === "manager") {
            const restricted =
                pathname === "/dashboard" ||
                pathname.startsWith("/dashboard/companies");
            if (restricted) {
                router.replace("/dashboard/menus");
            }
        }
    }, [mounted, user, mode, pathname, router, isModePage, modeReady, linkCheckReady]);

    const loadNotifications = useCallback(
        async (options?: { showLoader?: boolean }) => {
            if (authStatus !== "authenticated" || !user || isModePage) return;
            const showLoader = options?.showLoader ?? false;
            try {
                if (showLoader) setNotificationsLoading(true);
                setNotificationError(null);
                const token = await getAuthToken();
                const res = await fetch(`${getApiBase()}/organizations/ownership-transfer/notifications`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    throw new Error("Failed to load notifications");
                }
                const data = (await res.json()) as OwnershipTransferNotification[];
                setOwnershipNotifications(Array.isArray(data) ? data : []);
            } catch (error) {
                setNotificationError("Could not load notifications");
                console.error("Failed to load ownership transfer notifications", error);
            } finally {
                if (showLoader) setNotificationsLoading(false);
            }
        },
        [authStatus, user, isModePage]
    );

    useEffect(() => {
        if (!mounted || authStatus !== "authenticated" || !user || isModePage) return;
        void loadNotifications();
    }, [mounted, authStatus, user, isModePage, loadNotifications]);

    const markNotificationsRead = async () => {
        const unread = ownershipNotifications.some((notification) => !notification.is_read);
        if (!unread) return;
        try {
            const token = await getAuthToken();
            const res = await fetch(`${getApiBase()}/organizations/ownership-transfer/notifications/mark-read`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            setOwnershipNotifications((prev) => prev.map((notification) => ({ ...notification, is_read: true })));
        } catch (error) {
            console.error("Failed to mark ownership notifications read", error);
        }
    };

    const openNotifications = async () => {
        const next = !notificationsOpen;
        setNotificationsOpen(next);
        if (next) {
            await loadNotifications({ showLoader: true });
            await markNotificationsRead();
        }
    };

    const actOnNotification = async (notificationId: string, action: "accept" | "decline") => {
        try {
            setNotificationActionId(notificationId);
            setNotificationError(null);
            const token = await getAuthToken();
            const res = await fetch(
                `${getApiBase()}/organizations/ownership-transfer/${notificationId}/${action}`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                }
            );
            if (!res.ok) {
                const errorBody = await res.json().catch(() => ({}));
                const detail =
                    typeof errorBody === "object" && errorBody && "detail" in errorBody
                        ? (errorBody as { detail?: unknown }).detail
                        : undefined;
                throw new Error(typeof detail === "string" ? detail : "Failed to update transfer");
            }

            if (action === "accept") {
                await res.json().catch(() => ({}));
                setOwnershipNotifications((prev) => prev.filter((notification) => notification.id !== notificationId));
            } else {
                setOwnershipNotifications((prev) => prev.filter((notification) => notification.id !== notificationId));
            }
        } catch (error) {
            setNotificationError(error instanceof Error ? error.message : "Failed to update transfer");
        } finally {
            setNotificationActionId(null);
        }
    };

    if (!mounted) return <div className="min-h-screen bg-background" suppressHydrationWarning />;
    if (!user) return null;
    if (!linkCheckReady) return <div className="min-h-screen bg-background" suppressHydrationWarning />;

    const isManager = mode === "manager";
    const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").toLowerCase().split(",").map(e => e.trim());
    const isSuperAdminByEmail = userEmail ? adminEmails.includes(userEmail) : false;
    const isSuperAdmin = isSuperAdminFromApi ?? isSuperAdminByEmail;
    const unreadNotificationCount = ownershipNotifications.filter((notification) => !notification.is_read).length;

    if (isModePage) {
        return (
            <div className="landing-shell relative isolate min-h-screen overflow-x-hidden bg-transparent text-foreground">
                <div aria-hidden="true" className="landing-bg dashboard-bg">
                    <span className="landing-bg-blob landing-bg-blob-emerald" />
                    <span className="landing-bg-blob landing-bg-blob-blue" />
                    <span className="landing-bg-blob landing-bg-blob-orange" />
                    <span className="landing-bg-blob landing-bg-blob-teal" />
                    <span className="landing-bg-sheen" />
                    <span className="landing-bg-prism" />
                    <span className="landing-bg-noise" />
                    <span className="landing-bg-vignette" />
                    <span className="landing-bg-fade" />
                </div>

                <div className="relative z-10">
                    <header className="sticky top-0 z-40 border-b border-border bg-panel/90 supports-[backdrop-filter]:bg-panel/80 backdrop-blur-xl">
                        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
                            <div className="flex-1" />
                            <Logo size="lg" />
                            <div className="flex flex-1 items-center justify-end gap-3">
                                <ThemeToggle />
                            </div>
                        </div>
                    </header>

                    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center px-4 py-10 sm:px-6">
                        {children}
                    </main>
                </div>
            </div>
        );
    }

    return (
        <div className="landing-shell relative isolate min-h-screen overflow-x-hidden bg-transparent text-foreground">
            <div aria-hidden="true" className="landing-bg dashboard-bg">
                <span className="landing-bg-blob landing-bg-blob-emerald" />
                <span className="landing-bg-blob landing-bg-blob-blue" />
                <span className="landing-bg-blob landing-bg-blob-orange" />
                <span className="landing-bg-blob landing-bg-blob-teal" />
                <span className="landing-bg-sheen" />
                <span className="landing-bg-prism" />
                <span className="landing-bg-noise" />
                <span className="landing-bg-vignette" />
                <span className="landing-bg-fade" />
            </div>

            <div className="relative z-10 flex min-h-screen flex-col md:flex-row md:gap-6 md:px-6 md:py-6">
                <div className="md:hidden sticky top-0 z-40 border-b border-border bg-panel/90 supports-[backdrop-filter]:bg-panel/80 backdrop-blur-xl">
                    <div className="flex items-center justify-between px-4 py-3">
                        <button
                            onClick={() => setNavOpen(true)}
                            className="h-11 w-11 rounded-xl border border-border bg-panelStrong flex items-center justify-center hover:bg-pill transition-colors"
                            aria-label="Open navigation"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <Logo size="md" />
                        <div className="w-11" />
                    </div>
                </div>

                {navOpen && (
                    <div className="md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
                )}

                {/* Sidebar */}
                <aside
                    className={cn(
                        "fixed inset-y-0 left-0 z-50 w-72 rounded-r-2xl border-r border-border bg-panel p-5 shadow-[var(--cms-shadow-lg)] transition-transform duration-300 md:sticky md:top-6 md:z-10 md:h-[calc(100vh-3rem)] md:w-72 md:translate-x-0 md:rounded-2xl md:border md:border-border md:shadow-[var(--cms-shadow-md)]",
                        navOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
                    )}
                >
                    <div className="flex items-center justify-between px-1 py-1 mb-6">
                        <Logo size="lg" />
                        <button
                            onClick={() => setNavOpen(false)}
                            className="md:hidden h-10 w-10 rounded-xl border border-border bg-panelStrong flex items-center justify-center hover:bg-pill transition-colors"
                            aria-label="Close navigation"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <nav className="flex-1 space-y-1">
                        {!isManager && (
                            <Link
                                href="/dashboard"
                                onClick={() => setNavOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                    pathname === "/dashboard"
                                        ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                        : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                )}
                            >
                                <LayoutDashboard className="w-5 h-5" />
                                Overview
                            </Link>
                        )}
                        <Link
                            href="/dashboard/menus"
                            onClick={() => setNavOpen(false)}
                            className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                pathname.startsWith("/dashboard/menus") &&
                                    !pathname.includes("/themes")
                                    ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                    : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                            )}
                        >
                            <UtensilsCrossed className="w-5 h-5" />
                            Menus
                        </Link>
                        <Link
                            href="/dashboard/design-studio"
                            onClick={() => setNavOpen(false)}
                            className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                pathname.startsWith("/dashboard/design-studio") || pathname.includes("/themes")
                                    ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                    : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                            )}
                        >
                            <Palette className="w-5 h-5" />
                            Design Studio
                        </Link>
                        {!isManager && (
                            <Link
                                href="/dashboard/companies"
                                onClick={() => setNavOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                    pathname.startsWith("/dashboard/companies")
                                        ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                        : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                )}
                            >
                                <Building2 className="w-5 h-5" />
                                Companies
                            </Link>
                        )}
                        <Link
                            href="/dashboard/mode"
                            onClick={() => setNavOpen(false)}
                            className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                pathname.startsWith("/dashboard/mode")
                                    ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                    : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                            )}
                        >
                            <Menu className="w-5 h-5" />
                            Mode
                        </Link>
                    </nav>

                    <div className={cn("mt-auto pt-4 space-y-2", isSuperAdmin && "border-t border-border")}>
                        {isSuperAdmin && (
                            <div className="px-3 pb-2">
                                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--cms-muted)] mb-3 mt-2">
                                    <Shield className="w-3.5 h-3.5" />
                                    Super Admin
                                </h4>
                                <div className="space-y-1">
                                    <Link
                                        href="/dashboard/admin/analytics"
                                        onClick={() => setNavOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                            pathname === "/dashboard/admin/analytics"
                                                ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                                : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                        )}
                                    >
                                        <BarChart3 className="w-5 h-5" />
                                        Platform Analytics
                                    </Link>
                                    <Link
                                        href="/dashboard/admin/users"
                                        onClick={() => setNavOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                            pathname === "/dashboard/admin/users"
                                                ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                                : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                        )}
                                    >
                                        <UserCircle className="w-5 h-5" />
                                        Users
                                    </Link>
                                    <Link
                                        href="/dashboard/admin/menus"
                                        onClick={() => setNavOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                            pathname.startsWith("/dashboard/admin/menus")
                                                ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                                : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                        )}
                                    >
                                        <UtensilsCrossed className="w-5 h-5" />
                                        Menus
                                    </Link>
                                    <Link
                                        href="/dashboard/admin/organizations"
                                        onClick={() => setNavOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                            pathname.startsWith("/dashboard/admin/organizations")
                                                ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                                : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                        )}
                                    >
                                        <Building2 className="w-5 h-5" />
                                        Companies
                                    </Link>
                                    <Link
                                        href="/dashboard/admin/subscriptions"
                                        onClick={() => setNavOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                            pathname === "/dashboard/admin/subscriptions"
                                                ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                                : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                        )}
                                    >
                                        <CreditCard className="w-5 h-5" />
                                        Billing
                                    </Link>
                                    <Link
                                        href="/dashboard/admin/jobs"
                                        onClick={() => setNavOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                            pathname.startsWith("/dashboard/admin/jobs")
                                                ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                                : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                        )}
                                    >
                                        <Activity className="w-5 h-5" />
                                        System Health
                                    </Link>
                                    <Link
                                        href="/dashboard/admin/importer"
                                        onClick={() => setNavOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                            pathname.startsWith("/dashboard/admin/importer")
                                                ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                                : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                        )}
                                    >
                                        <Zap className="w-5 h-5" />
                                        Menu Importer
                                    </Link>
                                </div>
                            </div>
                        )}
                        <div className="mt-2 border-t border-border px-1 pt-3 space-y-2">
                            <button
                                onClick={() => void openNotifications()}
                                className={cn(
                                    "relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                    unreadNotificationCount > 0
                                        ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-accent-strong)] ring-1 ring-[color-mix(in_oklab,var(--cms-accent)_40%,transparent)]"
                                        : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                )}
                            >
                                <Bell className="w-5 h-5" />
                                Notifications
                                {unreadNotificationCount > 0 ? (
                                    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--cms-accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                        {unreadNotificationCount}
                                    </span>
                                ) : null}
                            </button>

                            {notificationsOpen ? (
                                <div className="rounded-xl border border-border bg-panelStrong p-2 space-y-2">
                                    {notificationsLoading ? (
                                        <div className="px-2 py-2 text-xs text-[var(--cms-muted)]">Loading notifications...</div>
                                    ) : ownershipNotifications.length === 0 ? (
                                        <div className="px-2 py-2 text-xs text-[var(--cms-muted)]">No pending notifications.</div>
                                    ) : (
                                        ownershipNotifications.map((notification) => (
                                            <div
                                                key={notification.id}
                                                className="rounded-lg border border-border bg-panel px-2 py-2 space-y-2"
                                            >
                                                <p className="text-xs font-semibold leading-relaxed">
                                                    Ownership transfer for {notification.org_name}
                                                </p>
                                                {notification.requested_by_email ? (
                                                    <p className="text-[11px] text-[var(--cms-muted)]">
                                                        Requested by {notification.requested_by_email}
                                                    </p>
                                                ) : null}
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => void actOnNotification(notification.id, "accept")}
                                                        disabled={notificationActionId === notification.id}
                                                        className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--cms-accent)] px-2 text-[11px] font-semibold text-white hover:bg-[var(--cms-accent-strong)] disabled:opacity-60"
                                                    >
                                                        <Check className="w-3 h-3" />
                                                        Accept
                                                    </button>
                                                    <button
                                                        onClick={() => void actOnNotification(notification.id, "decline")}
                                                        disabled={notificationActionId === notification.id}
                                                        className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-semibold text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill disabled:opacity-60"
                                                    >
                                                        <X className="w-3 h-3" />
                                                        Decline
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    {notificationError ? (
                                        <p className="px-2 py-1 text-[11px] text-red-400">{notificationError}</p>
                                    ) : null}
                                </div>
                            ) : null}

                            <Link
                                href="/dashboard/profile"
                                onClick={() => setNavOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                    pathname.startsWith("/dashboard/profile")
                                        ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                        : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                )}
                            >
                                <UserCircle className="w-5 h-5" />
                                Profile
                            </Link>

                            <Link
                                href="/dashboard/settings"
                                onClick={() => setNavOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                    pathname.startsWith("/dashboard/settings")
                                        ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                        : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                )}
                            >
                                <Settings className="w-5 h-5" />
                                Settings
                            </Link>

                            <div className="flex items-center gap-2 px-1 pt-1">
                                <ThemeToggle />
                                <button
                                    onClick={() => {
                                        if (typeof window !== "undefined") {
                                            window.sessionStorage.removeItem(LINK_PROMPT_SKIP_KEY);
                                        }
                                        signOut();
                                    }}
                                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-panelStrong px-3 text-sm font-semibold text-muted transition-colors hover:bg-pill hover:text-[var(--cms-text)]"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main
                    data-dashboard-main-region="true"
                    className="flex-1 min-w-0 px-4 py-6 sm:px-6 sm:py-8 md:px-0 md:py-0"
                >
                    <div className="mx-auto w-full max-w-7xl">
                        {modeReady && mode ? (
                            children
                        ) : (
                            <div className="w-full max-w-2xl space-y-3">
                                <div className="h-6 w-48 rounded-lg bg-pill animate-pulse" />
                                <div className="h-4 w-72 rounded-lg bg-pill animate-pulse" />
                                <div className="h-4 w-64 rounded-lg bg-pill animate-pulse" />
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
