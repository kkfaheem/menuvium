"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, Loader2, X } from "lucide-react";

type Size = { width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) reject(new Error("Failed to create image blob"));
                else resolve(blob);
            },
            type,
            quality
        );
    });
}

export type ImageCropperModalProps = {
    open: boolean;
    file: File | null;
    aspect: number;
    title?: string;
    description?: string;
    confirmLabel?: string;
    maxOutputWidth?: number;
    onCancel: () => void;
    onConfirm: (blob: Blob) => void | Promise<void>;
};

export function ImageCropperModal({
    open,
    file,
    aspect,
    title = "Crop image",
    description = "Drag to reposition and adjust zoom.",
    confirmLabel = "Use photo",
    maxOutputWidth = 1600,
    onCancel,
    onConfirm
}: ImageCropperModalProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const pointerStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [naturalSize, setNaturalSize] = useState<Size | null>(null);
    const [containerSize, setContainerSize] = useState<Size | null>(null);
    const [zoom, setZoom] = useState(1);
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const [isConfirming, setIsConfirming] = useState(false);

    useEffect(() => {
        if (!open || !file) {
            setImageUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setImageUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [open, file]);

    const measureContainer = () => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
    };

    useEffect(() => {
        if (!open) return;
        measureContainer();
        window.addEventListener("resize", measureContainer);
        return () => window.removeEventListener("resize", measureContainer);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onCancel]);

    useEffect(() => {
        if (!open) return;
        setZoom(1);
        setPanX(0);
        setPanY(0);
        setIsConfirming(false);
        pointerStart.current = null;
    }, [open, file]);

    const baseScale = useMemo(() => {
        if (!naturalSize || !containerSize) return 1;
        return Math.max(containerSize.width / naturalSize.width, containerSize.height / naturalSize.height);
    }, [naturalSize, containerSize]);

    const scale = baseScale * zoom;

    const clampPan = (nextPanX: number, nextPanY: number) => {
        if (!naturalSize || !containerSize) return { x: nextPanX, y: nextPanY };
        const maxX = Math.max(0, (naturalSize.width * scale - containerSize.width) / 2);
        const maxY = Math.max(0, (naturalSize.height * scale - containerSize.height) / 2);
        return {
            x: clamp(nextPanX, -maxX, maxX),
            y: clamp(nextPanY, -maxY, maxY)
        };
    };

    useEffect(() => {
        const clamped = clampPan(panX, panY);
        if (clamped.x !== panX) setPanX(clamped.x);
        if (clamped.y !== panY) setPanY(clamped.y);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scale, containerSize?.width, containerSize?.height, naturalSize?.width, naturalSize?.height]);

    const handlePointerDown = (e: ReactPointerEvent) => {
        if (!open || isConfirming) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pointerStart.current = { x: e.clientX, y: e.clientY, panX, panY };
    };

    const handlePointerMove = (e: ReactPointerEvent) => {
        const start = pointerStart.current;
        if (!start || !open || isConfirming) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        const clamped = clampPan(start.panX + dx, start.panY + dy);
        setPanX(clamped.x);
        setPanY(clamped.y);
    };

    const handlePointerUp = () => {
        pointerStart.current = null;
    };

    const handleConfirm = async () => {
        if (!file || !naturalSize || !containerSize || !imageRef.current) return;
        setIsConfirming(true);
        try {
            const cropWidth = containerSize.width / scale;
            const cropHeight = containerSize.height / scale;
            const sx = clamp(
                naturalSize.width / 2 - cropWidth / 2 - panX / scale,
                0,
                Math.max(0, naturalSize.width - cropWidth)
            );
            const sy = clamp(
                naturalSize.height / 2 - cropHeight / 2 - panY / scale,
                0,
                Math.max(0, naturalSize.height - cropHeight)
            );

            const outputWidth = Math.min(maxOutputWidth, Math.max(1, Math.round(cropWidth)));
            const outputHeight = Math.max(1, Math.round(outputWidth / aspect));

            const canvas = document.createElement("canvas");
            canvas.width = outputWidth;
            canvas.height = outputHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas not supported");
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";

            ctx.drawImage(
                imageRef.current,
                sx,
                sy,
                cropWidth,
                cropHeight,
                0,
                0,
                outputWidth,
                outputHeight
            );

            const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
            await onConfirm(blob);
        } finally {
            setIsConfirming(false);
        }
    };

    if (!open || !file) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-3xl rounded-3xl bg-[var(--cms-bg)] border border-[var(--cms-border)] shadow-2xl overflow-hidden">
                <div className="flex items-start justify-between gap-4 p-5 border-b border-[var(--cms-border)]">
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold truncate">{title}</h2>
                        <p className="text-sm text-[var(--cms-muted)]">{description}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="p-2 rounded-full hover:bg-[var(--cms-panel)]"
                        disabled={isConfirming}
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div
                        className="relative w-full rounded-2xl border border-[var(--cms-border)] bg-black/20 overflow-hidden select-none touch-none"
                        style={{ aspectRatio: `${aspect}` }}
                        ref={containerRef}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        onDoubleClick={() => {
                            setZoom(1);
                            setPanX(0);
                            setPanY(0);
                        }}
                        role="application"
                        aria-label="Image crop area"
                    >
                        {imageUrl && (
                            <img
                                ref={imageRef}
                                src={imageUrl}
                                alt="Crop preview"
                                className="absolute left-1/2 top-1/2 will-change-transform"
                                style={{
                                    transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`,
                                    transformOrigin: "center",
                                    maxWidth: "none",
                                    maxHeight: "none"
                                }}
                                draggable={false}
                                onLoad={(e) => {
                                    const img = e.currentTarget;
                                    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                                    measureContainer();
                                }}
                            />
                        )}
                        <div className="absolute inset-0 ring-1 ring-white/10 pointer-events-none" />
                    </div>

                    <div className="flex items-center gap-4">
                        <label className="text-sm font-semibold text-[var(--cms-text)] whitespace-nowrap">Zoom</label>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.01}
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-full"
                            disabled={isConfirming}
                        />
                        <span className="text-xs text-[var(--cms-muted)] tabular-nums w-12 text-right">
                            {Math.round(zoom * 100)}%
                        </span>
                    </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 p-5 border-t border-[var(--cms-border)] bg-[var(--cms-panel)]">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isConfirming}
                        className="h-10 px-4 rounded-full border border-[var(--cms-border)] text-sm font-semibold text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={isConfirming || !naturalSize || !containerSize}
                        className="h-10 px-5 rounded-full bg-[var(--cms-text)] text-[var(--cms-bg)] text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                        {isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {isConfirming ? "Processing..." : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
