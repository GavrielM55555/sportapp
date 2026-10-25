// Every sport the app covers. Order here is the order of the chips in Scores.
export type SportId = 'nba' | 'football' | 'f1' | 'nfl' | 'mlb' | 'ufc' | 'tennis';

export interface SportDef {
  id: SportId;
  label: string;
  emoji: string;
  desc: string;
}

export const SPORTS: SportDef[] = [
  { id: 'nba',      label: 'Basketball', emoji: '🏀', desc: 'NBA, WNBA & more' },
  { id: 'football', label: 'Football',   emoji: '⚽', desc: 'Europe, Israel, Americas' },
  { id: 'f1',       label: 'F1',         emoji: '🏎️', desc: 'Race weekends & standings' },
  { id: 'nfl',      label: 'NFL',        emoji: '🏈', desc: 'American football' },
  { id: 'mlb',      label: 'MLB',        emoji: '⚾', desc: 'Baseball' },
  { id: 'ufc',      label: 'UFC',        emoji: '🥊', desc: 'Fight cards' },
  { id: 'tennis',   label: 'Tennis',     emoji: '🎾', desc: 'ATP & WTA' },
];

export const SPORT_IDS = new Set<string>(SPORTS.map(s => s.id));
