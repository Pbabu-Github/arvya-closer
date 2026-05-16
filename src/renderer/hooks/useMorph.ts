import { useEffect, useRef, useState } from 'react';

/**
 * Morph from the previous string to `value` over `durationMs`. Animates
 * length first (grow/shrink), then reveals or replaces characters.
 *
 * @param value - The target string.
 * @param durationMs - Total morph duration in ms. Defaults to 400.
 * @returns The current intermediate string on each frame.
 *
 * @example
 *   const [state, setState] = useState('APPROVE & SEND');
 *   const label = useMorph(state);
 *   return <button onClick={() => setState('Sending...')}>{label}</button>;
 */
export function useMorph(value: string, durationMs: number = 400): string {
  const safeDuration = durationMs > 0 ? durationMs : 1;
  const [display, setDisplay] = useState<string>(value);
  const fromRef = useRef<string>(value);
  const targetRef = useRef<string>(value);

  useEffect(() => {
    if (targetRef.current === value) return;
    fromRef.current = display;
    targetRef.current = value;
    const from = fromRef.current;
    const to = value;
    const start = performance.now();
    let rafId = 0;

    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / safeDuration);
      const len = Math.round(from.length + (to.length - from.length) * t);
      const revealCount = Math.round(to.length * t);
      let out = '';
      for (let i = 0; i < len; i++) {
        if (i < revealCount && i < to.length) out += to[i];
        else if (i < from.length) out += from[i];
        else out += to[Math.min(i, to.length - 1)] ?? '';
      }
      setDisplay(out);
      if (t < 1) rafId = requestAnimationFrame(tick);
      else setDisplay(to);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, safeDuration]);

  return display;
}
