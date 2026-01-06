"use client";

import { type ReactNode } from "react";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableItemRowProps {
    id: string;
    className: string;
    disabled?: boolean;
    children: (props: {
        attributes: ReturnType<typeof useSortable>['attributes'];
        listeners: ReturnType<typeof useSortable>['listeners'];
        isDragging: boolean
    }) => ReactNode;
}

export function SortableItemRow({
    id,
    className,
    disabled,
    children
}: SortableItemRowProps) {
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
        animateLayoutChanges: (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true })
    });

    const style = {
        transform: transform
            ? CSS.Transform.toString({
                ...transform,
                x: transform.x ?? 0,
                y: transform.y ?? 0,
                scaleX: 1,
                scaleY: 1
            })
            : undefined,
        transition,
        opacity: isDragging ? 0.7 : undefined,
        boxShadow: isDragging ? "0 8px 20px rgba(0,0,0,0.18)" : undefined
    };

    return (
        <div ref={setNodeRef} style={style} className={className}>
            {children({ attributes, listeners, isDragging })}
        </div>
    );
}
