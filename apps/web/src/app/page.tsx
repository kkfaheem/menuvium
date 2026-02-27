"use client";

import Link from "next/link";
import Image from "next/image";
import {
    ArrowRight,
    Sparkles,
    Check,
    QrCode,
    Palette,
    Wand2,
    Clock,
    Layers,
    ArrowUpRight,
    Minus,
    Plus,
    Menu,
    X,
    Sparkle
} from "lucide-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/cn";

type TourTab = "editor" | "themes" | "ar" | "publish";
type PricingPeriod = "monthly" | "annual";

const TOUR_TABS = [
    {
        id: "editor" as const,
        label: "Editor",
        icon: Wand2,
        title: "A calm editor built for speed",
        description:
            "Create categories, items, photos, and availability in one flow — designed to feel obvious on day one.",
        highlights: ["Keyboard-friendly editing", "Bulk updates in seconds", "Live availability + pricing"],
        imageBase: "tour-editor-v6",
    },
    {
        id: "themes" as const,
        label: "Themes",
        icon: Palette,
        title: "Theme studio that feels premium",
        description:
            "Pick a layout, tune the vibe, and preview instantly. Guests get a clean, branded experience on any device.",
        highlights: ["Modern layouts", "Brand colors + typography", "Mobile-first guest preview"],
        imageBase: "tour-themes-v6",
    },
    {
        id: "ar" as const,
        label: "AR",
        icon: Layers,
        title: "Photoreal AR dishes from a video",
        description:
            "Upload a short rotating dish video. We generate a photoreal 3D model guests can view in their room — iOS + Android.",
        highlights: ["Video → 3D model pipeline", "View in your room (iOS + Android)", "Fast previews + posters"],
        imageBase: "tour-ar-v6",
    },
    {
        id: "publish" as const,
        label: "Publish",
        icon: QrCode,
        title: "One QR. Infinite updates.",
        description:
            "Publish once and keep improving. Your QR link stays stable while the menu evolves behind the scenes.",
        highlights: ["Stable QR link", "Custom domains", "Instant publish"],
        imageBase: "tour-publish-v6",
    },
] satisfies Array<{
    id: TourTab;
    label: string;
    icon: typeof Wand2;
    title: string;
    description: string;
    highlights: string[];
    imageBase: string;
}>;

