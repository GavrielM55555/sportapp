// ── Users ──────────────────────────────────────────────
export interface AppUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

// ── Groups ─────────────────────────────────────────────
export type GroupType = 'season' | 'playoff' | 'football';

export interface Group {
  id: string;
  name: string;
  inviteCode: string;           // short code for join link
  adminUid: string;
  members: GroupMember[];
  memberUids: string[];
  createdAt: number;
  season: string;               // e.g. "2024-25"
  type: GroupType;              // season or playoff
  leagueIds?: number[];         // for football groups: which leagues to predict
}

export interface GroupMember {
  uid: string;
  displayName: string;
  photoURL?: string;
  totalPoints: number;
}

// ── Games ──────────────────────────────────────────────
export interface Game {
  id: number;
  date: string;                 // ISO date string
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'live' | 'final';
  isOT?: boolean;               // true if game ended in overtime
  period?: number;
  time?: string;
  playoffs: boolean;
  playoffRound?: PlayoffRound;
  seriesId?: string;            // e.g. "2024-east-r1-bos-nyK"
}

export interface Team {
  id: number;
  name: string;
  abbreviation: string;
  city: string;
  conference: string;
  division: string;
}

// ── Playoff Series ─────────────────────────────────────
export type PlayoffRound =
  | 'first_round'
  | 'conference_semis'
  | 'conference_finals'
  | 'finals';

export interface PlayoffSeries {
  id: string;
  season: string;
  round: PlayoffRound;
  homeTeam: Team;
  awayTeam: Team;
  homeWins: number;
  awayWins: number;
  isComplete: boolean;
  winner?: Team;
  totalGames?: number;          // 4-7, filled when complete
  games: Game[];
}

// ── Predictions ────────────────────────────────────────

/** Prediction for a single regular/playoff game */
export interface GamePrediction {
  id?: string;
  uid: string;
  groupId: string;
  gameId: number;
  predictedWinnerTeamId: number;
  predictedHomeScore?: number;
  predictedAwayScore?: number;
  pointsEarned?: number;        // filled after game is final
  submittedAt: number;
}

/** Prediction for an entire playoff series outcome */
export interface SeriesPrediction {
  id?: string;
  uid: string;
  groupId: string;
  seriesId: string;
  predictedWinnerTeamId: number;
  predictedGames: 4 | 5 | 6 | 7; // "in X games"
  pointsEarned?: number;
  submittedAt: number;
}

/** One-time bonus playoff picks — submitted before playoffs start */
export interface PlayoffBonusPick {
  id?: string;
  uid: string;
  groupId: string;
  season: string;
  seriesTo7?: number;      // how many series go to 7 games
  otGames?: number;        // how many games go to overtime
  pointsEarned?: number;   // filled after playoffs end
  submittedAt: number;
}

// ── Football Predictions ───────────────────────────────
export type FootballResult = 'home' | 'draw' | 'away';

export interface FootballPrediction {
  id?: string;
  uid: string;
  groupId: string;
  fixtureId: number;
  leagueId: number;
  predictedResult: FootballResult;
  predictedHomeScore?: number;
  predictedAwayScore?: number;
  pointsEarned?: number;
  submittedAt: number;
}

// ── Scoring ────────────────────────────────────────────
export interface ScoreBreakdown {
  correctWinner: number;        // 2 pts
  closeScore: number;           // +2 pts if within margin
  exactScore: number;           // +5 pts bonus
  seriesWinner: number;         // 5 pts
  seriesLength: number;         // +3 pts
  specialPick: number;          // top scorer / MVP bonuses
  total: number;
}
