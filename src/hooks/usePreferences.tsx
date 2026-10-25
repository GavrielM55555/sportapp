import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPPORTED_LEAGUES } from '../api/apifootball';
import { BASKETBALL_LEAGUES } from '../api/apibasketball';
import { SportId, SPORT_IDS } from '../sports';

const VALID_LEAGUE_IDS = new Set(SUPPORTED_LEAGUES.map(l => l.id));
const VALID_BASKETBALL_IDS = new Set(BASKETBALL_LEAGUES.map(l => l.id));

export type SportPref = SportId;

export interface UserPreferences {
  sports: SportPref[];
  leagueIds: number[];            // football league IDs
  basketballLeagueIds: number[];  // extra basketball league IDs (WNBA, etc.)
  onboardingDone: boolean;
}

const DEFAULT_PREFS: UserPreferences = {
  sports: [],
  leagueIds: [],
  basketballLeagueIds: [],
  onboardingDone: false,
};

const STORAGE_KEY = '@sportapp:prefs';

function usePreferencesState() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // Drop ids that no longer exist instead of wiping the whole list
          parsed.sports = (parsed.sports ?? []).filter((s: string) => SPORT_IDS.has(s));
          parsed.leagueIds = (parsed.leagueIds ?? []).filter((id: number) => VALID_LEAGUE_IDS.has(id));
          parsed.basketballLeagueIds = (parsed.basketballLeagueIds ?? []).filter((id: number) => VALID_BASKETBALL_IDS.has(id));
          setPrefs({ ...DEFAULT_PREFS, ...parsed });
        } catch { /* ignore bad data */ }
      }
      setLoaded(true);
    });
  }, []);

  // Every update goes through here so state and storage never drift apart
  const update = useCallback((fn: (prev: UserPreferences) => UserPreferences) => {
    setPrefs(prev => {
      const next = fn(prev);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const save = useCallback(async (next: UserPreferences) => {
    setPrefs(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter(x => x !== item) : [...list, item];

  const toggleSport = useCallback((sport: SportPref) => {
    update(prev => ({
      ...prev,
      sports: toggle(prev.sports, sport),
      leagueIds: sport === 'football' && prev.sports.includes('football') ? [] : prev.leagueIds,
    }));
  }, [update]);

  const toggleBasketballLeague = useCallback((id: number) => {
    update(prev => ({ ...prev, basketballLeagueIds: toggle(prev.basketballLeagueIds, id) }));
  }, [update]);

  const toggleLeague = useCallback((id: number) => {
    update(prev => ({ ...prev, leagueIds: toggle(prev.leagueIds, id) }));
  }, [update]);

  const completeOnboarding = useCallback(() => {
    update(prev => ({ ...prev, onboardingDone: true }));
  }, [update]);

  return { prefs, loaded, save, toggleSport, toggleLeague, toggleBasketballLeague, completeOnboarding };
}

type PreferencesValue = ReturnType<typeof usePreferencesState>;
const PreferencesContext = createContext<PreferencesValue | null>(null);

/** One shared copy of the preferences, so a change in Me shows up on every tab at once */
export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const value = usePreferencesState();
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}
