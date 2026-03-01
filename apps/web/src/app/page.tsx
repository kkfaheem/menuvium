"use client";

import Link from "next/link";
import Image from "next/image";
import {
    ArrowRight,
    ArrowUpRight,
    ChevronLeft,
    ChevronRight,
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
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/cn";

type ShowcaseTab = "editor" | "themes" | "publish" | "ar";
type PricingPeriod = "monthly" | "annual";
type HeroFocusCard = "studio" | "qr" | "guest" | "ar";
type HeroPhoneCard = Exclude<HeroFocusCard, "studio">;
type HeroFocusSlide = "studio" | "trio";
type HeroFocusOffset = { x: number; y: number };
type HeroPhoneFrame = { left: number; top: number; width: number; height: number };

const HERO_FOCUS_CARDS: HeroFocusCard[] = ["studio", "qr", "guest", "ar"];
const HERO_PHONE_CARDS: HeroPhoneCard[] = ["qr", "guest", "ar"];
const HERO_FOCUS_SLIDES: HeroFocusSlide[] = ["studio", "trio"];
const HERO_FOCUS_STEP_MS = 3500;
const HERO_FOCUS_ACTIVE_SCALES: Record<HeroFocusCard, number> = {
    studio: 1.03,
    qr: 1,
    guest: 1,
    ar: 1,
};
const HERO_FOCUS_ZERO_OFFSETS: Record<HeroFocusCard, HeroFocusOffset> = {
    studio: { x: 0, y: 0 },
    qr: { x: 0, y: 0 },
    guest: { x: 0, y: 0 },
    ar: { x: 0, y: 0 },
};
const HERO_PHONE_ZERO_LAYOUT: Record<HeroPhoneCard, HeroPhoneFrame> = {
    qr: { left: 0, top: 0, width: 0, height: 0 },
    guest: { left: 0, top: 0, width: 0, height: 0 },
    ar: { left: 0, top: 0, width: 0, height: 0 },
};

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

const FAQ_ITEMS = [
    {
        q: "Will my QR code change when I edit the menu?",
        a: "No. Your QR link stays stable while content updates behind it instantly.",
    },
    {
        q: "Can I import an existing PDF menu?",
        a: "Yes. Upload a PDF and Menuvium helps parse your menu into editable sections and items.",
    },
    {
        q: "Can I import multiple files at once?",
        a: "Yes. You can import multiple menu files in one flow, including PDFs and images.",
    },
    {
        q: "Can I import from a URL instead of uploading files?",
        a: "Yes. Paste a public URL and Menuvium can parse supported menu content from that link.",
    },
    {
        q: "Can I import a Menuvium export ZIP?",
        a: "Yes. You can upload a Menuvium export ZIP to bring over menu data and related assets quickly.",
    },
    {
        q: "Can I customize the menu design?",
        a: "Yes. Theme controls let you tune layout, typography, and color while keeping mobile readability.",
    },
    {
        q: "Can I switch between different visual themes?",
        a: "Yes. Each menu can use different built-in themes, and you can update theme choices whenever needed.",
    },
    {
        q: "Can I add photos to menu items?",
        a: "Yes. Items support photos, and you can update or replace them as your menu changes.",
    },
    {
        q: "Can I manage sold-out items quickly?",
        a: "Yes. Availability can be toggled per item so guests see sold-out states without reprinting anything.",
    },
    {
        q: "Can sold-out items be hidden on the public menu?",
        a: "Yes. Sold-out behavior supports dimming or hiding, based on your display preference.",
    },
    {
        q: "Does the public menu support search?",
        a: "Yes. Guests can search by item name or description directly on the public menu page.",
    },
    {
        q: "Can guests filter by dietary tags and allergens?",
        a: "Yes. Public menus support dietary and allergen filtering when those tags are added to items.",
    },
    {
        q: "Can I define my own dietary tags and allergens?",
        a: "Yes. You can manage dietary tags and allergen labels in settings and apply them to items.",
    },
    {
        q: "How does AR dish generation work?",
        a: "Upload a short rotating dish video and Menuvium generates model assets for mobile AR preview.",
    },
    {
        q: "Do guests need an app for AR?",
        a: "No separate app install is required; supported devices open AR through native viewers.",
    },
    {
        q: "What if AR generation is still processing?",
        a: "Menuvium tracks AR status and updates progress until model assets are ready.",
    },
    {
        q: "Can my team collaborate on the same company?",
        a: "Yes. You can invite teammates by email and control what each person can do.",
    },
    {
        q: "Can I set different permissions for team members?",
        a: "Yes. Permissions can be set for availability changes, item editing, and menu management.",
    },
    {
        q: "Can I manage multiple companies and menus?",
        a: "Yes. The dashboard supports multiple companies, each with its own menus and settings.",
    },
    {
        q: "Can I reorder categories and items?",
        a: "Yes. Menu structure is editable with drag-and-drop reordering for categories and items.",
    },
    {
        q: "Can I preview the public menu before sharing it?",
        a: "Yes. Each menu has a public page preview so you can verify updates before sharing with guests.",
    },
    {
        q: "Do you support custom domains?",
        a: "Custom domain support is available on higher tiers for teams that need branded links.",
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
    const [heroFocusSlide, setHeroFocusSlide] = useState<HeroFocusSlide>("studio");
    const [heroFocusOffsets, setHeroFocusOffsets] = useState<Record<HeroFocusCard, HeroFocusOffset>>(HERO_FOCUS_ZERO_OFFSETS);
    const [heroPhoneLayout, setHeroPhoneLayout] = useState<Record<HeroPhoneCard, HeroPhoneFrame>>(HERO_PHONE_ZERO_LAYOUT);
    const heroSceneRef = useRef<HTMLDivElement | null>(null);
    const heroCardRefs = useRef<Record<HeroFocusCard, HTMLDivElement | null>>({
        studio: null,
        qr: null,
        guest: null,
        ar: null,
    });

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

    useEffect(() => {
        if (reduceMotion) return;
        const interval = window.setInterval(() => {
            setHeroFocusSlide((current) => {
                const idx = HERO_FOCUS_SLIDES.indexOf(current);
                const next = HERO_FOCUS_SLIDES[(idx + 1) % HERO_FOCUS_SLIDES.length] ?? HERO_FOCUS_SLIDES[0];
                return next;
            });
        }, HERO_FOCUS_STEP_MS);
        return () => window.clearInterval(interval);
    }, [reduceMotion]);

    useEffect(() => {
        const scene = heroSceneRef.current;
        if (!scene) return;

        let frame = 0;
        const scheduleRecalc = () => {
            if (frame) window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => {
                const studioCard = heroCardRefs.current.studio;
                const qrCard = heroCardRefs.current.qr;
                const guestCard = heroCardRefs.current.guest;
                const arCard = heroCardRefs.current.ar;
                if (!studioCard || !qrCard || !guestCard || !arCard) return;
                const tabletLeft = studioCard.offsetLeft;
                const tabletTop = studioCard.offsetTop;
                const tabletWidth = studioCard.offsetWidth;
                const tabletHeight = studioCard.offsetHeight;
                const phoneHeight = tabletHeight;
                const phoneWidth = phoneHeight * (9 / 19);
                const desiredInset = Math.min(24, Math.max(6, tabletWidth * 0.018));
                const maxInsetToFit = Math.max(0, (tabletWidth - phoneWidth * 3) / 2);
                const groupInset = Math.min(desiredInset, maxInsetToFit);
                const groupLeft = tabletLeft + groupInset;
                const groupWidth = tabletWidth - groupInset * 2;
                const qrLeft = groupLeft;
                const arLeft = groupLeft + groupWidth - phoneWidth;
                const phoneGap = Math.max(0, (arLeft - qrLeft - phoneWidth * 2) / 2);
                const guestLeft = qrLeft + phoneWidth + phoneGap;
                const round1 = (value: number) => Math.round(value * 10) / 10;

                const nextPhoneLayout: Record<HeroPhoneCard, HeroPhoneFrame> = {
                    qr: {
                        left: round1(qrLeft),
                        top: round1(tabletTop),
                        width: round1(phoneWidth),
                        height: round1(phoneHeight),
                    },
                    guest: {
                        left: round1(guestLeft),
                        top: round1(tabletTop),
                        width: round1(phoneWidth),
                        height: round1(phoneHeight),
                    },
                    ar: {
                        left: round1(arLeft),
                        top: round1(tabletTop),
                        width: round1(phoneWidth),
                        height: round1(phoneHeight),
                    },
                };

                setHeroPhoneLayout((prev) => {
                    const changed = HERO_PHONE_CARDS.some((card) => {
                        const framePrev = prev[card];
                        const frameNext = nextPhoneLayout[card];
                        const dl = Math.abs(framePrev.left - frameNext.left);
                        const dt = Math.abs(framePrev.top - frameNext.top);
                        const dw = Math.abs(framePrev.width - frameNext.width);
                        const dh = Math.abs(framePrev.height - frameNext.height);
                        return dl > 0.5 || dt > 0.5 || dw > 0.5 || dh > 0.5;
                    });
                    return changed ? nextPhoneLayout : prev;
                });

                setHeroFocusOffsets((prev) => {
                    const changed = HERO_FOCUS_CARDS.some((card) => prev[card].x !== 0 || prev[card].y !== 0);
                    return changed ? HERO_FOCUS_ZERO_OFFSETS : prev;
                });
            });
        };

        scheduleRecalc();

        const observer = new ResizeObserver(scheduleRecalc);
        observer.observe(scene);
        for (const card of HERO_FOCUS_CARDS) {
            const cardNode = heroCardRefs.current[card];
            if (cardNode) observer.observe(cardNode);
        }
        window.addEventListener("resize", scheduleRecalc);

        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener("resize", scheduleRecalc);
        };
    }, [mounted]);

    const activeShowcase = SHOWCASE_TABS.find((tab) => tab.id === showcaseTab) ?? SHOWCASE_TABS[0];
    const ActiveShowcaseIcon = activeShowcase.icon;
    const activeShowcaseIndex = Math.max(0, SHOWCASE_TABS.findIndex((tab) => tab.id === activeShowcase.id));
    const resetHowItWorksShowcase = () => {
        setShowcaseTab("editor");
        setShowcaseHovering(false);
        setShowcaseFocused(false);
    };
    const stepShowcase = (delta: number) => {
        const total = SHOWCASE_TABS.length;
        const nextIndex = (activeShowcaseIndex + delta + total) % total;
        const next = SHOWCASE_TABS[nextIndex];
        if (next) setShowcaseTab(next.id);
    };
    const themeSuffix = resolvedTheme === "dark" ? "dark" : "light";

    const heroStudioImage = `/images/tour-editor-v6-${themeSuffix}@2x.png`;
    const heroGuestImage = "/images/hero/guest-view-reference.png";
    const heroArSceneImage = `/images/tour-ar-v6-${themeSuffix}@2x.png`;
    const heroArDishImage = "/images/hero/wagyu_burger.png";
    const heroQrScanPhoneImage = "/images/hero/qr-scan-phone-reference.jpg";
    const activeShowcaseImage = `/images/${activeShowcase.imageBase}-${themeSuffix}@2x.png`;

    useEffect(() => {
        const preloadSources = [
            heroStudioImage,
            heroGuestImage,
            heroArSceneImage,
            heroArDishImage,
            heroQrScanPhoneImage,
            activeShowcaseImage,
        ];

        preloadSources.forEach((src) => {
            const img = new window.Image();
            img.decoding = "async";
            img.loading = "eager";
            img.src = src;
        });
    }, [heroStudioImage, heroGuestImage, heroArSceneImage, heroArDishImage, heroQrScanPhoneImage, activeShowcaseImage]);

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
    const getHeroFocusState = (card: HeroFocusCard): "active" | "inactive" | "static" => {
        if (reduceMotion) return "static";
        if (heroFocusSlide === "studio") return card === "studio" ? "active" : "inactive";
        return card === "studio" ? "inactive" : "active";
    };
    const getHeroFocusStyle = (card: HeroFocusCard): CSSProperties => {
        const activeScale = HERO_FOCUS_ACTIVE_SCALES[card];
        return {
            "--focus-shift-x": `${heroFocusOffsets[card].x}px`,
            "--focus-shift-y": `${heroFocusOffsets[card].y}px`,
            "--focus-active-scale": `${activeScale}`,
        } as CSSProperties;
    };
    const getHeroPhoneLayoutStyle = (card: HeroPhoneCard): CSSProperties => {
        const frame = heroPhoneLayout[card];
        if (frame.width <= 0 || frame.height <= 0) return {};
        return {
            left: `${frame.left}px`,
            top: `${frame.top}px`,
            width: `${frame.width}px`,
            height: `${frame.height}px`,
        };
    };

    return (
        <div className="landing-shell relative isolate min-h-screen overflow-x-hidden bg-transparent text-foreground selection:bg-[var(--cms-accent-subtle)] transition-colors">
            <div aria-hidden="true" className="landing-bg">
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

            <header className="glass-surface !fixed inset-x-0 top-0 z-50 border-b border-border bg-panel/90 supports-[backdrop-filter]:bg-panel/75 backdrop-blur-xl">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
                    <Logo size="lg" />

                    <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-muted">
                        <Link
                            href="#how-it-works"
                            onClick={resetHowItWorksShowcase}
                            className="transition-colors hover:text-foreground"
                        >
                            How it works
                        </Link>
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
                            className="glass-surface relative mx-4 mt-4 rounded-3xl border border-border bg-panel p-4 shadow-[var(--cms-shadow-lg)]"
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
                                    { href: "#how-it-works", label: "How it works" },
                                    { href: "#pricing", label: "Pricing" },
                                    { href: "#faq", label: "FAQ" },
                                ].map((item) => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => {
                                            if (item.href === "#how-it-works") {
                                                resetHowItWorksShowcase();
                                            }
                                            setMobileNavOpen(false);
                                        }}
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

            <main className="relative z-10 pt-16">
                <section className="relative pb-10 pt-16 sm:pb-12 sm:pt-24 lg:pb-14 lg:pt-28">
                    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
                        <div className="grid items-center gap-14 lg:grid-cols-[0.9fr,1.1fr] lg:gap-10 xl:gap-12">
                            <motion.div
                                initial="hidden"
                                animate="visible"
                                variants={fadeUp ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                                className="max-w-2xl"
                            >
                                <motion.div
                                    variants={fadeUp}
                                    className="glass-surface inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-panel/70 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted shadow-[var(--cms-shadow-sm)] backdrop-blur-xl dark:border-white/[0.12]"
                                >
                                    <Sparkles className="h-3.5 w-3.5 text-[var(--cms-accent-strong)]" />
                                    Built for modern restaurants
                                </motion.div>

                                <motion.h1
                                    variants={fadeUp}
                                    className="mt-6 max-w-[11ch] font-heading text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl lg:text-[3.95rem] lg:leading-[0.96]"
                                >
                                    <span className="block">Digital menus.</span>
                                    <span className="block">Dynamic QR.</span>
                                    <span className="block">Immersive AR.</span>
                                </motion.h1>

                                <motion.p variants={fadeUp} className="mt-6 max-w-[64ch] text-sm leading-relaxed text-muted sm:text-base">
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
                                        href="#how-it-works"
                                        className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-black/[0.08] bg-panel/52 px-6 text-base font-semibold text-foreground shadow-sm transition-all duration-200 ease-out hover:scale-[1.01] hover:bg-panel/72 hover:shadow-[var(--cms-shadow-sm)] dark:border-white/[0.12]"
                                    >
                                        See live demo
                                    </Link>
                                </motion.div>

                                <motion.ul variants={fadeUp} className="mt-7 grid gap-2 text-xs text-muted sm:grid-cols-3 sm:gap-3 sm:text-sm">
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
                                transition={{ duration: 0.34, delay: 0.04 }}
                                className="relative mx-auto w-full max-w-[760px] lg:-ml-2 lg:mx-0"
                            >
                                <div
                                    className="hero-live-visual hero-focus-stack relative"
                                    data-focus-static={reduceMotion ? "true" : "false"}
                                    data-active-slide={heroFocusSlide}
                                >
                                    <div ref={heroSceneRef} className="hero-focus-scene relative">
                                        {/* Focus slideshow cards: keep these keys in sync with HERO_FOCUS_CARDS above when adding/removing slides. */}
                                        <div
                                            ref={(node) => {
                                                heroCardRefs.current.studio = node;
                                            }}
                                            className="hero-stage hero-focus-card hero-focus-card-studio relative top-2 mx-auto w-full sm:left-3 sm:top-3"
                                            data-focus-state={getHeroFocusState("studio")}
                                            style={getHeroFocusStyle("studio")}
                                        >
                                            <div className="hero-stage-screen relative overflow-hidden">
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
                                                </div>
                                            </div>
                                        </div>

                                        <div
                                            ref={(node) => {
                                                heroCardRefs.current.qr = node;
                                            }}
                                            className="hero-stack-phone hero-stack-phone-qr hero-focus-card hero-focus-card-qr absolute rounded-[0.96rem] p-[0.11rem]"
                                            data-focus-state={getHeroFocusState("qr")}
                                            style={{ ...getHeroFocusStyle("qr"), ...getHeroPhoneLayoutStyle("qr") }}
                                        >
                                            <div className="hero-phone-screen relative overflow-hidden rounded-[0.78rem]">
                                                <span aria-hidden="true" className="hero-phone-punch" />
                                                <div className="relative h-full w-full">
                                                    <Image
                                                        src={heroQrScanPhoneImage}
                                                        alt="Phone screen scanning a tabletop QR code menu in a restaurant"
                                                        fill
                                                        sizes="(min-width: 1024px) 18vw, 30vw"
                                                        quality={96}
                                                        priority
                                                        fetchPriority="high"
                                                        className="object-cover object-center"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div
                                            ref={(node) => {
                                                heroCardRefs.current.guest = node;
                                            }}
                                            className="hero-stack-phone hero-focus-card hero-focus-card-guest absolute rounded-[0.96rem] p-[0.11rem]"
                                            data-focus-state={getHeroFocusState("guest")}
                                            style={{ ...getHeroFocusStyle("guest"), ...getHeroPhoneLayoutStyle("guest") }}
                                        >
                                            <div className="hero-phone-screen relative overflow-hidden rounded-[0.78rem]">
                                                <span aria-hidden="true" className="hero-phone-punch" />
                                                <div className="hero-guest-preview relative h-full w-full">
                                                    <Image
                                                        src={heroGuestImage}
                                                        alt="Guest menu mobile preview"
                                                        fill
                                                        sizes="(min-width: 1024px) 18vw, 30vw"
                                                        quality={96}
                                                        priority
                                                        fetchPriority="high"
                                                        className="object-cover object-[50%_8%]"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div
                                            ref={(node) => {
                                                heroCardRefs.current.ar = node;
                                            }}
                                            className="hero-stack-phone hero-stack-phone-ar hero-focus-card hero-focus-card-ar absolute rounded-[0.96rem] p-[0.11rem]"
                                            data-focus-state={getHeroFocusState("ar")}
                                            style={{ ...getHeroFocusStyle("ar"), ...getHeroPhoneLayoutStyle("ar") }}
                                        >
                                            <div className="hero-phone-screen relative overflow-hidden rounded-[0.78rem]">
                                                <span aria-hidden="true" className="hero-phone-punch" />
                                                <div className="hero-ar-ui relative h-full w-full">
                                                    <Image
                                                        src={heroArSceneImage}
                                                        alt="Restaurant scene"
                                                        fill
                                                        sizes="(min-width: 1024px) 18vw, 30vw"
                                                        quality={92}
                                                        priority
                                                        fetchPriority="high"
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
                                                            priority
                                                            fetchPriority="high"
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
                        <motion.div
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: "-120px" }}
                            variants={sectionReveal ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                            className="mt-14 sm:mt-16 lg:mt-20"
                        >
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                                {BENEFITS.map(({ icon: Icon, title, detail }) => (
                                    <motion.div
                                        key={title}
                                        variants={sectionReveal}
                                        whileHover={reduceMotion ? undefined : { y: -3 }}
                                        className="glass-surface rounded-2xl border border-border bg-panel/78 p-5 shadow-[var(--cms-shadow-sm)] backdrop-blur-xl transition-colors hover:bg-panelStrong/78"
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
                    </div>
                </section>

                <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-120px" }}
                        variants={sectionReveal ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                        className="space-y-8"
                    >
                        <motion.div variants={sectionReveal} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div className="max-w-2xl space-y-1">
                                <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
                                <p className="text-sm text-muted sm:text-base">From menu edits to guest view in one smooth loop.</p>
                            </div>

                            <div className="w-full sm:hidden">
                                <div className="glass-surface relative overflow-hidden rounded-2xl border border-border bg-panel/88 p-1.5 backdrop-blur-xl dark:border-[#2a3346]/80 dark:bg-[#11131c]/84">
                                    <div className="grid grid-cols-[2.5rem,1fr,2.5rem] items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => stepShowcase(-1)}
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-panel text-muted transition-colors hover:bg-pill hover:text-foreground"
                                            aria-label="Previous step"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </button>

                                        <AnimatePresence mode="wait" initial={false}>
                                            <motion.button
                                                key={activeShowcase.id}
                                                type="button"
                                                onClick={() => stepShowcase(1)}
                                                initial={reduceMotion ? undefined : { opacity: 0, y: 4 }}
                                                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                                                exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                                                transition={{ duration: 0.22, ease: "easeOut" }}
                                                className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-xl bg-panelStrong px-3 text-sm font-semibold text-foreground shadow-[var(--cms-shadow-sm)] dark:bg-white/[0.16] dark:text-white dark:ring-1 dark:ring-white/25 dark:shadow-[0_10px_24px_rgba(0,0,0,0.42)]"
                                                aria-label="Next step"
                                            >
                                                <ActiveShowcaseIcon className="h-4 w-4 flex-none text-[var(--cms-accent-strong)]" />
                                                <span className="truncate">{activeShowcase.label}</span>
                                            </motion.button>
                                        </AnimatePresence>

                                        <button
                                            type="button"
                                            onClick={() => stepShowcase(1)}
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-panel text-muted transition-colors hover:bg-pill hover:text-foreground"
                                            aria-label="Next step"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-3 flex items-center justify-center gap-1.5">
                                    {SHOWCASE_TABS.map((tab, idx) => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setShowcaseTab(tab.id)}
                                            className={cn(
                                                "h-1.5 rounded-full transition-all",
                                                idx === activeShowcaseIndex
                                                    ? "w-7 bg-[var(--cms-accent)]"
                                                    : "w-2.5 bg-border hover:bg-muted/60"
                                            )}
                                            aria-label={`Go to ${tab.label}`}
                                            aria-pressed={idx === activeShowcaseIndex}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="glass-surface hidden w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-panel/88 p-1 text-xs font-semibold backdrop-blur-xl dark:border-[#2a3346]/80 dark:bg-[#11131c]/84 sm:inline-flex sm:w-auto">
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
                                                    ? "bg-panelStrong text-foreground shadow-[var(--cms-shadow-sm)] dark:bg-white/[0.16] dark:text-white dark:ring-1 dark:ring-white/25"
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
                            <div className="relative overflow-hidden rounded-[1.85rem] border border-black/10 bg-[#05070f] shadow-[var(--cms-shadow-md)] dark:border-[#2a3346]/85">
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
                                            <div
                                                aria-hidden="true"
                                                className={cn(
                                                    "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[24%] min-h-[112px] bg-gradient-to-t to-transparent backdrop-blur-[3px] sm:min-h-[126px]",
                                                    resolvedTheme === "dark"
                                                        ? "from-[rgba(5,7,15,0.96)] via-[rgba(5,7,15,0.72)]"
                                                        : "from-[rgba(255,255,255,0.92)] via-[rgba(255,255,255,0.68)]"
                                                )}
                                            />
                                            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4 sm:p-5 lg:p-6">
                                                <p className="text-sm font-semibold text-slate-900 dark:text-white sm:text-base">{activeShowcase.title}</p>
                                                <p className="mt-1 text-xs text-slate-700 dark:text-white/[0.8] sm:text-sm">{activeShowcase.description}</p>
                                                <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-medium text-slate-800 dark:text-white/[0.9] sm:text-xs">
                                                    {activeShowcase.highlights.map((line) => (
                                                        <li key={line} className="flex items-center gap-1.5">
                                                            <Check className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                                                            <span>{line}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    </motion.div>
                </section>

                <section id="pricing" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-120px" }}
                        variants={sectionReveal ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                    >
                        <motion.div variants={sectionReveal} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                            <div className="max-w-3xl space-y-1">
                                <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Pricing</h2>
                                <p className="text-sm text-muted sm:text-base">Simple plans, clear upgrade path.</p>
                            </div>

                            <div className="glass-surface inline-flex w-full rounded-2xl border border-border bg-panelStrong/72 p-1 text-xs font-semibold backdrop-blur-xl sm:w-auto">
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
                                                    ? "bg-panel text-foreground shadow-[var(--cms-shadow-sm)] dark:bg-white/[0.16] dark:text-white dark:ring-1 dark:ring-white/25"
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
                                            "glass-surface relative rounded-[2rem] border p-6 shadow-[var(--cms-shadow-sm)] backdrop-blur-xl",
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

                <section id="faq" className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-120px" }}
                        variants={sectionReveal ? { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } : undefined}
                    >
                        <motion.div variants={sectionReveal} className="space-y-1 text-center">
                            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">FAQs</h2>
                            <p className="text-sm text-muted sm:text-base">Questions, answered clearly.</p>
                        </motion.div>

                        <motion.div variants={sectionReveal} className="glass-surface mt-10 divide-y divide-border rounded-3xl border border-border bg-panel/78 shadow-sm backdrop-blur-xl">
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
