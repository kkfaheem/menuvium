"use client";

import Link from "next/link";
import { MoveRight } from "lucide-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
    const { user, authStatus } = useAuthenticator(context => [context.user, context.authStatus]);
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
    }, [authStatus]);

    useEffect(() => {
        if (mounted && user) {
            router.push('/dashboard');
        }
    }, [user, mounted, router]);

    // To prevent hydration mismatch, we must ensure the client renders 
    // exactly what the server did for the first frame.
    if (!mounted) {
        return <div className="min-h-screen bg-[#0a0a0a]" suppressHydrationWarning />;
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] text-white selection:bg-blue-500/30">
            {/* Background Glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[25%] -left-[10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full" />
                <div className="absolute -bottom-[25%] -right-[10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full" />
            </div>

            <main className="relative z-10 flex flex-col items-center text-center px-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-blue-400 mb-8 animate-fade-in">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    Phase 1 Live
                </div>

                <h1 className="text-6xl md:text-8xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
                    Menuvium
                </h1>

                <p className="text-xl md:text-2xl text-white/60 max-w-2xl mb-12 leading-relaxed">
                    The future of dining is dynamic. Create, manage, and scale your
                    digital menus with the power of <span className="text-white">Next.js</span> & <span className="text-white">AWS</span>.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                    <Link
                        href="/login"
                        className="group relative px-8 py-4 bg-white text-black font-semibold rounded-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                    >
                        Get Started
                        <MoveRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Link>

                    <Link
                        href="https://github.com"
                        className="px-8 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold rounded-xl transition-all"
                    >
                        View Documentation
                    </Link>
                </div>
            </main>

            <footer className="absolute bottom-10 text-white/40 text-sm">
                Built with Antigravity &mdash; 2025
            </footer>
        </div>
    );
}
