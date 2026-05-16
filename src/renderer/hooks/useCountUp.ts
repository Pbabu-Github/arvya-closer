import { useEffect, useRef, useState } from 'react';

/**
 * Animate a number from 0 → `target` with an ease-out cubic curve.
 *
 * @param target - The final value to count up to.
 * @param durationMs - Animation duration in ms. Defaults to 800.
 * @returns The current animated value on each frame.
 *
 * @example
 *   const pages = useCountUp(247);
 *   return <span>{pages.toLocaleString()}</span>;
 */
export function useCountUp(target: number, durationMs: number = 800): number {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const safeDuration = durationMs > 0 ? durationMs : 1;
  const [value, setValue] = useState<number>(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef<number>(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    let rafId = 0;

    const tick = (now: number): void => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / safeDuration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (safeTarget - fromRef.current) * eased;
      setValue(Number.isInteger(safeTarget) ? Math.round(next) : next);
      if (t < 1) rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeTarget, safeDuration]);

  return value;
}
