import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { DiscoveryContext, DiscoveryLocale } from './types';
import { DiscoveryWeatherClient, discoveryContextView, weatherChoiceLabel } from './context';
import type { ContextPlace, WeatherChoiceId } from './context';

// One city-only RAM cache per JS process. No disk/account/device coordinates or background fetch.
const cityWeather = new DiscoveryWeatherClient();
const CHOICES: readonly WeatherChoiceId[] = ['auto', 'sunshine', 'rain', 'cold', 'windy'];

export function useDiscoveryContext(locale: DiscoveryLocale, places: readonly ContextPlace[],
  options?: { client?: DiscoveryWeatherClient }): {
    context: DiscoveryContext; reasonByPlace: Readonly<Record<string, string>>; rankedPlaceIds: readonly string[];
  } {
  const client = useRef(options?.client ?? cityWeather).current;
  const [choice, setChoice] = useState<WeatherChoiceId>('auto');
  const chosen = useRef<WeatherChoiceId>('auto');
  const [weather, setWeather] = useState(() => client.read());
  const [nowMs, setNowMs] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const cancel = useCallback(() => { generation.current++; pending.current?.abort(); pending.current = null; }, []);
  const refresh = useCallback(() => {
    if (!mounted.current || AppState.currentState !== 'active' || chosen.current !== 'auto') return;
    cancel(); const selectedGeneration = generation.current; const abort = new AbortController(); pending.current = abort;
    setBusy(true);
    void client.load(abort.signal).then((read) => {
      if (!mounted.current || generation.current !== selectedGeneration || abort.signal.aborted ||
        AppState.currentState !== 'active' || chosen.current !== 'auto') return;
      pending.current = null; setWeather(read); setNowMs(Date.now()); setBusy(false);
    });
  }, [cancel, client]);
  const choose = useCallback((next: WeatherChoiceId) => {
    if (!mounted.current) return;
    cancel(); chosen.current = next; setChoice(next); setBusy(false); setWeather(client.read()); setNowMs(Date.now());
    if (next === 'auto') refresh();
  }, [cancel, client, refresh]);
  useEffect(() => {
    mounted.current = true;
    // Defer one turn so development StrictMode's setup/cleanup cannot consume the network budget.
    const initial = setTimeout(refresh, 0);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { cancel(); if (mounted.current) setBusy(false); }
      else if (mounted.current) { setWeather(client.read()); setNowMs(Date.now()); } // No network on resume.
    });
    const clock = setInterval(() => {
      if (mounted.current && AppState.currentState === 'active') { setWeather(client.read()); setNowMs(Date.now()); }
    }, 60_000); // Local freshness/calendar tick only; never calls fetch.
    return () => { mounted.current = false; cancel(); clearTimeout(initial); clearInterval(clock); subscription.remove(); };
  }, [cancel, client, refresh]);
  const view = useMemo(() => discoveryContextView(locale, places, weather, choice, nowMs), [locale, places, weather, choice, nowMs]);
  return {
    context: { summary: view.summary, detail: view.detail, attribution: view.attribution, busy,
      onRefresh: () => choose('auto'), choices: CHOICES.map((id) => ({ id, label: weatherChoiceLabel(id, locale), selected: id === choice, onPress: () => choose(id) })) },
    reasonByPlace: view.reasonByPlace, rankedPlaceIds: view.rankedPlaceIds,
  };
}
