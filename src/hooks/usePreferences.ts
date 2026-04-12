import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SportPref = 'nba' | 'football';

export interface UserPreferences {
  sports: SportPref[];
  leagueIds: number[];      // football league IDs from apifootball
  onboardingDone: boolean;
}

const DEFAULT_PREFS: UserPreferences = {
  sports: [],
  leagueIds: [],
  onboardingDone: false,
};

const STORAGE_KEY = '@sportapp:prefs';

export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setPrefs(JSON.parse(raw)); } catch { /* ignore bad data */ }
      }
      setLoaded(true);
    });
  }, []);

  const save = useCallback(async (next: UserPreferences) => {
    setPrefs(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const toggleSport = useCallback((sport: SportPref) => {
    setPrefs(prev => {
      const next = { ...prev };
      if (next.sports.includes(sport)) {
        next.sports = next.sports.filter(s => s !== sport);
        if (sport === 'football') next.leagueIds = [];
      } else {
        next.sports = [...next.sports, sport];
      }
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleLeague = useCallback((id: number) => {
    setPrefs(prev => {
      const next = {
        ...prev,
        leagueIds: prev.leagueIds.includes(id)
          ? prev.leagueIds.filter(l => l !== id)
          : [...prev.leagueIds, id],
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    setPrefs(prev => {
      const next = { ...prev, onboardingDone: true };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { prefs, loaded, save, toggleSport, toggleLeague, completeOnboarding };
}
