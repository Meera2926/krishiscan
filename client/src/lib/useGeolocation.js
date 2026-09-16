import { useCallback, useState } from 'react';

/** One-shot browser geolocation with an explicit, user-triggered request. */
export function useGeolocation() {
  const [state, setState] = useState({ status: 'idle', coords: null, error: null });

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ status: 'error', coords: null, error: 'unsupported' });
      return;
    }
    setState((s) => ({ ...s, status: 'loading', error: null }));
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setState({
          status: 'success',
          coords: { lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) },
          error: null,
        }),
      (err) => setState({ status: 'error', coords: null, error: err.code === 1 ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  const clear = useCallback(() => setState({ status: 'idle', coords: null, error: null }), []);

  return { ...state, request, clear };
}
