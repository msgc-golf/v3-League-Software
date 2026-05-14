import { RoundRecord, calculateHandicapBase, calculateHandicapDetails, HandicapDetails } from "./handicap";

// Simple structure to pass in all raw data
export interface RawScoreDoc {
  id: string;
  roundId: string;
  playerId: string;
  leagueId: string;
  roundDate: string;
  holeScores: number[];
  courseId: string;
  coursePar: number;
}

export function getPlayerHandicapDetailsForDate(
  playerId: string,
  targetDate: string | null, // null means current (no date limit)
  allScores: RawScoreDoc[]
): HandicapDetails {
  // Filter scores for this player in this league
  const playerScores = allScores.filter(s => {
    if (s.playerId !== playerId) return false;
    if (targetDate) {
      return new Date(s.roundDate).getTime() < new Date(targetDate).getTime();
    }
    return true; // if no targetDate, use all
  });

  // Sort them by date ascending so we can process them sequentially or just take the last 3
  playerScores.sort((a,b) => new Date(a.roundDate).getTime() - new Date(b.roundDate).getTime());

  // Create round records
  const rounds: RoundRecord[] = playerScores.map(ps => {
    const totalScore = ps.holeScores.reduce((a,b) => a+b, 0);
    return {
      score: totalScore,
      par: ps.coursePar,
      date: ps.roundDate,
      id: ps.roundId
    };
  });

  return calculateHandicapDetails(rounds);
}

export function getPlayerHandicapForDate(
  playerId: string,
  targetDate: string, // the date of the round they are playing
  allScores: RawScoreDoc[]
): number {
  return getPlayerHandicapDetailsForDate(playerId, targetDate, allScores).baseHandicap;
}

// Returns the handicap to use when scoring a player's round, applying retroactive
// logic for first-round players: if they had no prior rounds, use the average of
// their first two rounds' differentials once a second round exists.
export function getEffectiveHandicap(
  playerId: string,
  roundDate: string,
  allLeagueScores: RawScoreDoc[]
): number {
  const playerScores = allLeagueScores
    .filter(s => s.playerId === playerId)
    .sort((a, b) => new Date(a.roundDate).getTime() - new Date(b.roundDate).getTime());

  const priorScores = playerScores.filter(
    s => new Date(s.roundDate).getTime() < new Date(roundDate).getTime()
  );

  // Not their first round — normal handicap based on prior rounds
  if (priorScores.length > 0) {
    const rounds: RoundRecord[] = priorScores.map(ps => ({
      score: ps.holeScores.reduce((a, b) => a + b, 0),
      par: ps.coursePar,
      date: ps.roundDate,
    }));
    return calculateHandicapBase(rounds); // already capped at 18 inside
  }

  // First round: retroact using the 2-round average if a second round exists
  if (playerScores.length < 2) {
    return 0; // only one round ever played, nothing to retroact from
  }

  const r1 = playerScores[0];
  const r2 = playerScores[1];
  const diff1 = r1.holeScores.reduce((a, b) => a + b, 0) - r1.coursePar;
  const diff2 = r2.holeScores.reduce((a, b) => a + b, 0) - r2.coursePar;
  return Math.min(18, (diff1 + diff2) / 2);
}
