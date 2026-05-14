"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const VIEWPORT_MARGIN = 8;
const PANEL_GAP = 8;

type PanelPosition = {
  left: number;
  top: number;
  maxWidth: number;
  maxHeight: number;
};

type NavDrawerProps = {
  label: string;
  active?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function NavDrawer({
  label,
  active = false,
  open,
  onOpenChange,
  className,
  children,
}: NavDrawerProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const isOpen = open ?? internalOpen;

  const positionPanel = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel || !detailsRef.current?.open) return;

    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const maxWidth = Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2);
    const maxHeight = Math.max(0, viewportHeight - VIEWPORT_MARGIN * 2);
    const panelWidth = Math.min(panelRect.width || panel.offsetWidth, maxWidth);
    const panelHeight = Math.min(panelRect.height || panel.offsetHeight, maxHeight);

    const left = clamp(
      triggerRect.left,
      VIEWPORT_MARGIN,
      viewportWidth - panelWidth - VIEWPORT_MARGIN,
    );
    const belowTop = triggerRect.bottom + PANEL_GAP;
    const aboveTop = triggerRect.top - PANEL_GAP - panelHeight;
    const hasRoomBelow = belowTop + panelHeight <= viewportHeight - VIEWPORT_MARGIN;
    const hasRoomAbove = aboveTop >= VIEWPORT_MARGIN;
    const top = hasRoomBelow || !hasRoomAbove
      ? clamp(belowTop, VIEWPORT_MARGIN, viewportHeight - panelHeight - VIEWPORT_MARGIN)
      : aboveTop;

    setPosition({ left, top, maxWidth, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    positionPanel();
  }, [isOpen, positionPanel]);

  useEffect(() => {
    if (!isOpen) return;

    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(positionPanel);
    if (resizeObserver) {
      if (triggerRef.current) resizeObserver.observe(triggerRef.current);
      if (panelRef.current) resizeObserver.observe(panelRef.current);
    }

    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
      resizeObserver?.disconnect();
    };
  }, [isOpen, positionPanel]);

  const panelStyle = position
    ? ({
        "--nav-panel-left": `${position.left}px`,
        "--nav-panel-top": `${position.top}px`,
        "--nav-panel-max-width": `${position.maxWidth}px`,
        "--nav-panel-max-height": `${position.maxHeight}px`,
      } as CSSProperties)
    : undefined;

  return (
    <details
      ref={detailsRef}
      className={["nav-drawer", className].filter(Boolean).join(" ")}
      open={isOpen}
    >
      <summary
        ref={triggerRef}
        className="nav-trigger"
        data-active={active ? "" : undefined}
        aria-expanded={isOpen}
        onClick={(event) => {
          event.preventDefault();
          const nextOpen = !isOpen;
          if (open === undefined) setInternalOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }}
      >
        <span>{label}</span>
        <span className="nav-chevron" aria-hidden="true" />
      </summary>
      <div
        ref={panelRef}
        className="nav-panel"
        data-floating={position ? "true" : undefined}
        style={panelStyle}
      >
        {children}
      </div>
    </details>
  );
}
