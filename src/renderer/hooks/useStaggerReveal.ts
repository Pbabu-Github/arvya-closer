import { useEffect, useState } from 'react';

/**
 * Reveal items one-at-a-time on a fixed cadence. Resets when `items`
 * reference changes. Used to "pile up" facts on screen.
 *
 * @param items - The full list to reveal.
 * @param stepMs - Delay between each new item appearing. Defaults to 80.
 * @returns A prefix of `items` that grows from length 1 → items.length.
 *
 * @example
 *   const facts = ['Hypothesis ✓', 'New objection', 'Pattern reinforced'];
 *   const shown = useStaggerReveal(facts, 250);
 *   return <>{shown.map((f) => <li key={f}>{f}</li>)}</>;
 */
export function useStaggerReveal<T>(items: T[], stepMs: number = 80): T[] {
  const [visible, setVisible] = useState<T[]>(items.length > 0 ? [items[0]!] : []);

  useEffect(() => {
    if (items.length === 0) {
      setVisible((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const safeStep = stepMs > 0 ? stepMs : 1;
    setVisible((prev) =>
      prev.length === 1 && prev[0] === items[0] ? prev : [items[0]!],
    );
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
