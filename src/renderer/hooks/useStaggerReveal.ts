import { useEffect, useState } from 'react';

/**
 * Reveal items one-at-a-time on a fixed cadence. Resets when `items`
 * reference changes. Used to "pile up" facts on screen.
 *
 * @param items - The full list to reveal.
 * @param stepMs - Delay between each new item appearing. Defaults to 80.
 * @returns A prefix of `items` that grows from length 1 → items.length.
 */
export function useStaggerReveal<T>(items: T[], stepMs: number = 80): T[] {
  const [visible, setVisible] = useState<T[]>(items.length > 0 ? [items[0]!] : []);

  useEffect(() => {
    if (items.length === 0) {
      setVisible([]);
      return;
    }
    const safeStep = stepMs > 0 ? stepMs : 1;
    setVisible([items[0]!]);
    const handles: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < items.length; i++) {
      const h = setTimeout(() => {
        setVisible(items.slice(0, i + 1));
      }, safeStep * i);
      handles.push(h);
    }
    return () => {
      for (const h of handles) clearTimeout(h);
    };
  }, [items, stepMs]);

  return visible;
}
