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
