"use client";

import { Authenticator, ThemeProvider, useAuthenticator } from "@aws-amplify/ui-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Fraunces, Space_Grotesk } from "next/font/google";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["600", "700"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"] });

export default function LoginPage() {
    const router = useRouter();
    const { authStatus } = useAuthenticator(context => [context.authStatus]);

    useEffect(() => {
        if (authStatus === 'authenticated') {
            router.push('/onboarding');
        }
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
                        80: "#F28C28",
                        90: "#D97706",
                        100: "#B45309"
                    }
                }
            },
            radii: { small: "12px", medium: "16px", large: "20px" },
            components: {
                button: {
                    primary: {
                        backgroundColor: "#141414",
                        color: "#FFFFFF",
                        _hover: { backgroundColor: "#2A2A2A" }
                    },
                    link: {
                        color: "#B45309"
                    }
                },
                fieldcontrol: {
                    borderColor: "#E5E7EB",
                    _focus: { borderColor: "#F28C28", boxShadow: "0 0 0 2px rgba(242,140,40,0.2)" }
                }
            }
        }
    };

    return (
        <div className={`min-h-screen bg-[#0B0B0B] text-white ${spaceGrotesk.className}`}>
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-32 -left-32 h-72 w-72 rounded-full bg-amber-500/20 blur-[120px]" />
                <div className="absolute bottom-[-120px] right-[-120px] h-80 w-80 rounded-full bg-emerald-400/10 blur-[140px]" />
            </div>

            <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-10 px-6 py-16 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
                <div className="space-y-6">
                    <p className="text-xs uppercase tracking-[0.4em] text-white/60">Menuvium</p>
                    <h1 className={`text-4xl md:text-5xl font-bold tracking-tight ${fraunces.className}`}>
                        Login to the menu studio
                    </h1>
                    <p className="text-base text-white/60 max-w-md">
                        Design menus that feel premium on every phone. Launch faster with import, edit, and themes.
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-white/40">
                        <span className="px-3 py-1 rounded-full border border-white/10">Mobile-first</span>
                        <span className="px-3 py-1 rounded-full border border-white/10">Theme-ready</span>
                        <span className="px-3 py-1 rounded-full border border-white/10">OCR import</span>
                    </div>
                </div>

                <div className="w-full">
                    <div className="rounded-3xl border border-white/10 bg-white p-8 shadow-2xl text-black">
                        {isConfigured ? (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-bold mb-1">Sign in or create an account</h2>
                                    <p className="text-sm text-gray-500">Use email or a social provider.</p>
                                </div>
                                <ThemeProvider theme={amplifyTheme}>
                                    <Authenticator
                                        loginMechanisms={["email"]}
                                        socialProviders={hasOAuth ? ["google", "apple", "facebook"] : []}
                                        signUpAttributes={["email", "name"]}
                                    />
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
    );
}
