import { Game, GamePrediction, PlayoffSeries, SeriesPrediction, ScoreBreakdown } from '../types';

const CLOSE_SCORE_MARGIN_NBA = 10; // within 10 pts
const CLOSE_SCORE_MARGIN_SOCCER = 1;

export function scoreGamePrediction(
  game: Game,
  prediction: GamePrediction
): ScoreBreakdown {
  const breakdown: ScoreBreakdown = {
    correctWinner: 0,
    closeScore: 0,
    exactScore: 0,
    seriesWinner: 0,
    seriesLength: 0,
    specialPick: 0,
    total: 0,
  };

  if (game.status !== 'final' || game.homeScore === null || game.awayScore === null) {
    return breakdown;
  }

  const actualWinner =
    game.homeScore > game.awayScore ? game.homeTeam.id : game.awayTeam.id;
  const predictedWinner = prediction.predictedWinnerTeamId;

  if (actualWinner === predictedWinner) {
    breakdown.correctWinner = 2;

    // Score prediction bonuses (only if winner was also correct)
    if (
      prediction.predictedHomeScore !== undefined &&
      prediction.predictedAwayScore !== undefined
    ) {
      const homeDiff = Math.abs(prediction.predictedHomeScore - game.homeScore);
      const awayDiff = Math.abs(prediction.predictedAwayScore - game.awayScore);

      if (homeDiff === 0 && awayDiff === 0) {
        breakdown.exactScore = 5;
      } else if (homeDiff <= CLOSE_SCORE_MARGIN_NBA && awayDiff <= CLOSE_SCORE_MARGIN_NBA) {
        breakdown.closeScore = 2;
      }
    }
  }

  breakdown.total =
    breakdown.correctWinner +
    breakdown.closeScore +
    breakdown.exactScore;

  return breakdown;
}

export function scoreSeriesPrediction(
  series: PlayoffSeries,
  prediction: SeriesPrediction
): ScoreBreakdown {
  const breakdown: ScoreBreakdown = {
    correctWinner: 0,
    closeScore: 0,
    exactScore: 0,
    seriesWinner: 0,
    seriesLength: 0,
    specialPick: 0,
    total: 0,
  };

  if (!series.isComplete || !series.winner || !series.totalGames) {
    return breakdown;
  }

  if (series.winner.id === prediction.predictedWinnerTeamId) {
    breakdown.seriesWinner = 5;

    if (series.totalGames === prediction.predictedGames) {
      breakdown.seriesLength = 3;
    }
  }

  breakdown.total = breakdown.seriesWinner + breakdown.seriesLength;
  return breakdown;
}

export function totalPointsForUser(
  gameBreakdowns: ScoreBreakdown[],
  seriesBreakdowns: ScoreBreakdown[],
  specialPoints: number = 0
): number {
  const gameTotal = gameBreakdowns.reduce((sum, b) => sum + b.total, 0);
  const seriesTotal = seriesBreakdowns.reduce((sum, b) => sum + b.total, 0);
  return gameTotal + seriesTotal + specialPoints;
}

export const POINTS_GUIDE = {
  gamePrediction: {
    correctWinner: 2,
    closeScore: 2,
    exactScore: 5,
  },
  seriesPrediction: {
    correctWinner: 5,
    correctLength: 3,
  },
  special: {
    topScorer: 10,
    finalsMvp: 8,
  },
};
