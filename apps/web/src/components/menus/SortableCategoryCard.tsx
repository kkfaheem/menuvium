"use client";

import { type ReactNode } from "react";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";

interface SortableCategoryCardProps {
    id: string;
    className: string;
    disabled?: boolean;
    children: (props: {
        attributes: ReturnType<typeof useSortable>['attributes'];
        listeners: ReturnType<typeof useSortable>['listeners'];
        isDragging: boolean
    }) => ReactNode;
}

export function SortableCategoryCard({
    id,
    className,
    disabled,
    children
}: SortableCategoryCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id,
        disabled,
        transition: {
            duration: 240,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)"
        },
        animateLayoutChanges: (args) => {
            if (args.isSorting || args.wasDragging) return true;
            return defaultAnimateLayoutChanges(args);
        }
    });

    const translateX = Number((transform?.x ?? 0).toFixed(2));
    const translateY = Number((transform?.y ?? 0).toFixed(2));

    const style = {
        transform: transform ? `translate3d(${translateX}px, ${translateY}px, 0)` : undefined,
        transition: transition ?? "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
        boxShadow: isDragging ? "0 14px 34px rgba(0,0,0,0.22)" : undefined,
        opacity: isDragging ? 0.98 : 1,
        zIndex: isDragging ? 40 : undefined,
        willChange: isDragging ? "transform" : undefined,
        transformOrigin: "center center",
        isolation: "isolate" as const,
        backfaceVisibility: "hidden" as const
    };

    return (
        <div ref={setNodeRef} style={style} className={className}>
            {children({ attributes, listeners, isDragging })}
        </div>
    );
}
