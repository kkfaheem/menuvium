"use client";

import Link from "next/link";
import Image from "next/image";
import {
    ArrowRight,
    ArrowUpRight,
    Check,
    Clock,
    Layers,
    Menu,
    Palette,
    Plus,
    Minus,
    QrCode,
    Sparkles,
    Wand2,
    X,
} from "lucide-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/cn";

type ShowcaseTab = "editor" | "themes" | "publish" | "ar";
type PricingPeriod = "monthly" | "annual";

const SHOWCASE_TABS = [
    {
        id: "editor" as const,
        label: "Editor",
        icon: Wand2,
        title: "Edit menus at service speed",
        description: "Bulk updates, keyboard-first flows, and changes that stay organized even across large menus.",
        highlights: ["Fast category editing", "Bulk price updates", "Availability controls"],
        imageBase: "tour-editor-v6",
    },
    {
        id: "themes" as const,
        label: "Themes",
        icon: Palette,
        title: "Match your brand without design debt",
        description: "Tune layout, typography, and color in minutes while keeping a premium guest reading experience.",
        highlights: ["Brand-consistent styles", "Mobile-first previews", "Live visual changes"],
        imageBase: "tour-themes-v6",
    },
    {
        id: "publish" as const,
        label: "Publish",
        icon: QrCode,
        title: "One QR, always current",
        description: "Publish once and keep improving. Guests always scan the same code while your menu keeps evolving.",
        highlights: ["Stable QR endpoint", "Custom domains", "Instant propagation"],
        imageBase: "tour-publish-v6",
    },
    {
        id: "ar" as const,
        label: "AR",
        icon: Layers,
        title: "Add AR dishes when you want the wow",
        description: "Turn a short rotating dish video into photoreal 3D models for iOS and Android guest viewing.",
        highlights: ["Video to 3D pipeline", "iOS + Android support", "Poster + model output"],
        imageBase: "tour-ar-v6",
    },
] satisfies Array<{
    id: ShowcaseTab;
    label: string;
    icon: typeof Wand2;
    title: string;
    description: string;
    highlights: string[];
    imageBase: string;
}>;

const BENEFITS = [
    {
        icon: Clock,
        title: "Update in seconds",
        detail: "Prices, sold-out states, and hours go live immediately.",
    },
    {
        icon: QrCode,
        title: "Dynamic QR forever",
        detail: "Print once and keep evolving behind the same link.",
    },
    {
        icon: Palette,
        title: "Brand-first themes",
        detail: "Polished layouts that stay readable on every phone.",
    },
    {
        icon: Wand2,
        title: "AI import assist",
        detail: "Start from PDFs or photos and skip manual setup.",
    },
    {
        icon: Sparkles,
        title: "AR dish moments",
        detail: "Bring signature dishes into guests’ space in 3D.",
    },
] satisfies Array<{
    icon: typeof Clock;
    title: string;
    detail: string;
}>;

const HOW_STEPS = [
    {
        step: "01",
        title: "Build",
        detail: "Import or create your menu structure in one workspace.",
        imageBase: "tour-editor-v6",
    },
    {
        step: "02",
        title: "Style",
        detail: "Tune theme and presentation so your brand feels consistent.",
        imageBase: "tour-themes-v6",
    },
    {
        step: "03",
        title: "Publish",
        detail: "Push updates to the same QR instantly and optionally add AR.",
        imageBase: "tour-publish-v6",
    },
] satisfies Array<{
    step: string;
    title: string;
    detail: string;
    imageBase: string;
}>;

const TRUST_CHIPS = ["Bistro V", "Urban Eatery", "The Golden Spoon", "Caffeine Fix", "Pizza & Co"];

const FAQ_ITEMS = [
    {
        q: "Will my QR code change when I edit the menu?",
        a: "No. Your QR link stays stable while content updates behind it instantly.",
    },
    {
        q: "Can I customize the menu design?",
        a: "Yes. Theme controls let you tune layout and style while keeping mobile readability.",
    },
    {
        q: "Can I import an existing PDF menu?",
        a: "Yes. Upload a PDF or image set and Menuvium helps structure your content quickly.",
    },
    {
        q: "How does AR dish generation work?",
        a: "Upload a short rotating dish video and Menuvium generates model assets for mobile AR preview.",
    },
    {
        q: "Do guests need an app for AR?",
        a: "No separate app install is required; supported devices open AR through native viewers.",
    },
] as const;