export default function Home() {
    const { user, authStatus } = useAuthenticator(context => [context.user, context.authStatus]);
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const router = useRouter();
    const reduceMotion = useReducedMotion();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [tourTab, setTourTab] = useState<TourTab>("editor");
    const [tourHovering, setTourHovering] = useState(false);
    const [tourFocused, setTourFocused] = useState(false);
    const [pricingPeriod, setPricingPeriod] = useState<PricingPeriod>("monthly");

    useEffect(() => {
        setMounted(true);
    }, [authStatus]);

    useEffect(() => {
        if (mounted && user) {
            router.push('/dashboard');
        }
    }, [user, mounted, router]);

    useEffect(() => {
        if (reduceMotion || tourHovering || tourFocused) return;
        const interval = window.setInterval(() => {
            setTourTab((current) => {
                const idx = TOUR_TABS.findIndex((t) => t.id === current);
                const next = TOUR_TABS[(idx + 1) % TOUR_TABS.length]?.id ?? TOUR_TABS[0].id;
                return next;
            });
        }, 6500);
        return () => window.clearInterval(interval);
    }, [reduceMotion, tourFocused, tourHovering]);

    if (!mounted) {
        return <div className="min-h-screen bg-background" />;
    }

    const fadeUp = reduceMotion
        ? undefined
        : {
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0 },
        };

    const sectionReveal = reduceMotion
        ? undefined
        : {
            hidden: { opacity: 0, y: 14 },
            visible: { opacity: 1, y: 0 },
        };

    const activeTour = TOUR_TABS.find((t) => t.id === tourTab) ?? TOUR_TABS[0];
    const themeSuffix = resolvedTheme === "dark" ? "dark" : "light";
    const heroPreviewImage = `/images/tour-editor-v6-${themeSuffix}@2x.png`;
    const activeTourImage = `/images/${activeTour.imageBase}-${themeSuffix}@2x.png`;

    return (
        <div className="landing-shell min-h-screen overflow-x-hidden bg-transparent text-foreground selection:bg-[var(--cms-accent-subtle)] transition-colors">
            {/* Top nav */}
            <header className="sticky top-0 z-50 border-b border-border bg-panel/95 supports-[backdrop-filter]:bg-panel/80 backdrop-blur-xl">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
                    <Logo size="lg" />

                    <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-muted">
                        <Link href="#features" className="hover:text-foreground transition-colors">Features</Link>
                        <Link href="#how-it-works" className="hover:text-foreground transition-colors">How it works</Link>
                        <Link href="#pricing" className="hover:text-foreground transition-colors">Pricing</Link>
                        <Link href="#faq" className="hover:text-foreground transition-colors">FAQ</Link>
                    </nav>

                    <div className="flex items-center gap-3">
                        <ThemeToggle />
                        <Link
                            href="/login"
                            className="hidden md:inline-flex h-11 items-center justify-center rounded-xl border border-border bg-panelStrong px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-pill"
                        >
                            Log in
                        </Link>
                        <Link
                            href="/login"
                            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--cms-accent)] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--cms-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                        >
                            Get started <ArrowUpRight className="ml-1 h-4 w-4" />
                        </Link>
                        <button
                            type="button"
                            className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-panelStrong text-muted shadow-sm transition-colors hover:bg-pill hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                            aria-label="Open menu"
                            onClick={() => setMobileNavOpen(true)}
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </header>

            <AnimatePresence>
                {mobileNavOpen ? (
                    <motion.div
                        className="fixed inset-0 z-[60] md:hidden"
                        initial={reduceMotion ? undefined : { opacity: 0 }}
                        animate={reduceMotion ? undefined : { opacity: 1 }}
                        exit={reduceMotion ? undefined : { opacity: 0 }}
                    >
                        <button
                            type="button"
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                            aria-label="Close menu"
                            onClick={() => setMobileNavOpen(false)}
                        />
                        <motion.div
                            className="relative mx-4 mt-4 rounded-3xl border border-border bg-panel p-4 shadow-[var(--cms-shadow-lg)]"
                            initial={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
                            animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                            exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
                            transition={{ duration: 0.18 }}
                        >
                            <div className="flex items-center justify-between">
                                <Logo size="lg" />
                                <div className="flex items-center gap-2">
                                    <ThemeToggle />
                                    <button
                                        type="button"
                                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-panelStrong text-muted shadow-sm transition-colors hover:bg-pill hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                                        aria-label="Close menu"
                                        onClick={() => setMobileNavOpen(false)}
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 space-y-1">
                                {[
                                    { href: "#features", label: "Features" },
                                    { href: "#how-it-works", label: "How it works" },
                                    { href: "#pricing", label: "Pricing" },
                                    { href: "#faq", label: "FAQ" },
                                ].map((item) => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setMobileNavOpen(false)}
                                        className="flex h-11 items-center justify-between rounded-2xl px-3 text-sm font-semibold text-foreground transition-colors hover:bg-pill"
                                    >
                                        {item.label}
                                        <ArrowRight className="h-4 w-4 text-muted" />
                                    </Link>
                                ))}
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <Link
                                    href="/login"
                                    onClick={() => setMobileNavOpen(false)}
                                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-border bg-panelStrong px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-pill"
                                >
                                    Log in
                                </Link>
                                <Link
                                    href="/login"
                                    onClick={() => setMobileNavOpen(false)}
                                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-[var(--cms-accent)] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--cms-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                                >
                                    Get started <ArrowUpRight className="ml-1 h-4 w-4" />
                                </Link>
                            </div>
                        </motion.div>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <main>
                {/* Hero */}
                <section className="relative py-24 sm:py-28 lg:py-32">
                    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
                        <div className="grid items-center gap-14 lg:grid-cols-[0.74fr,1.26fr] lg:gap-16">
                            <motion.div
                                initial="hidden"
                                animate="visible"
                                variants={fadeUp ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                                className="max-w-xl space-y-8"
                            >
                                <motion.div
                                    variants={fadeUp}
                                    className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-panel/70 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted shadow-[var(--cms-shadow-sm)] backdrop-blur-xl dark:border-white/[0.12]"
                                >
                                    <Sparkles className="h-3.5 w-3.5 text-[var(--cms-accent-strong)]" />
                                    Built for modern restaurants
                                </motion.div>

                                <div className="space-y-5">
                                    <motion.h1
                                        variants={fadeUp}
                                        className="max-w-[13ch] font-heading text-5xl font-bold tracking-tight sm:text-6xl lg:text-[4.25rem] lg:leading-[1.02]"
                                    >
                                        Run your QR menu <span className="text-[var(--cms-accent)]">live.</span>
                                    </motion.h1>

                                    <motion.p variants={fadeUp} className="max-w-[35ch] text-base leading-relaxed text-muted sm:text-lg">
                                        Edit instantly. Publish in seconds. Add photoreal AR.
                                    </motion.p>
                                </div>

                                <motion.div
                                    variants={fadeUp}
                                    className="inline-flex w-full max-w-[460px] flex-col gap-3 rounded-2xl bg-panel/60 p-2.5 shadow-[var(--cms-shadow-sm)] backdrop-blur-xl sm:flex-row sm:items-center"
                                >
                                    <Link
                                        href="/login"
                                        className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-[var(--cms-accent)] px-6 text-base font-semibold text-white shadow-sm transition-all duration-200 ease-out hover:scale-[1.02] hover:bg-[var(--cms-accent-strong)] hover:shadow-[var(--cms-shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                                    >
                                        Start free <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                    <Link
                                        href="#how-it-works"
                                        className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-black/[0.08] bg-panel/45 px-6 text-base font-semibold text-foreground shadow-sm transition-all duration-200 ease-out hover:scale-[1.02] hover:bg-panel/70 hover:shadow-[var(--cms-shadow-sm)] dark:border-white/[0.12]"
                                    >
                                        Watch workflow
                                    </Link>
                                </motion.div>

                                <motion.p variants={fadeUp} className="text-xs text-muted">
                                    No app install for guests. Works on iOS and Android.
                                </motion.p>
                            </motion.div>

                            <motion.div
                                initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.12 }}
                                className="relative mx-auto w-full max-w-[940px] lg:max-w-[1180px] lg:translate-x-8"
                            >
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-x-6 bottom-6 top-4 rounded-[2.9rem] bg-[radial-gradient(84%_78%_at_50%_52%,color-mix(in_srgb,var(--cms-accent)_20%,transparent),transparent)] blur-2xl"
                                />
                                <motion.div
                                    animate={reduceMotion ? { y: 0 } : { y: [0, -3, 0] }}
                                    transition={reduceMotion ? undefined : { duration: 9, repeat: Infinity, ease: "easeInOut" }}
                                    className="relative"
                                >
                                    <div className="relative overflow-hidden rounded-[2.4rem] shadow-[var(--cms-shadow-lg)]">
                                        <div
                                            className="relative aspect-[16/10] overflow-hidden rounded-[2.4rem]"
                                            style={{
                                                WebkitMaskImage: "radial-gradient(140% 125% at 52% 50%, #000 62%, transparent 100%)",
                                                maskImage: "radial-gradient(140% 125% at 52% 50%, #000 62%, transparent 100%)",
                                            }}
                                        >
                                            <Image
                                                src={heroPreviewImage}
                                                alt="Editing a menu item in Menuvium"
                                                fill
                                                sizes="(min-width: 1024px) 66vw, 100vw"
                                                quality={100}
                                                className="origin-center scale-[1.2] object-cover object-[57%_44%] sm:scale-[1.14]"
                                                priority
                                            />
                                        </div>
                                    </div>

                                    <motion.div
                                        initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
                                        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                                        transition={{ duration: 0.32, delay: 0.25 }}
                                        className="absolute bottom-3 left-4 right-4 rounded-2xl border border-black/[0.08] bg-panel/72 p-4 shadow-[var(--cms-shadow-md)] backdrop-blur-xl dark:border-white/[0.12] sm:left-auto sm:right-6 sm:w-[320px]"
                                    >
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Live update</p>
                                        <p className="mt-1.5 text-sm font-semibold text-foreground">Update prices instantly</p>
                                        <p className="mt-1 text-xs leading-relaxed text-muted">
                                            Edit once in the studio. Guests see the change immediately on the same QR menu.
                                        </p>
                                    </motion.div>
                                </motion.div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* Social proof */}
                <section className="border-y border-border bg-panelStrong/70 backdrop-blur-xl">
                    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-2 md:items-center">
                        <p className="text-sm font-semibold text-muted">
                            Trusted by teams moving fast — from single locations to multi‑brand groups.
                        </p>
                        <div className="flex flex-wrap items-center justify-start gap-3 md:justify-end">
                            {["Bistro V", "Urban Eatery", "The Golden Spoon", "Caffeine Fix", "Pizza & Co"].map((name) => (
                                <span
                                    key={name}
                                    className="inline-flex items-center rounded-full border border-border bg-panel px-3 py-1.5 text-xs font-semibold text-muted"
                                >
                                    {name}
                                </span>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Features */}
                <section id="features" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-120px" }}
                        variants={sectionReveal ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                        className="grid gap-10 lg:grid-cols-[1fr,1.1fr] lg:items-start"
                    >
                        <motion.div variants={sectionReveal} className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Features</p>
                            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                                Minimal UI. Maximum control.
                            </h2>
                            <p className="max-w-xl text-sm leading-relaxed text-muted sm:text-base">
                                Everything you need to ship a beautiful QR menu — without dragging your team into spreadsheet chaos.
                            </p>
                        </motion.div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {[
                                { icon: Layers, title: "Menus, categories, items", desc: "A clean editor designed for fast change." },
                                { icon: Wand2, title: "AI import", desc: "Drop a PDF or images — we extract the structure." },
                                { icon: Palette, title: "Theme studio", desc: "Make it match your brand in minutes." },
                                { icon: QrCode, title: "Dynamic QR", desc: "Change the menu forever. QR never changes." },
                                { icon: Clock, title: "Availability", desc: "Sold out? Update instantly from any device." },
                                { icon: Sparkles, title: "Photoreal AR dishes", desc: "Upload a rotating dish video — we generate the 3D model." },
                            ].map(({ icon: Icon, title, desc }) => (
                                <motion.div
                                    key={title}
                                    variants={sectionReveal}
                                    whileHover={reduceMotion ? undefined : { y: -3 }}
                                    className="h-full rounded-2xl border border-border bg-panel/80 p-5 shadow-sm backdrop-blur-xl transition-colors hover:bg-panelStrong/80"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pill">
                                            <Icon className="h-5 w-5 text-[var(--cms-accent-strong)]" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold">{title}</p>
                                            <p className="mt-1 text-sm text-muted">{desc}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </section>

                {/* How it works + Tour */}
                <section id="how-it-works" className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-20">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-120px" }}
                        variants={sectionReveal ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                        className="rounded-[2rem] border border-border bg-panel/75 p-6 shadow-[var(--cms-shadow-sm)] backdrop-blur-xl sm:p-10"
                    >
                        <motion.div variants={sectionReveal} className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">How it works</p>
                            <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Create → publish → improve.</h2>
                            <p className="text-sm text-muted">A simple loop: build the menu, keep it fresh, and add AR when you want the wow.</p>
                        </motion.div>

                        <motion.div
                            variants={sectionReveal}
                            onMouseEnter={() => setTourHovering(true)}
                            onMouseLeave={() => setTourHovering(false)}
                            onFocusCapture={() => setTourFocused(true)}
                            onBlurCapture={(e) => {
                                const next = e.relatedTarget as Node | null;
                                if (!next || !e.currentTarget.contains(next)) {
                                    setTourFocused(false);
                                }
                            }}
                            className="mt-8 rounded-3xl border border-border bg-panelStrong/70 p-6 shadow-sm backdrop-blur-xl sm:p-8"
                        >
                            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Tour</p>
                                    <h3 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">See it in action</h3>
                                    <p className="text-sm text-muted">Editor, themes, publishing, and AR — one workflow.</p>
                                </div>
                                <div className="inline-flex w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-panel/85 p-1 text-xs font-semibold backdrop-blur-xl md:w-auto">
                                    {TOUR_TABS.map((tab) => {
                                        const Icon = tab.icon;
                                        const active = tab.id === tourTab;
                                        return (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                onClick={() => setTourTab(tab.id)}
                                                className={cn(
                                                    "inline-flex h-10 items-center gap-2 rounded-xl px-3 whitespace-nowrap transition-colors",
                                                    active
                                                        ? "bg-panelStrong text-foreground shadow-[var(--cms-shadow-sm)]"
                                                        : "text-muted hover:text-foreground hover:bg-pill"
                                                )}
                                                aria-pressed={active}
                                            >
                                                <Icon className="h-4 w-4" />
                                                {tab.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="mt-8 grid gap-8 lg:grid-cols-[0.9fr,1.1fr] lg:items-center">
                                <div className="space-y-4">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1.5 text-xs font-semibold text-muted">
                                        <Sparkle className="h-3.5 w-3.5 text-[var(--cms-accent-strong)]" />
                                        {activeTour.label}
                                    </div>
                                    <h3 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{activeTour.title}</h3>
                                    <p className="text-sm leading-relaxed text-muted sm:text-base">{activeTour.description}</p>

                                    <ul className="grid gap-2 text-sm">
                                        {activeTour.highlights.map((line) => (
                                            <li key={line} className="flex items-start gap-2 text-muted">
                                                <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
                                                <span>{line}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="relative">
                                    <div
                                        className="absolute -inset-6 rounded-[2.25rem] bg-[var(--cms-accent-subtle)] blur-2xl"
                                        aria-hidden="true"
                                    />
	                                    <div className="relative overflow-hidden rounded-[2rem] bg-panel shadow-[var(--cms-shadow-md)] ring-1 ring-border/45">
	                                        <AnimatePresence mode="wait" initial={false}>
	                                            <motion.div
	                                                key={activeTour.id}
	                                                initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
	                                                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
	                                                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
	                                                transition={{ duration: 0.28 }}
	                                                className="relative"
	                                            >
	                                                <div className="relative aspect-[16/10]">
	                                                    <Image
	                                                        src={activeTourImage}
	                                                        alt={`${activeTour.label} preview`}
	                                                        fill
	                                                        sizes="(min-width: 1024px) 55vw, 100vw"
	                                                        quality={95}
	                                                        className="object-cover object-center"
	                                                    />
	                                                </div>
	                                            </motion.div>
	                                        </AnimatePresence>
	                                    </div>
	                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </section>

                {/* Pricing */}
                <section id="pricing" className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-20">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Pricing</p>
                            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                                Simple plans to get started.
                            </h2>
                            <p className="max-w-xl text-sm leading-relaxed text-muted sm:text-base">
                                Prices shown are placeholders — the structure is here so the landing page feels complete.
                            </p>
                        </div>

                        <div className="inline-flex w-full rounded-2xl border border-border bg-panelStrong/70 p-1 text-xs font-semibold backdrop-blur-xl sm:w-auto">
                            {[
                                { id: "monthly" as const, label: "Monthly" },
                                { id: "annual" as const, label: "Annual (2 months free)" },
                            ].map((opt) => {
                                const active = opt.id === pricingPeriod;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setPricingPeriod(opt.id)}
                                        className={cn(
                                            "h-10 rounded-xl px-3 whitespace-nowrap transition-colors",
                                            active ? "bg-panel text-foreground shadow-[var(--cms-shadow-sm)]" : "text-muted hover:text-foreground hover:bg-pill"
                                        )}
                                        aria-pressed={active}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-10 grid gap-4 lg:grid-cols-3">
                        {[
                            {
                                name: "Starter",
                                priceMonthly: "$0",
                                priceAnnual: "$0",
                                note: "Best for trying Menuvium",
                                highlight: false,
                                ctaLabel: "Get started",
                                ctaHref: "/login",
                                features: ["1 company", "1 menu", "QR link", "Basic themes"],
                            },
                            {
                                name: "Studio",
                                priceMonthly: "$29",
                                priceAnnual: "$290",
                                note: "Best for restaurants that want AR",
                                highlight: true,
                                ctaLabel: "Get started",
                                ctaHref: "/login",
                                features: [
                                    "Multiple menus",
                                    "AI import",
                                    "Theme studio",
                                    "Team access",
                                    "Photoreal AR (video → 3D)",
                                    "AR for iOS + Android",
                                ],
                            },
                            {
                                name: "Enterprise",
                                priceMonthly: "Contact us",
                                priceAnnual: "Contact us",
                                note: "Best for multi‑brand groups & custom needs",
                                highlight: false,
                                ctaLabel: "Contact us",
                                ctaHref: "/contact?plan=enterprise",
                                features: ["SSO options", "Advanced permissions", "Custom domains", "Priority support"],
                            },
                        ].map((tier) => {
                            const price = pricingPeriod === "annual" ? tier.priceAnnual : tier.priceMonthly;
                            const suffix =
                                price === "Contact us" || price === "$0"
                                    ? ""
                                    : pricingPeriod === "annual"
                                        ? "/year"
                                        : "/month";
                            return (
                                <div
                                    key={tier.name}
                                    className={cn(
                                        "rounded-[2rem] border p-6 shadow-[var(--cms-shadow-sm)] backdrop-blur-xl",
                                        tier.highlight
                                            ? "border-[var(--cms-accent)] bg-[var(--cms-accent-subtle)]"
                                            : "border-border bg-panel/80"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold">{tier.name}</p>
                                            <p className="mt-1 text-sm text-muted">{tier.note}</p>
                                        </div>
                                        {tier.highlight ? (
                                            <span className="rounded-full bg-[var(--cms-accent)] px-3 py-1 text-xs font-semibold text-white">
                                                Popular
                                            </span>
                                        ) : null}
                                    </div>

                                    <div className="mt-6 flex items-end gap-2">
                                        <p className="font-heading text-4xl font-bold tracking-tight">{price}</p>
                                        <p className="pb-1 text-sm text-muted">{suffix}</p>
                                    </div>

                                    {pricingPeriod === "annual" && tier.name === "Studio" ? (
                                        <p className="mt-2 text-xs text-muted">
                                            Equivalent to <span className="font-semibold">$24.17</span>/month billed annually.
                                        </p>
                                    ) : null}

                                    <ul className="mt-6 space-y-3 text-sm">
                                        {tier.features.map((f) => (
                                            <li key={f} className="flex items-start gap-2">
                                                <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
                                                <span className="text-muted">{f}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <Link
                                        href={tier.ctaHref}
                                        className={cn(
                                            "mt-8 inline-flex h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold shadow-sm transition-colors",
                                            tier.highlight
                                                ? "bg-[var(--cms-accent)] text-white hover:bg-[var(--cms-accent-strong)]"
                                                : "border border-border bg-panelStrong text-foreground hover:bg-pill"
                                        )}
                                    >
                                        {tier.ctaLabel} <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* FAQ */}
                <section id="faq" className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 sm:pb-24">
                    <div className="text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">FAQ</p>
                        <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                            Questions, answered.
                        </h2>
                    </div>

                    <div className="mt-10 divide-y divide-border rounded-3xl border border-border bg-panel/80 shadow-sm backdrop-blur-xl">
                        {[
                            {
                                q: "Will my QR code change when I edit the menu?",
                                a: "No. The QR stays stable — edits publish instantly behind the same link.",
                            },
                            {
                                q: "Can I customize the design?",
                                a: "Yes. Pick a theme, tweak the look, and preview instantly — guests get a clean mobile-first menu.",
                            },
                            {
                                q: "Can I import a PDF menu?",
                                a: "Yes. Upload a PDF or images and Menuvium can parse the structure for you.",
                            },
                            {
                                q: "How do AR dishes work?",
                                a: "Upload a short rotating dish video. We generate a 3D model (GLB/USDZ) plus a poster image for fast previews.",
                            },
                            {
                                q: "Do guests need to install an app for AR?",
                                a: "No. On iPhone, AR opens in Quick Look. On Android, it opens in Google’s Scene Viewer (may prompt for AR support).",
                            },
                            {
                                q: "Can teammates edit menus?",
                                a: "Yes. Invite users and control permissions per company.",
                            },
                            {
                                q: "Does this work on iPhone and Android?",
                                a: "Yes. Public menus are mobile‑first and load fast. AR opens with USDZ on iOS and GLB on Android when available.",
                            },
                            {
                                q: "How long does AR generation take?",
                                a: "It depends on the video and quality settings. You can keep working while it processes — the menu still updates instantly.",
                            },
                            {
                                q: "Can I use my own domain?",
                                a: "Yes. You can point a custom domain to your menu so it matches your brand.",
                            },
                        ].map(({ q, a }) => (
                            <details key={q} className="group p-6">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
                                    <span className="font-semibold">{q}</span>
                                    <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-panelStrong text-muted transition-colors group-hover:bg-pill group-open:text-foreground">
                                        <Plus className="h-4 w-4 group-open:hidden" />
                                        <Minus className="h-4 w-4 hidden group-open:block" />
                                    </span>
                                </summary>
                                <p className="mt-3 text-sm text-muted leading-relaxed">{a}</p>
                            </details>
                        ))}
                    </div>
                </section>

                {/* Final CTA */}
                <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-24">
                    <div className="rounded-3xl border border-border bg-panel/80 p-8 shadow-sm backdrop-blur-xl sm:p-12">
                        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Get started</p>
                                <h3 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                                    Launch your menu studio today.
                                </h3>
                                <p className="text-sm text-muted">
                                    Build, publish, and iterate — with a workflow your team will actually enjoy.
                                </p>
                            </div>
                            <Link
                                href="/login"
                                className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--cms-accent)] px-6 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[var(--cms-accent-strong)]"
                            >
                                Create account <ArrowUpRight className="ml-2 h-4 w-4" />
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-border bg-panelStrong/75 backdrop-blur-xl">
                <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 md:items-start">
                    <div className="space-y-3">
                        <Logo size="lg" />
                        <p className="max-w-sm text-sm text-muted">
                            Menuvium is a modern operating system for QR menus — built for speed, designed for calm.
                        </p>
                    </div>
                    <div className="grid gap-10 sm:grid-cols-3 text-sm">
                        <div className="space-y-3">
                            <p className="font-semibold">Product</p>
                            <Link href="#features" className="block text-muted hover:text-foreground">Features</Link>
                            <Link href="#pricing" className="block text-muted hover:text-foreground">Pricing</Link>
                            <Link href="/login" className="block text-muted hover:text-foreground">Sign in</Link>
                        </div>
                        <div className="space-y-3">
                            <p className="font-semibold">Resources</p>
                            <Link href="#how-it-works" className="block text-muted hover:text-foreground">How it works</Link>
                            <Link href="#faq" className="block text-muted hover:text-foreground">FAQ</Link>
                            <Link href="/login" className="block text-muted hover:text-foreground">Create account</Link>
                        </div>
                        <div className="space-y-3">
                            <p className="font-semibold">Contact</p>
                            <a className="block text-muted hover:text-foreground" href="mailto:support@menuvium.com">Support</a>
                            <a className="block text-muted hover:text-foreground" href="mailto:sales@menuvium.com">Sales</a>
                            <a className="block text-muted hover:text-foreground" href="mailto:security@menuvium.com">Security</a>
                        </div>
                    </div>
                </div>
                <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
                    <p className="text-xs text-muted">&copy; {new Date().getFullYear()} Menuvium. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}
