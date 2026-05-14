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
  isSub?: boolean;
  subName?: string;
  subHandicap?: number;
}

export function getPlayerHandicapDetailsForDate(
  playerId: string,
  targetDate: string | null, // null means current (no date limit)
  allScores: RawScoreDoc[]
): HandicapDetails {
  // Filter scores for this player in this league
  const playerScores = allScores.filter(s => {
    if (s.playerId !== playerId) return false;
    if (s.isSub) return false; // sub appearances don't count toward regular player's handicap
    if (s.holeScores.reduce((a, b) => a + b, 0) === 0) return false; // player didn't play
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

// Returns the handicap to use when scoring a player's round.
//
// Retroactive rule: a handicap isn't truly "established" until two rounds exist.
// Both rounds 1 and 2 are scored with the same handicap — the average of their
// two differentials — rather than R1 getting no strokes and R2 getting only R1's
// differential. From round 3 onward, normal prior-round calculation applies.
export function getEffectiveHandicap(
  playerId: string,
  roundDate: string,
  allLeagueScores: RawScoreDoc[]
): number {
  const playerScores = allLeagueScores
    .filter(s => s.playerId === playerId && !s.isSub && s.holeScores.reduce((a, b) => a + b, 0) > 0)
    .sort((a, b) => new Date(a.roundDate).getTime() - new Date(b.roundDate).getTime());

  const priorScores = playerScores.filter(
    s => new Date(s.roundDate).getTime() < new Date(roundDate).getTime()
  );

  // Rounds 1 and 2 (fewer than 2 prior rounds): apply retroactive logic
  if (priorScores.length < 2) {
    // Both R1 and R2 have been played — use their average as the established handicap
    if (playerScores.length >= 2) {
      const r1 = playerScores[0];
      const r2 = playerScores[1];
      const diff1 = r1.holeScores.reduce((a, b) => a + b, 0) - r1.coursePar;
      const diff2 = r2.holeScores.reduce((a, b) => a + b, 0) - r2.coursePar;
      return Math.min(18, (diff1 + diff2) / 2);
    }
    // Only 1 round has been played in total
    if (priorScores.length === 0) return 0; // R1 with no R2 yet — no strokes
    // R2 is being entered but R2 isn't saved yet — use R1 differential
    const rounds: RoundRecord[] = priorScores.map(ps => ({
      score: ps.holeScores.reduce((a, b) => a + b, 0),
      par: ps.coursePar,
      date: ps.roundDate,
    }));
    return calculateHandicapBase(rounds);
  }

  // Round 3 onward: normal calculation from all prior rounds
  const rounds: RoundRecord[] = priorScores.map(ps => ({
    score: ps.holeScores.reduce((a, b) => a + b, 0),
    par: ps.coursePar,
    date: ps.roundDate,
  }));
  return calculateHandicapBase(rounds);
}
