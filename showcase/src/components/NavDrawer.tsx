"use client";

import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const VIEWPORT_MARGIN = 8;
const PANEL_GAP = 8;

type PanelPosition = {
  left: number;
  top: number;
  maxWidth: number;
  maxHeight: number;
};

type PopupRole = "menu" | "listbox" | "tree" | "grid" | "dialog";

type NavDrawerProps = {
  label: ReactNode;
  active?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  ariaLabel?: string;
  className?: string;
  panelClassName?: string;
  panelRole?: PopupRole;
  children: ReactNode;
};

type DropdownOption<T extends string> = {
  value: T;
  label: ReactNode;
};

type SelectDropdownProps<T extends string> = {
  value: T;
  options: Array<DropdownOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function panelItems(panel: HTMLElement | null) {
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)"));
}

function focusPanelItem(panel: HTMLElement | null, offset: number) {
  const items = panelItems(panel);
  if (items.length === 0) return;
  const activeIndex = items.findIndex((item) => item === document.activeElement);
  const nextIndex =
    activeIndex === -1 ? (offset > 0 ? 0 : items.length - 1) : (activeIndex + offset + items.length) % items.length;
  items[nextIndex]?.focus();
}

function focusPanelEdge(panel: HTMLElement | null, edge: "first" | "last") {
  const items = panelItems(panel);
  const target = edge === "first" ? items[0] : items[items.length - 1];
  target?.focus();
}

export function NavDrawer({
  label,
  active = false,
  open,
  onOpenChange,
  ariaLabel,
  className,
  panelClassName,
  panelRole,
  children,
}: NavDrawerProps) {
  const panelId = useId();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const isOpen = open ?? internalOpen;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );

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

    const leftAnchored = triggerRect.left;
    const rightAnchored = triggerRect.right - panelWidth;
    const fitsLeftAnchored = leftAnchored + panelWidth <= viewportWidth - VIEWPORT_MARGIN;
    const fitsRightAnchored = rightAnchored >= VIEWPORT_MARGIN;
    const preferredLeft = fitsLeftAnchored
      ? leftAnchored
      : fitsRightAnchored
        ? rightAnchored
        : leftAnchored;
    const left = clamp(preferredLeft, VIEWPORT_MARGIN, viewportWidth - panelWidth - VIEWPORT_MARGIN);

    const belowTop = triggerRect.bottom + PANEL_GAP;
    const aboveTop = triggerRect.top - PANEL_GAP - panelHeight;
    const hasRoomBelow = belowTop + panelHeight <= viewportHeight - VIEWPORT_MARGIN;
    const hasRoomAbove = aboveTop >= VIEWPORT_MARGIN;
    const top =
      hasRoomBelow || !hasRoomAbove
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
    if (!isOpen) return undefined;

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !detailsRef.current?.contains(target)) setOpen(false);
    }

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, setOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

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

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      window.requestAnimationFrame(() => focusPanelItem(panelRef.current, 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      window.requestAnimationFrame(() => focusPanelItem(panelRef.current, -1));
    }
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusPanelItem(panelRef.current, event.key === "ArrowDown" ? 1 : -1);
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusPanelEdge(panelRef.current, "first");
    }
    if (event.key === "End") {
      event.preventDefault();
      focusPanelEdge(panelRef.current, "last");
    }
  }

  const panelStyle = position
    ? ({
        "--nav-panel-left": `${position.left}px`,
        "--nav-panel-top": `${position.top}px`,
        "--nav-panel-max-width": `${position.maxWidth}px`,
        "--nav-panel-max-height": `${position.maxHeight}px`,
      } as CSSProperties)
    : undefined;

  return (
    <details ref={detailsRef} className={["nav-drawer", className].filter(Boolean).join(" ")} open={isOpen}>
      <summary
        ref={triggerRef}
        className="nav-trigger"
        data-active={active ? "" : undefined}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-haspopup={panelRole}
        aria-label={ariaLabel}
        onClick={(event) => {
          event.preventDefault();
          setOpen(!isOpen);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="dropdown-label">{label}</span>
        <span className="nav-chevron" aria-hidden="true" />
      </summary>
      <div
        id={panelId}
        ref={panelRef}
        className={["nav-panel", panelClassName].filter(Boolean).join(" ")}
        data-floating={position ? "true" : undefined}
        style={panelStyle}
        role={panelRole}
        onClick={(event) => {
          const target = event.target;
          if (target instanceof Element && target.closest("a, button")) setOpen(false);
        }}
        onKeyDown={handlePanelKeyDown}
      >
        {children}
      </div>
    </details>
  );
}

export function SelectDropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: SelectDropdownProps<T>) {
  const selected = options.find((option) => option.value === value);
  const selectedLabel = typeof selected?.label === "string" ? selected.label : ariaLabel;

  return (
    <NavDrawer
      label={selected?.label ?? ariaLabel}
      ariaLabel={`${ariaLabel}: ${selectedLabel}`}
      className={["filter-dropdown", className].filter(Boolean).join(" ")}
      panelClassName="filter-dropdown-panel"
      panelRole="menu"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="menuitemradio"
          aria-checked={option.value === value}
          data-selected={option.value === value ? "" : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </NavDrawer>
  );
}
