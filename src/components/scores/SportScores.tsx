import React from 'react';
import { SportId } from '../../sports';
import { TEAM_LEAGUES } from '../../api/teamsports';
import { BasketballScores } from './BasketballScores';
import { FootballScores } from './FootballScores';
import { TeamSportScores } from './TeamSportScores';
import { F1Scores } from './F1Scores';
import { UfcScores } from './UfcScores';
import { TennisScores } from './TennisScores';

/** The scores view for one sport — used by both Scores and Home */
export function SportScores({ sport }: { sport: SportId }) {
  switch (sport) {
    case 'nba': return <BasketballScores />;
    case 'football': return <FootballScores />;
    case 'f1': return <F1Scores />;
    case 'nfl': return <TeamSportScores key="nfl" league={TEAM_LEAGUES.nfl} />;
    case 'mlb': return <TeamSportScores key="mlb" league={TEAM_LEAGUES.mlb} />;
    case 'ufc': return <UfcScores />;
    case 'tennis': return <TennisScores />;
  }
}
