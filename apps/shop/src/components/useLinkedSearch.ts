import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A search box that listens to the address.
 *
 * The box in the top bar, the stock bell and the other pages link here with
 * `?q=` — "show me D-10007", "show me Rahima" — and the page has to take it,
 * also when it is already open and the link only changes the question.
 */
export function useLinkedSearch(setQ: (q: string) => void) {
  const [params] = useSearchParams();
  const linked = params.get('q');
  useEffect(() => {
    if (linked !== null) setQ(linked);
  }, [linked, setQ]);
}
