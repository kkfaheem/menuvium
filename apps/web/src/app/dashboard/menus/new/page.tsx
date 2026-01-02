"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import CreateMenuFlow from "@/components/menus/CreateMenuFlow";

export default function NewMenuPage() {
    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <header className="flex items-center justify-between">
                <Link href="/dashboard/menus" className="text-sm text-[var(--cms-muted)] hover:text-[var(--cms-text)] inline-flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Back to Menus
                </Link>
            </header>

            <CreateMenuFlow />
        </div>
    );
}
