import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPPORTED_LEAGUES } from '../api/apifootball';
import { BASKETBALL_LEAGUES } from '../api/apibasketball';

const VALID_LEAGUE_IDS = new Set(SUPPORTED_LEAGUES.map(l => l.id));
const VALID_BASKETBALL_IDS = new Set(BASKETBALL_LEAGUES.map(l => l.id));

export type SportPref = 'nba' | 'football';

export interface UserPreferences {
  sports: SportPref[];
  leagueIds: number[];            // football league IDs
  basketballLeagueIds: number[];  // extra basketball league IDs (EuroLeague, etc.)
  onboardingDone: boolean;
}

const DEFAULT_PREFS: UserPreferences = {
  sports: [],
  leagueIds: [],
  basketballLeagueIds: [],
  onboardingDone: false,
};

const STORAGE_KEY = '@sportapp:prefs';

export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.leagueIds?.some((id: number) => !VALID_LEAGUE_IDS.has(id))) {
            parsed.leagueIds = [];
          }
          if (!parsed.basketballLeagueIds) parsed.basketballLeagueIds = [];
          // Reset any old basketball IDs that no longer exist
          if (parsed.basketballLeagueIds?.some((id: number) => !VALID_BASKETBALL_IDS.has(id))) {
            parsed.basketballLeagueIds = parsed.basketballLeagueIds.filter((id: number) => VALID_BASKETBALL_IDS.has(id));
          }
          setPrefs(parsed);
        } catch { /* ignore bad data */ }
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

  const toggleBasketballLeague = useCallback((id: number) => {
    setPrefs(prev => {
      const next = {
        ...prev,
        basketballLeagueIds: prev.basketballLeagueIds.includes(id)
          ? prev.basketballLeagueIds.filter(l => l !== id)
          : [...prev.basketballLeagueIds, id],
      };
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

  return { prefs, loaded, save, toggleSport, toggleLeague, toggleBasketballLeague, completeOnboarding };
}