const PRICING_TIERS = [
    {
        name: "Starter",
        priceMonthly: "$0",
        priceAnnual: "$0",
        note: "For trying Menuvium",
        highlight: false,
        ctaLabel: "Get started",
        ctaHref: "/login",
        features: ["1 company", "1 menu", "Dynamic QR", "Core theme controls"],
    },
    {
        name: "Studio",
        priceMonthly: "$29",
        priceAnnual: "$290",
        note: "For restaurants that update often",
        highlight: true,
        ctaLabel: "Start Studio",
        ctaHref: "/login",
        features: [
            "Multiple menus",
            "AI import assist",
            "Advanced theme studio",
            "Team collaboration",
            "AR dish generation",
        ],
    },
    {
        name: "Enterprise",
        priceMonthly: "Contact us",
        priceAnnual: "Contact us",
        note: "For groups with custom needs",
        highlight: false,
        ctaLabel: "Contact sales",
        ctaHref: "/contact?plan=enterprise",
        features: ["Custom roles", "Domain controls", "Priority support", "Deployment guidance"],
    },
] as const;

export default function Home() {
    const { user, authStatus } = useAuthenticator((context) => [context.user, context.authStatus]);
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const router = useRouter();
    const reduceMotion = useReducedMotion();

    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [showcaseTab, setShowcaseTab] = useState<ShowcaseTab>("editor");
    const [showcaseHovering, setShowcaseHovering] = useState(false);
    const [showcaseFocused, setShowcaseFocused] = useState(false);
    const [pricingPeriod, setPricingPeriod] = useState<PricingPeriod>("monthly");

    useEffect(() => {
        setMounted(true);
    }, [authStatus]);

    useEffect(() => {
        if (mounted && user) {
            router.push("/dashboard");
        }
    }, [user, mounted, router]);

    useEffect(() => {
        if (reduceMotion || showcaseHovering || showcaseFocused) return;
        const interval = window.setInterval(() => {
            setShowcaseTab((current) => {
                const idx = SHOWCASE_TABS.findIndex((tab) => tab.id === current);
                const next = SHOWCASE_TABS[(idx + 1) % SHOWCASE_TABS.length]?.id ?? SHOWCASE_TABS[0].id;
                return next;
            });
        }, 7000);
        return () => window.clearInterval(interval);
    }, [reduceMotion, showcaseHovering, showcaseFocused]);

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
            hidden: { opacity: 0, y: 18 },
            visible: { opacity: 1, y: 0 },
        };

    const activeShowcase = SHOWCASE_TABS.find((tab) => tab.id === showcaseTab) ?? SHOWCASE_TABS[0];
    const themeSuffix = resolvedTheme === "dark" ? "dark" : "light";

    const heroStudioImage = `/images/tour-editor-v6-${themeSuffix}@2x.png`;
    const heroGuestImage = "/images/hero/guest-view-reference.png";
    const heroArSceneImage = `/images/tour-ar-v6-${themeSuffix}@2x.png`;
    const heroArDishImage = "/images/hero/wagyu_burger.png";
    const heroQrImage = "/images/hero/qr-reference.png";
    const activeShowcaseImage = `/images/${activeShowcase.imageBase}-${themeSuffix}@2x.png`;

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

            <header className="sticky top-0 z-50 border-b border-border bg-panel/90 supports-[backdrop-filter]:bg-panel/75 backdrop-blur-xl">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
                    <Logo size="lg" />

                    <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-muted">
                        <Link href="#benefits" className="transition-colors hover:text-foreground">Benefits</Link>
                        <Link href="#how-it-works" className="transition-colors hover:text-foreground">How it works</Link>
                        <Link href="#showcase" className="transition-colors hover:text-foreground">Showcase</Link>
                        <Link href="#pricing" className="transition-colors hover:text-foreground">Pricing</Link>
                        <Link href="#faq" className="transition-colors hover:text-foreground">FAQ</Link>
                    </nav>

                    <div className="flex items-center gap-3">
                        <ThemeToggle />
                        <Link
                            href="/login"
                            className="hidden h-11 items-center justify-center rounded-xl border border-border bg-panelStrong px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-pill md:inline-flex"
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
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-panelStrong text-muted shadow-sm transition-colors hover:bg-pill hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30 md:hidden"
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
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
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
                                    { href: "#benefits", label: "Benefits" },
                                    { href: "#how-it-works", label: "How it works" },
                                    { href: "#showcase", label: "Showcase" },
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
                        </motion.div>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <main className="relative z-10">
                <section className="relative pb-20 pt-24 sm:pb-24 sm:pt-32 lg:pb-28 lg:pt-36">
                    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
                        <div className="grid items-center gap-14 lg:grid-cols-[0.9fr,1.1fr] lg:gap-16">
                            <motion.div
                                initial="hidden"
                                animate="visible"
                                variants={fadeUp ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                                className="max-w-2xl"
                            >
                                <motion.div
                                    variants={fadeUp}
                                    className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-panel/70 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted shadow-[var(--cms-shadow-sm)] backdrop-blur-xl dark:border-white/[0.12]"
                                >
                                    <Sparkles className="h-3.5 w-3.5 text-[var(--cms-accent-strong)]" />
                                    Built for modern restaurants
                                </motion.div>

                                <motion.h1
                                    variants={fadeUp}
                                    className="mt-6 max-w-[11ch] font-heading text-5xl font-extrabold tracking-[-0.03em] sm:text-6xl lg:text-[4.45rem] lg:leading-[0.95]"
                                >
                                    <span className="block">Digital menus.</span>
                                    <span className="block">Dynamic QR.</span>
                                    <span className="block">Immersive AR.</span>
                                </motion.h1>

                                <motion.p variants={fadeUp} className="mt-6 max-w-[64ch] text-base leading-relaxed text-muted sm:text-lg">
                                    One place to edit. A menu that evolves. A QR that never changes.
                                </motion.p>

                                <motion.div variants={fadeUp} className="mt-8 flex w-full max-w-[34rem] flex-col gap-4 sm:flex-row sm:items-center">
                                    <Link
                                        href="/login"
                                        className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-[var(--cms-accent)] px-6 text-base font-semibold text-white shadow-sm transition-all duration-200 ease-out hover:scale-[1.01] hover:bg-[var(--cms-accent-strong)] hover:shadow-[var(--cms-shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                                    >
                                        Start free <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                    <Link
                                        href="#showcase"
                                        className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-black/[0.08] bg-panel/52 px-6 text-base font-semibold text-foreground shadow-sm transition-all duration-200 ease-out hover:scale-[1.01] hover:bg-panel/72 hover:shadow-[var(--cms-shadow-sm)] dark:border-white/[0.12]"
                                    >
                                        See live demo
                                    </Link>
                                </motion.div>

                                <motion.ul variants={fadeUp} className="mt-7 grid gap-2 text-sm text-muted sm:grid-cols-3 sm:gap-3">
                                    {[
                                        "No app required",
                                        "Instant updates",
                                        "iOS & Android ready",
                                    ].map((line) => (
                                        <li key={line} className="flex items-start gap-2">
                                            <Check className="mt-0.5 h-4 w-4 text-emerald-400" />
                                            <span>{line}</span>
                                        </li>
                                    ))}
                                </motion.ul>
                            </motion.div>

                            <motion.div
                                initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.16 }}
                                className="relative mx-auto w-full max-w-[760px]"
                            >
                                <div className="hero-live-visual relative">
                                    <div className="hero-stage relative rounded-[2rem] p-1.5 sm:p-2">
                                        <div className="hero-mockup-label hero-mockup-label-tablet">Menu Studio</div>
                                        <div className="hero-stage-screen relative overflow-hidden rounded-[1.6rem] sm:rounded-[1.8rem]">
                                            <div className="relative aspect-[16/10] lg:aspect-[16/9]">
                                                <Image
                                                    src={heroStudioImage}
                                                    alt="Menuvium Studio editor preview"
                                                    fill
                                                    sizes="(min-width: 1024px) 42vw, 84vw"
                                                    quality={100}
                                                    className="object-cover object-top"
                                                    priority
                                                />
                                                <div className="hero-stage-screen-overlay" aria-hidden="true" />
                                                <div className="hero-stage-live-badge absolute right-3 top-3 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
                                                    <span className="hero-live-dot" />
                                                    Live
                                                </div>
                                            </div>
                                        </div>

                                        <div className="hero-qr-card absolute left-1/2 top-[10%] z-30 w-[24%] -translate-x-1/2 rounded-[0.34rem] p-[0.2rem] sm:w-[24%]">
                                            <div className="hero-mockup-label">Dynamic QR</div>
                                            <div className="hero-qr-grid rounded-[0.2rem]">
                                                <Image
                                                    src={heroQrImage}
                                                    alt="Dynamic QR code"
                                                    fill
                                                    sizes="(min-width: 1024px) 12vw, 22vw"
                                                    quality={100}
                                                    className="hero-qr-image"
                                                />
                                            </div>
                                        </div>

                                        <div className="hero-stack-phone absolute -bottom-12 left-[7%] z-20 w-[24.6%] rounded-[0.96rem] p-[0.11rem] sm:-bottom-12 sm:w-[24.6%]">
                                            <div className="hero-mockup-label">Guest View</div>
                                            <div className="hero-phone-screen relative overflow-hidden rounded-[0.78rem]">
                                                <span aria-hidden="true" className="hero-phone-punch" />
                                                <div className="hero-guest-preview relative aspect-[9/19]">
                                                    <Image
                                                        src={heroGuestImage}
                                                        alt="Guest menu mobile preview"
                                                        fill
                                                        sizes="(min-width: 1024px) 18vw, 30vw"
                                                        quality={96}
                                                        className="object-cover object-[50%_8%]"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="hero-stack-phone hero-stack-phone-ar absolute -bottom-12 left-[66%] z-20 w-[24.6%] rounded-[0.96rem] p-[0.11rem] sm:-bottom-12 sm:w-[24.6%]">
                                            <div className="hero-mockup-label">AR Mode</div>
                                            <div className="hero-phone-screen relative overflow-hidden rounded-[0.78rem]">
                                                <span aria-hidden="true" className="hero-phone-punch" />
                                                <div className="hero-ar-ui relative aspect-[9/19]">
                                                    <Image
                                                        src={heroArSceneImage}
                                                        alt="Restaurant scene"
                                                        fill
                                                        sizes="(min-width: 1024px) 18vw, 30vw"
                                                        quality={92}
                                                        className="hero-ar-scene-bg object-cover object-center"
                                                    />
                                                    <div aria-hidden="true" className="hero-ar-scene-vignette absolute inset-0" />
                                                    <div aria-hidden="true" className="hero-ar-table-plane absolute inset-x-0 bottom-0 h-[38%]" />

                                                    <div className="hero-ar-target absolute left-1/2 top-[56%] z-20 h-[44%] w-[86%] -translate-x-1/2 -translate-y-1/2">
                                                        <span className="hero-ar-corner hero-ar-corner-tl" />
                                                        <span className="hero-ar-corner hero-ar-corner-tr" />
                                                        <span className="hero-ar-corner hero-ar-corner-bl" />
                                                        <span className="hero-ar-corner hero-ar-corner-br" />
                                                    </div>

                                                    <div className="hero-ar-dish-wrap absolute inset-x-0 bottom-[14%] z-30 mx-auto h-[48%] w-[94%]">
                                                        <Image
                                                            src={heroArDishImage}
                                                            alt="Dish rendered in augmented reality"
                                                            fill
                                                            sizes="(min-width: 1024px) 16vw, 28vw"
                                                            quality={96}
                                                            className="object-contain drop-shadow-[0_22px_20px_rgba(0,0,0,0.45)]"
                                                        />
                                                    </div>

                                                    <div className="hero-ar-surface-shadow absolute left-1/2 top-[74%] z-20 h-5 w-[62%] -translate-x-1/2 rounded-[999px]" />
                                                    <div className="hero-ar-ui-controls absolute inset-x-0 bottom-3 z-40 flex items-end justify-center gap-2.5">
                                                        <span className="hero-ar-ui-btn hero-ar-ui-btn-side" />
                                                        <span className="hero-ar-ui-btn hero-ar-ui-btn-main" />
                                                        <span className="hero-ar-ui-btn hero-ar-ui-btn-side" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <section className="border-y border-border bg-panelStrong/62 backdrop-blur-xl">
                    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-9 sm:px-6 md:grid-cols-[1fr,1.45fr] md:items-center">
                        <p className="max-w-[58ch] text-sm font-medium text-muted">
                            Trusted by teams moving fast, from single-location dining rooms to multi-brand restaurant groups.
                        </p>
                        <div className="flex flex-wrap items-center justify-start gap-2.5 md:justify-end">
                            {TRUST_CHIPS.map((name) => (
                                <span
                                    key={name}
                                    className="inline-flex items-center rounded-full border border-border bg-panel/88 px-3.5 py-1.5 text-xs font-semibold tracking-[0.01em] text-muted"
                                >
                                    {name}
                                </span>
                            ))}
                        </div>
                    </div>
                </section>

                <section id="benefits" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-120px" }}
                        variants={sectionReveal ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                    >
                        <motion.div variants={sectionReveal} className="max-w-3xl space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Why Menuvium</p>
                            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.9rem] lg:leading-tight">
                                Built for teams that change menus daily, not quarterly.
                            </h2>
                            <p className="max-w-[64ch] text-sm leading-relaxed text-muted sm:text-base">
                                Every capability is designed to reduce busywork and keep guest experience consistent in real time.
                            </p>
                        </motion.div>

                        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            {BENEFITS.map(({ icon: Icon, title, detail }) => (
                                <motion.div
                                    key={title}
                                    variants={sectionReveal}
                                    whileHover={reduceMotion ? undefined : { y: -3 }}
                                    className="rounded-2xl border border-border bg-panel/78 p-5 shadow-[var(--cms-shadow-sm)] backdrop-blur-xl transition-colors hover:bg-panelStrong/78"
                                >
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pill">
                                        <Icon className="h-4.5 w-4.5 text-[var(--cms-accent)]" />
                                    </div>
                                    <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
                                    <p className="mt-2 text-sm text-muted">{detail}</p>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </section>

                <section id="how-it-works" className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24 lg:pb-28">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-120px" }}
                        variants={sectionReveal ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                        className="rounded-[2rem] border border-border bg-panel/72 p-6 shadow-[var(--cms-shadow-sm)] backdrop-blur-xl sm:p-10"
                    >
                        <motion.div variants={sectionReveal} className="max-w-3xl space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">How it works</p>
                            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">A focused 3-step loop.</h2>
                            <p className="max-w-[62ch] text-sm leading-relaxed text-muted sm:text-base">
                                Build once, polish fast, publish continuously. Each step has a clear owner and output.
                            </p>
                        </motion.div>

                        <div className="relative mt-10 grid gap-4 lg:grid-cols-3">
                            <div
                                aria-hidden="true"
                                className="pointer-events-none absolute left-[16%] right-[16%] top-[2.15rem] hidden h-px bg-gradient-to-r from-transparent via-white/[0.16] to-transparent lg:block"
                            />

                            {HOW_STEPS.map((step, idx) => (
                                <motion.div
                                    key={step.step}
                                    variants={sectionReveal}
                                    whileHover={reduceMotion ? undefined : { y: -3 }}
                                    transition={{ duration: 0.2 }}
                                    className="relative rounded-2xl border border-border bg-panelStrong/72 p-4 shadow-sm backdrop-blur-xl sm:p-5"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="inline-flex h-9 min-w-[2.4rem] items-center justify-center rounded-full border border-white/[0.16] bg-panel text-xs font-semibold text-foreground">
                                            {step.step}
                                        </div>
                                        <span className={cn("how-step-dot", idx === 1 ? "how-step-dot-delay" : "")} />
                                        <p className="text-sm font-semibold text-foreground">{step.title}</p>
                                    </div>
                                    <p className="mt-2 text-sm text-muted">{step.detail}</p>

                                    <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08] bg-[#05070f]">
                                        <div className="relative aspect-[16/9]">
                                            <Image
                                                src={`/images/${step.imageBase}-${themeSuffix}@2x.png`}
                                                alt={`${step.title} preview`}
                                                fill
                                                sizes="(min-width: 1024px) 28vw, (min-width: 640px) 44vw, 100vw"
                                                quality={92}
                                                className="object-cover object-top"
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </section>

                <section id="showcase" className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24 lg:pb-28">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-120px" }}
                        variants={sectionReveal ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                        className="rounded-[2.1rem] border border-border bg-panel/72 p-6 shadow-[var(--cms-shadow-sm)] backdrop-blur-xl sm:p-10"
                    >
                        <motion.div variants={sectionReveal} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div className="max-w-2xl space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Product showcase</p>
                                <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">One deep look inside Menuvium Studio.</h2>
                                <p className="max-w-[64ch] text-sm leading-relaxed text-muted sm:text-base">
                                    Explore the core workflow with large, readable screens and smooth transitions.
                                </p>
                            </div>

                            <div className="inline-flex w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-panel/88 p-1 text-xs font-semibold backdrop-blur-xl sm:w-auto">
                                {SHOWCASE_TABS.map((tab) => {
                                    const Icon = tab.icon;
                                    const active = tab.id === showcaseTab;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setShowcaseTab(tab.id)}
                                            className={cn(
                                                "inline-flex h-10 items-center gap-2 rounded-xl px-3 whitespace-nowrap transition-colors",
                                                active
                                                    ? "bg-panelStrong text-foreground shadow-[var(--cms-shadow-sm)]"
                                                    : "text-muted hover:bg-pill hover:text-foreground"
                                            )}
                                            aria-pressed={active}
                                        >
                                            <Icon className="h-4 w-4" />
                                            {tab.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>

                        <motion.div
                            variants={sectionReveal}
                            onMouseEnter={() => setShowcaseHovering(true)}
                            onMouseLeave={() => setShowcaseHovering(false)}
                            onFocusCapture={() => setShowcaseFocused(true)}
                            onBlurCapture={(e) => {
                                const next = e.relatedTarget as Node | null;
                                if (!next || !e.currentTarget.contains(next)) {
                                    setShowcaseFocused(false);
                                }
                            }}
                            className="mt-8"
                        >
                            <div className="relative overflow-hidden rounded-[2rem] border border-border bg-panelStrong/76 p-3 shadow-[var(--cms-shadow-md)] sm:p-4">
                                <div className="relative overflow-hidden rounded-[1.6rem] border border-white/[0.08] bg-[#05070f] sm:rounded-[1.8rem]">
                                    <AnimatePresence mode="wait" initial={false}>
                                        <motion.div
                                            key={activeShowcase.id}
                                            initial={reduceMotion ? undefined : { opacity: 0 }}
                                            animate={reduceMotion ? undefined : { opacity: 1 }}
                                            exit={reduceMotion ? undefined : { opacity: 0 }}
                                            transition={{ duration: 0.42, ease: "easeInOut" }}
                                            className="relative"
                                        >
                                            <div className="relative aspect-[16/10] lg:aspect-[16/9]">
                                                <Image
                                                    src={activeShowcaseImage}
                                                    alt={`${activeShowcase.label} view in Menuvium Studio`}
                                                    fill
                                                    sizes="(min-width: 1280px) 74vw, (min-width: 1024px) 86vw, 100vw"
                                                    quality={100}
                                                    className="object-cover object-top"
                                                />
                                            </div>
                                        </motion.div>
                                    </AnimatePresence>
                                </div>
                            </div>

                            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr,1fr] lg:items-start">
                                <div>
                                    <p className="text-sm font-semibold text-foreground">{activeShowcase.title}</p>
                                    <p className="mt-2 max-w-[64ch] text-sm text-muted sm:text-base">{activeShowcase.description}</p>
                                </div>
                                <ul className="grid gap-2 text-sm text-muted sm:grid-cols-3 lg:grid-cols-1">
                                    {activeShowcase.highlights.map((line) => (
                                        <li key={line} className="flex items-start gap-2">
                                            <Check className="mt-0.5 h-4 w-4 text-emerald-400" />
                                            <span>{line}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </motion.div>
                    </motion.div>
                </section>

                <section id="pricing" className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24 lg:pb-28">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-120px" }}
                        variants={sectionReveal ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                    >
                        <motion.div variants={sectionReveal} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                            <div className="max-w-3xl space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Pricing</p>
                                <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Simple plans, clear upgrade path.</h2>
                                <p className="max-w-[62ch] text-sm leading-relaxed text-muted sm:text-base">
                                    Start lean, then move to Studio when your team needs faster collaboration and richer guest experiences.
                                </p>
                            </div>

                            <div className="inline-flex w-full rounded-2xl border border-border bg-panelStrong/72 p-1 text-xs font-semibold backdrop-blur-xl sm:w-auto">
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
                                                active
                                                    ? "bg-panel text-foreground shadow-[var(--cms-shadow-sm)]"
                                                    : "text-muted hover:bg-pill hover:text-foreground"
                                            )}
                                            aria-pressed={active}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>

                        <div className="mt-10 grid gap-4 lg:grid-cols-3">
                            {PRICING_TIERS.map((tier) => {
                                const price = pricingPeriod === "annual" ? tier.priceAnnual : tier.priceMonthly;
                                const suffix =
                                    price === "Contact us" || price === "$0"
                                        ? ""
                                        : pricingPeriod === "annual"
                                            ? "/year"
                                            : "/month";

                                return (
                                    <motion.div
                                        key={tier.name}
                                        variants={sectionReveal}
                                        className={cn(
                                            "relative rounded-[2rem] border p-6 shadow-[var(--cms-shadow-sm)] backdrop-blur-xl",
                                            tier.highlight
                                                ? "border-[var(--cms-accent)] bg-[var(--cms-accent-subtle)]"
                                                : "border-border bg-panel/78"
                                        )}
                                    >
                                        {tier.highlight ? (
                                            <span className="absolute -top-3 left-6 rounded-full bg-[var(--cms-accent)] px-3 py-1 text-xs font-semibold text-white">
                                                Most popular
                                            </span>
                                        ) : null}

                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold text-foreground">{tier.name}</p>
                                                <p className="mt-1 text-sm text-muted">{tier.note}</p>
                                            </div>
                                        </div>

                                        <div className="mt-6 flex items-end gap-2">
                                            <p className="font-heading text-4xl font-bold tracking-tight">{price}</p>
                                            <p className="pb-1 text-sm text-muted">{suffix}</p>
                                        </div>

                                        <ul className="mt-6 space-y-3 text-sm">
                                            {tier.features.map((feature) => (
                                                <li key={feature} className="flex items-start gap-2 text-muted">
                                                    <Check className="mt-0.5 h-4 w-4 text-emerald-400" />
                                                    <span>{feature}</span>
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
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>
                </section>

                <section id="faq" className="mx-auto max-w-5xl px-4 pb-20 sm:px-6 sm:pb-24 lg:pb-28">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-120px" }}
                        variants={sectionReveal ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                    >
                        <motion.div variants={sectionReveal} className="text-center">
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">FAQ</p>
                            <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight sm:text-4xl">Questions, answered clearly.</h2>
                        </motion.div>

                        <motion.div variants={sectionReveal} className="mt-10 divide-y divide-border rounded-3xl border border-border bg-panel/78 shadow-sm backdrop-blur-xl">
                            {FAQ_ITEMS.map(({ q, a }) => (
                                <details key={q} className="group p-6">
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
                                        <span className="font-semibold text-foreground">{q}</span>
                                        <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-panelStrong text-muted transition-colors group-hover:bg-pill group-open:text-foreground">
                                            <Plus className="h-4 w-4 group-open:hidden" />
                                            <Minus className="hidden h-4 w-4 group-open:block" />
                                        </span>
                                    </summary>
                                    <p className="mt-3 text-sm leading-relaxed text-muted">{a}</p>
                                </details>
                            ))}
                        </motion.div>
                    </motion.div>
                </section>
            </main>
        </div>
    );
}
