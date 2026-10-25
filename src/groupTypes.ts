import { GroupType } from './types';
import { SportId } from './sports';

export interface GroupTypeDef {
  type: GroupType;
  sport: SportId;
  label: string;
  icon: string;
  desc: string;
}

// Order = order in the "Create group" sheet
export const GROUP_TYPES: GroupTypeDef[] = [
  { type: 'season',       sport: 'nba',      label: 'NBA Season',   icon: '🏀', desc: 'Pick any NBA game before tip-off.' },
  { type: 'playoff',      sport: 'nba',      label: 'NBA Playoffs', icon: '🏆', desc: 'Series winner + games, and the champion.' },
  { type: 'football',     sport: 'football', label: 'Football',     icon: '⚽', desc: 'Result + exact score in the leagues you choose.' },
  { type: 'f1',           sport: 'f1',       label: 'F1',           icon: '🏎️', desc: 'Podium every race + the season champions.' },
  { type: 'nfl_season',   sport: 'nfl',      label: 'NFL Season',   icon: '🏈', desc: 'Weekly winners + your Super Bowl pick.' },
  { type: 'nfl_playoffs', sport: 'nfl',      label: 'NFL Playoffs', icon: '🏆', desc: 'Every playoff game, more points each round.' },
  { type: 'mlb_season',   sport: 'mlb',      label: 'MLB Season',   icon: '⚾', desc: 'Pick any games you like + World Series pick.' },
  { type: 'mlb_playoffs', sport: 'mlb',      label: 'MLB Playoffs', icon: '🏆', desc: 'Series winner + games, and the champion.' },
];

const BY_TYPE = new Map(GROUP_TYPES.map(t => [t.type, t]));

export function groupTypeDef(type: GroupType | undefined): GroupTypeDef {
  return BY_TYPE.get(type ?? 'season') ?? GROUP_TYPES[0];
}
