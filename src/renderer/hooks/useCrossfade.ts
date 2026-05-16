import { useEffect, useRef, useState } from 'react';

export type CrossfadePhase = 'idle' | 'crossfading';

export interface CrossfadeState<T> {
  current: T;
  previous: T | null;
  phase: CrossfadePhase;
}

/**
 * Cross-fade between successive values of `value`. When `value` changes,
 * holds the prior value as `previous` for `fadeMs` so the renderer can
 * overlay them with CSS opacity, then returns to `phase: 'idle'`.
 *
 * @param value - The current source-of-truth value.
 * @param fadeMs - Crossfade duration in ms. Defaults to 200.
 *
 * @example
 *   const { current, previous, phase } = useCrossfade(card, 250);
 *   return (
 *     <div className="stack">
 *       {previous && phase === 'crossfading' && (
 *         <Card data={previous} className="fade-out" />
 *       )}
 *       <Card data={current} className={phase === 'crossfading' ? 'fade-in' : ''} />
 *     </div>
 *   );
 */
export function useCrossfade<T>(value: T, fadeMs: number = 200): CrossfadeState<T> {
  const safeFade = fadeMs > 0 ? fadeMs : 1;
  const [state, setState] = useState<CrossfadeState<T>>({
    current: value,
    previous: null,
    phase: 'idle',
  });
  const lastRef = useRef<T>(value);

  useEffect(() => {
    if (Object.is(lastRef.current, value)) return;
    const prev = lastRef.current;
    lastRef.current = value;
    setState({ current: value, previous: prev, phase: 'crossfading' });
    const handle = setTimeout(() => {
      setState({ current: value, previous: null, phase: 'idle' });
    }, safeFade);
    return () => clearTimeout(handle);
  }, [value, safeFade]);

  return state;
}
