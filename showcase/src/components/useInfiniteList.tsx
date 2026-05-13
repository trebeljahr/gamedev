"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type InfiniteListOptions = {
  total: number;
  pageSize: number;
  resetKey: string | number;
  initialLimit?: number;
  rootMargin?: string;
};

export function useInfiniteList({
  total,
  pageSize,
  resetKey,
  initialLimit = pageSize,
  rootMargin = "900px 0px",
}: InfiniteListOptions) {
  const itemCount = Math.max(0, total);
  const chunkSize = Math.max(1, pageSize);
  const startSize = Math.max(1, initialLimit);
  const [limit, setLimit] = useState(() => Math.min(itemCount, startSize));
  const sentinelNode = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setLimit(Math.min(itemCount, startSize));
  }, [itemCount, resetKey, startSize]);

  const visibleCount = Math.min(limit, itemCount);
  const remaining = Math.max(0, itemCount - visibleCount);
  const hasMore = remaining > 0;

  const loadMore = useCallback(() => {
    setLimit((current) => Math.min(itemCount, Math.max(current, startSize) + chunkSize));
  }, [chunkSize, itemCount, startSize]);

  const sentinelRef = useCallback((node: HTMLElement | null) => {
    sentinelNode.current = node;
  }, []);

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelNode.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, rootMargin]);

  return useMemo(
    () => ({
      hasMore,
      loadMore,
      remaining,
      sentinelRef,
      visibleCount,
    }),
    [hasMore, loadMore, remaining, sentinelRef, visibleCount],
  );
}

export function InfiniteListSentinel({
  className,
  hasMore,
  label = "Loading more",
  onLoadMore,
  pageSize,
  remaining,
  sentinelRef,
}: {
  className?: string;
  hasMore: boolean;
  label?: string;
  onLoadMore: () => void;
  pageSize: number;
  remaining: number;
  sentinelRef: (node: HTMLElement | null) => void;
}) {
  if (!hasMore) return null;

  return (
    <div
      className={["infinite-scroll-sentinel", className].filter(Boolean).join(" ")}
      ref={sentinelRef}
      role="status"
      aria-live="polite"
    >
      <span>{label}</span>
      <button type="button" onClick={onLoadMore}>
        Load {Math.min(pageSize, remaining).toLocaleString()} more
      </button>
    </div>
  );
}
