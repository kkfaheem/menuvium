"use client";

import { Authenticator, ThemeProvider, useAuthenticator, View } from "@aws-amplify/ui-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Fraunces, Space_Grotesk } from "next/font/google";
import { getApiBase } from "@/lib/apiBase";
import { getJwtSub } from "@/lib/jwt";
import { getAuthToken } from "@/lib/authToken";
import { ThemeToggle } from "@/components/ThemeToggle"; // Import ThemeToggle

const fraunces = Fraunces({ subsets: ["latin"], weight: ["600", "700"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"] });

export default function LoginPage() {
    const router = useRouter();
    const { authStatus } = useAuthenticator(context => [context.authStatus]);

    useEffect(() => {
        if (authStatus !== 'authenticated') return;
        const resolveLanding = async () => {
            try {
                const storedMode = typeof window !== "undefined" ? localStorage.getItem("menuvium_user_mode") : null;
                if (!storedMode) {
                    router.push("/dashboard/mode");
                    return;
                }
                const apiBase = getApiBase();
                const token = await getAuthToken();
                const orgRes = await fetch(`${apiBase}/organizations/`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!orgRes.ok) {
                    router.push("/dashboard/mode");
                    return;
                }
                const orgs = await orgRes.json();
                const userSub = getJwtSub(token);
                const ownedOrgs = userSub ? orgs.filter((org: { owner_id?: string }) => org.owner_id === userSub) : [];

                if (storedMode === "admin" && !ownedOrgs.length) {
                    router.push("/onboarding");
                    return;
                }

                if (storedMode === "manager" && !orgs.length) {
                    router.push("/dashboard/menus");
                    return;
                }

                if (!orgs.length) {
                    router.push(storedMode === "admin" ? "/onboarding" : "/dashboard/mode");
                    return;
                }
                const orgsForMenuCheck = storedMode === "admin" ? ownedOrgs : orgs;
                const menuLists = await Promise.all(
                    orgsForMenuCheck.map((org: { id: string }) =>
                        fetch(`${apiBase}/menus/?org_id=${org.id}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        }).then((res) => (res.ok ? res.json() : []))
                    )
                );
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const hasMenus = menuLists.flat().length > 0;
                if (storedMode === "manager") {
                    router.push("/dashboard/menus");
                    return;
                }
                router.push(hasMenus ? "/dashboard/menus" : "/onboarding");
            } catch (e) {
                console.error(e);
                router.push("/dashboard/mode");
            }
        };
        resolveLanding();
    }, [authStatus, router]);

    const isConfigured = process.env.NEXT_PUBLIC_USER_POOL_ID && process.env.NEXT_PUBLIC_USER_POOL_ID !== 'us-east-1_dummy';
    const hasOAuth = Boolean(process.env.NEXT_PUBLIC_COGNITO_DOMAIN);

    const amplifyTheme = {
        name: "menuvium-auth",
        tokens: {
            colors: {
                font: { primary: "#1F1F1F", secondary: "#6B7280" },
                border: { primary: "#E5E7EB" },
                background: { primary: "#FFFFFF", secondary: "#FFF7ED" },
                brand: {
                    primary: {
                        10: "#FFF7ED",
                        80: "#FF5A1F", // Updated to Menuvium Orange
                        90: "#E04812",
                        100: "#B45309"
                    }
                }
            },
            radii: { small: "12px", medium: "16px", large: "20px" },
            components: {
                button: {
                    primary: {
                        backgroundColor: "#FF5A1F", // Updated
                        color: "#FFFFFF",
                        _hover: { backgroundColor: "#E04812" }
                    },
                    link: {
                        color: "#FF5A1F"
                    }
                },
                fieldcontrol: {
                    borderColor: "#E5E7EB",
                    _focus: { borderColor: "#FF5A1F", boxShadow: "0 0 0 2px rgba(255,90,31,0.2)" }
                }
            }
        }
    };

    return (
        <div className={`min-h-screen bg-white dark:bg-[#0B0B0B] text-slate-900 dark:text-white ${spaceGrotesk.className} relative`}>
            <div className="absolute top-6 right-6 z-50">
                <ThemeToggle />
            </div>

            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-32 -left-32 h-72 w-72 rounded-full bg-orange-500/20 blur-[120px]" />
                <div className="absolute bottom-[-120px] right-[-120px] h-80 w-80 rounded-full bg-purple-400/10 blur-[140px]" />
            </div>

            <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-10 px-6 py-16 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
                <div className="space-y-6">
                    <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-white/60">Menuvium</p>
                    <h1 className={`text-4xl md:text-5xl font-bold tracking-tight ${fraunces.className}`}>
                        Login to the menu studio
                    </h1>
                    <p className="text-base text-slate-600 dark:text-white/60 max-w-md">
                        Design menus that feel premium on every phone. Launch faster with import, edit, and themes.
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">
                        <span className="px-3 py-1 rounded-full border border-slate-200 dark:border-white/10">Mobile-first</span>
                        <span className="px-3 py-1 rounded-full border border-slate-200 dark:border-white/10">Theme-ready</span>
                        <span className="px-3 py-1 rounded-full border border-slate-200 dark:border-white/10">OCR import</span>
                    </div>
                </div>

                <div className="w-full">
                    <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white shadow-2xl text-black overflow-hidden relative">
                        {/* Light mode gradient behind form */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white to-slate-50 pointer-events-none -z-10" />

                        <div className="p-8">
                            {isConfigured ? (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-lg font-bold mb-1">Sign in or create an account</h2>
                                        <p className="text-sm text-gray-500">Use email or a social provider.</p>
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
                                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-900 leading-relaxed">
                                        <p className="font-bold mb-1">Auth not configured</p>
                                        <p>Set `NEXT_PUBLIC_USER_POOL_ID` and `NEXT_PUBLIC_USER_POOL_CLIENT_ID` to enable login.</p>
                                    </div>
                                    <p className="text-xs text-amber-900">Check `docs/SETUP.md` for configuration details.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
