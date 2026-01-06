"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import CreateMenuFlow from "@/components/menus/CreateMenuFlow";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewMenuPage() {
    const router = useRouter();

    useEffect(() => {
        const mode = typeof window !== "undefined" ? localStorage.getItem("menuvium_user_mode") : null;
        if (mode === "manager") {
            router.replace("/dashboard/menus");
        }
    }, [router]);

    return (
        <div className="w-full max-w-5xl mr-auto space-y-8">
            <header className="flex items-center justify-between">
                <Link href="/dashboard/menus" className="text-sm text-[var(--cms-muted)] hover:text-[var(--cms-text)] inline-flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Back to Menus
                </Link>
            </header>

            <CreateMenuFlow
                variant="auto"
                heroLabel="Create Menu"
                heroTitle="Design a menu guests will crave"
                heroDescription="Pick a creation path, then fine‑tune everything inside the editor."
            />
        </div>
    );
}
