"use client";

import Link from "next/link";
import Image from "next/image";
import {
    MoveRight,
    ChefHat,
    ArrowRight,
    Play,
    Sparkles,
    Zap,
    Smartphone,
    Layout
} from "lucide-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useScroll, useTransform } from "framer-motion";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
    const { user, authStatus } = useAuthenticator(context => [context.user, context.authStatus]);
    const [mounted, setMounted] = useState(false);
    const router = useRouter();
    const { scrollYProgress } = useScroll();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const headerOpacity = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

    useEffect(() => {
        setMounted(true);
    }, [authStatus]);

    useEffect(() => {
        if (mounted && user) {
            router.push('/dashboard');
        }
    }, [user, mounted, router]);

    if (!mounted) {
        return <div className="min-h-screen bg-[var(--cms-bg)]" />;
    }

    // Animation variants
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: 0.2
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
            transition: { type: "spring", stiffness: 100 }
        }
    };

    return (
        <div className="min-h-screen bg-[var(--cms-bg)] text-[var(--cms-text)] font-sans selection:bg-[var(--cms-accent)]/20 transition-colors">
            {/* Navigation */}
            <motion.nav
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                className="fixed top-0 left-0 right-0 z-50 bg-[var(--cms-panel)]/80 backdrop-blur-md border-b border-[var(--cms-border)]"
            >
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-[var(--cms-accent)] rounded-lg flex items-center justify-center text-white shadow-lg shadow-[#FF5A1F]/20">
                            <ChefHat size={20} />
                        </div>
                        <span className="text-xl font-bold tracking-tight">Menuvium</span>
                    </div>

                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-[var(--cms-muted)]">
                        <Link href="#features" className="hover:text-[var(--cms-accent)] transition-colors">Features</Link>
                        <Link href="#how-it-works" className="hover:text-[var(--cms-accent)] transition-colors">How it Works</Link>
                        <Link href="#pricing" className="hover:text-[var(--cms-accent)] transition-colors">Pricing</Link>
                    </div>

                    <div className="flex items-center gap-4">
                        <ThemeToggle />
                        <Link
                            href="/login"
                            className="hidden md:block text-sm font-semibold text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                        >
                            Log in
                        </Link>
                        <Link
                            href="/login"
                            className="px-5 py-2.5 bg-[#FF5A1F] hover:bg-[#E04812] text-white text-sm font-semibold rounded-full transition-all hover:shadow-lg hover:shadow-[#FF5A1F]/20 active:scale-95"
                        >
                            Get Started
                        </Link>
                    </div>
                </div>
            </motion.nav>

            <main className="pt-32 pb-16 overflow-hidden">
                {/* Hero Section */}
                <section className="px-6 max-w-7xl mx-auto mb-24 md:mb-32 relative">
                    {/* Abstract Shapes */}
                    <div className="absolute top-0 right-0 -z-10 opacity-30 dark:opacity-20 pointer-events-none">
                        <div className="absolute top-10 right-10 w-64 h-64 bg-[#FF5A1F] rounded-full blur-[100px] animate-pulse" />
                        <div className="absolute top-40 right-60 w-72 h-72 bg-purple-500 rounded-full blur-[120px] animate-pulse delay-700" />
                    </div>

                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="flex flex-col items-center text-center max-w-4xl mx-auto"
                    >
                        <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-50 dark:bg-orange-500/10 text-[#FF5A1F] text-sm font-semibold mb-8 border border-orange-100 dark:border-orange-500/20">
                            <Sparkles size={14} />
                            <span>Reimagined Menu Management</span>
                        </motion.div>

                        <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-8 text-[var(--cms-text)]">
                            Your menu, <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF5A1F] to-[#FF8A50]">
                                perfectly synced.
                            </span>
                        </motion.h1>

                        <motion.p variants={itemVariants} className="text-xl text-[var(--cms-muted)] mb-10 max-w-2xl leading-relaxed">
                            Create, edit, and publish your digital menus instantly.
                            Say goodbye to PDF uploads and outdated prices.
                            One system to rule them all.
                        </motion.p>

                        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center gap-4 mb-16">
                            <Link
                                href="/login"
                                className="px-8 py-4 bg-[#FF5A1F] hover:bg-[#E04812] text-white font-semibold rounded-full transition-all hover:scale-105 shadow-xl shadow-[#FF5A1F]/20 flex items-center gap-2 group"
                            >
                                Start Free Trial
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </Link>
                            <button className="px-8 py-4 bg-[var(--cms-panel)] border border-[var(--cms-border)] hover:bg-[var(--cms-panel-strong)] text-[var(--cms-text)] font-semibold rounded-full transition-all flex items-center gap-2">
                                <Play size={16} fill="currentColor" />
                                Watch Demo
                            </button>
                        </motion.div>
                    </motion.div>

                    {/* Hero Assets */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6, duration: 0.8 }}
                        className="relative max-w-6xl mx-auto"
                    >
                        <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] aspect-[16/9] lg:aspect-[2/1] group">
                            {/* Main Dashboard Image */}
                            <Image
                                src="/images/dashboard-mockup.png"
                                alt="Menuvium Dashboard"
                                fill
                                className="object-cover object-top transition-transform duration-700 group-hover:scale-[1.01]"
                                priority
                            />

                            {/* Overlay Gradient for Dark Mode */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

                            {/* Floating Helper UI */}
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 1, duration: 0.8 }}
                                className="absolute -bottom-10 -right-10 md:bottom-[-20px] md:right-[-20px] w-48 md:w-64 aspect-[9/19] rounded-[2rem] shadow-2xl border-4 border-[var(--cms-panel)] overflow-hidden hidden sm:block ring-1 ring-[var(--cms-border)]"
                            >
                                <Image
                                    src="/images/mobile-preview.png"
                                    alt="Menuvium Mobile Preview"
                                    fill
                                    className="object-cover"
                                />
                            </motion.div>
                        </div>
                    </motion.div>
                </section>

                {/* Social Proof */}
                <section className="py-12 border-y border-[var(--cms-border)] bg-[var(--cms-panel)]/40 mb-24 backdrop-blur-sm">
                    <div className="max-w-7xl mx-auto px-6 text-center">
                        <p className="text-sm font-semibold text-[var(--cms-muted)] uppercase tracking-wider mb-8">
                            Powering Next-Gen Kitchens
                        </p>
                        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                            {/* Placeholders for logos */}
                            {['Bistro V', 'The Golden Spoon', 'Urban Eatery', 'Caffeine Fix', 'Pizza & Co'].map((name, i) => (
                                <div key={i} className="text-xl font-bold font-serif text-[var(--cms-muted)] flex items-center gap-2">
                                    <div className="w-8 h-8 bg-[var(--cms-pill)] rounded-full" />
                                    <span className="hidden sm:inline">{name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Features Grid */}
                <section id="features" className="max-w-7xl mx-auto px-6 mb-32">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold text-[var(--cms-text)] mb-6">
                            Constructed for <br />
                            <span className="text-[#FF5A1F]">Infinite Scalability</span>
                        </h2>
                        <p className="text-lg text-[var(--cms-muted)] max-w-2xl mx-auto">
                            Whether you manage one menu or one hundred, the experience is identical.
                            Menuvium abstracts the complexity so you can focus on the food.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            {
                                icon: <Layout className="w-6 h-6 text-blue-500" />,
                                title: "Unified Command Center",
                                desc: "One dashboard to control every item, price, and description. Changes propagate instantly.",
                                color: "bg-blue-500/10"
                            },
                            {
                                icon: <Smartphone className="w-6 h-6 text-[#FF5A1F]" />,
                                title: "Dynamic QR Menus",
                                desc: "Beautiful, mobile-first menus that update in real-time. No more re-printing QR codes.",
                                color: "bg-orange-500/10"
                            },
                            {
                                icon: <Zap className="w-6 h-6 text-purple-500" />,
                                title: "Real-time Availability",
                                desc: "Mark items as 'Sold Out' instantly. Keep your customers happy and your staff stress-free.",
                                color: "bg-purple-500/10"
                            }
                        ].map((feature, i) => (
                            <motion.div
                                key={i}
                                whileHover={{ y: -5 }}
                                className="p-8 rounded-3xl bg-[var(--cms-panel)] border border-[var(--cms-border)] shadow-xl hover:shadow-2xl transition-all"
                            >
                                <div className={`w-12 h-12 ${feature.color} rounded-xl flex items-center justify-center mb-6`}>
                                    {feature.icon}
                                </div>
                                <h3 className="text-xl font-bold text-[var(--cms-text)] mb-3">{feature.title}</h3>
                                <p className="text-[var(--cms-muted)] leading-relaxed">
                                    {feature.desc}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </section>

                {/* CTA Section */}
                <section className="max-w-4xl mx-auto px-6 text-center mb-24">
                    <div className="relative p-12 rounded-[2.5rem] bg-[var(--cms-panel)] border border-[var(--cms-border)] overflow-hidden">
                        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#FF5A1F]/20 blur-[100px] rounded-full" />
                        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/10 blur-[100px] rounded-full" />

                        <div className="relative z-10">
                            <h2 className="text-4xl font-bold text-[var(--cms-text)] mb-6">
                                Ready to streamline your kitchen?
                            </h2>
                            <p className="text-[var(--cms-muted)] mb-10 text-lg max-w-xl mx-auto">
                                Join the future of menu management. Simple, fast, and beautiful.
                            </p>
                            <Link
                                href="/login"
                                className="inline-flex items-center justify-center px-10 py-5 bg-[#FF5A1F] hover:bg-[#E04812] text-white text-lg font-bold rounded-full transition-all hover:scale-105 shadow-xl shadow-[#FF5A1F]/30"
                            >
                                Get Started Now
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="bg-[var(--cms-panel)]/40 py-16 border-t border-[var(--cms-border)]">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-start gap-12">
                    <div>
                        <div className="flex items-center gap-2 mb-6">
                            <div className="w-8 h-8 bg-[#FF5A1F] rounded-lg flex items-center justify-center text-white">
                                <ChefHat size={20} />
                            </div>
                            <span className="text-xl font-bold tracking-tight text-[var(--cms-text)]">Menuvium</span>
                        </div>
                        <p className="text-[var(--cms-muted)] max-w-xs">
                            The modern operating system for digital menus. <br />
                            Built for speed, designed for growth.
                        </p>
                    </div>

                    <div className="flex gap-16 text-sm">
                        <div className="flex flex-col gap-4">
                            <span className="font-bold text-[var(--cms-text)]">Product</span>
                            <a href="#" className="text-[var(--cms-muted)] hover:text-[var(--cms-accent)]">Features</a>
                            <a href="#" className="text-[var(--cms-muted)] hover:text-[var(--cms-accent)]">Integrations</a>
                            <a href="#" className="text-[var(--cms-muted)] hover:text-[var(--cms-accent)]">Pricing</a>
                        </div>
                        <div className="flex flex-col gap-4">
                            <span className="font-bold text-[var(--cms-text)]">Company</span>
                            <a href="#" className="text-[var(--cms-muted)] hover:text-[var(--cms-accent)]">About</a>
                            <a href="#" className="text-[var(--cms-muted)] hover:text-[var(--cms-accent)]">Blog</a>
                            <a href="#" className="text-[var(--cms-muted)] hover:text-[var(--cms-accent)]">Careers</a>
                        </div>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto px-6 mt-16 pt-8 border-t border-[var(--cms-border)] text-center text-[var(--cms-muted)] text-sm">
                    &copy; 2025 Menuvium. All rights reserved.
                </div>
            </footer>
        </div>
    );
}
