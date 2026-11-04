import { useEffect, useRef, useState, type ReactNode } from "react";

type Props<T> = {
  items: T[];
  initialCount?: number;
  step?: number;
  className?: string;
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
};

export function LazyList<T>({
  items,
  initialCount = 4,
  step = 10,
  className = "tx-list",
  getKey,
  renderItem,
}: Props<T>) {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initialCount, items.length));
  const rootRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(Math.min(initialCount, items.length));
  }, [items, initialCount]);

  useEffect(() => {
    const root = rootRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || visibleCount >= items.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((current) => Math.min(current + step, items.length));
        }
      },
      { root, rootMargin: "120px", threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [items.length, visibleCount, step]);

  const visible = items.slice(0, visibleCount);
  const remaining = items.length - visibleCount;

  return (
    <div ref={rootRef} className={className}>
      {visible.map((item, index) => (
        <div key={getKey(item, index)} className="lazy-list__item">
          {renderItem(item, index)}
        </div>
      ))}
      {remaining > 0 && (
        <>
          <div ref={sentinelRef} className="lazy-list__sentinel" aria-hidden />
          <p className="lazy-list__hint muted">Scroll to load more ({remaining} remaining)</p>
        </>
      )}
    </div>
  );
}
