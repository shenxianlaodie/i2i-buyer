import { useEffect, useRef, useState } from "react";

export function expandColumnWidths<K extends string>(
  widths: Record<K, number>,
  containerWidth: number,
  flexKeys: readonly K[],
): Record<K, number> {
  const total = (Object.values(widths) as number[]).reduce((sum, w) => sum + w, 0);
  if (containerWidth <= total) return widths;

  const extra = containerWidth - total;
  const flexSum = flexKeys.reduce((sum, key) => sum + widths[key], 0);
  if (flexSum <= 0) return widths;

  const next = { ...widths };
  let distributed = 0;
  flexKeys.forEach((key, i) => {
    const add =
      i === flexKeys.length - 1
        ? extra - distributed
        : Math.floor((extra * widths[key]) / flexSum);
    next[key] = widths[key] + add;
    distributed += add;
  });
  return next;
}

export function sumColumnWidths(widths: Record<string, number>) {
  return (Object.values(widths) as number[]).reduce((sum, w) => sum + w, 0);
}

export function useWorkbenchTableContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => setContainerWidth(el.clientWidth);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { containerRef, containerWidth };
}
