export interface RoundRecord {
  score: number;
  par: number;
  date?: string; // Add optional date for display
  id?: string;   // Add optional id for mapping
}

export interface HandicapDetails {
  baseHandicap: number;
  differentials: Array<{
    score: number;
    par: number;
    differential: number;
    used: boolean;
    date?: string;
  }>;
}

export function calculateHandicapDetails(rounds: RoundRecord[]): HandicapDetails {
  if (!rounds || rounds.length === 0) {
    return { baseHandicap: 0, differentials: [] };
  }

  // Map to differentials with their original data
  const withDiffs = rounds.map(r => ({
    score: r.score,
    par: r.par,
    differential: r.score - r.par,
    date: r.date,
    used: false
  }));

  const cap = (h: number) => Math.min(18, h);

  if (withDiffs.length === 1) {
    withDiffs[0].used = true;
    return { baseHandicap: cap(withDiffs[0].differential), differentials: withDiffs };
  }

  if (withDiffs.length === 2) {
    withDiffs[0].used = true;
    withDiffs[1].used = true;
    return {
      baseHandicap: cap((withDiffs[0].differential + withDiffs[1].differential) / 2),
      differentials: withDiffs
    };
  }

  // 3 or more rounds: take the most recent 3 rounds
  const recent3 = withDiffs.slice(-3);

  // Sort descending by differential to find the highest to drop
  const sortedByDiffDesc = [...recent3].sort((a, b) => b.differential - a.differential);

  // Skip the highest (index 0) and mark the rest as used
  for (let i = 1; i < sortedByDiffDesc.length; i++) {
    const item = sortedByDiffDesc[i];
    // mark the original object reference in recent3 as used
    const originalRef = recent3.find(r => r === item);
    if(originalRef) originalRef.used = true;
  }

  const remaining = sortedByDiffDesc.slice(1);
  const sum = remaining.reduce((acc, val) => acc + val.differential, 0);
  const baseHdcp = sum / remaining.length;

  return { baseHandicap: cap(baseHdcp), differentials: withDiffs };
}

export function calculateHandicapBase(rounds: RoundRecord[]): number {
  return calculateHandicapDetails(rounds).baseHandicap;
}

export function calculatePlayingHandicap(baseHandicap: number, format: 'stroke_play' | 'best_ball'): number {
  if (format === 'best_ball') {
    // 80% for best ball
    return Math.round(baseHandicap * 0.8);
  }
  // 100% for stroke play
  return Math.round(baseHandicap);
}

// Generate the 1-9 allocations given an array of hole handicaps.
// e.g., if hole handicaps are [3, 9, 15, 1, 11, 7, 5, 17, 13], rank them 1 to 9.
export function rankHoles(holeHandicaps: number[]): number[] {
  // Sort the handicaps to find their relative ranking 1-9
  const sorted = [...holeHandicaps].sort((a, b) => a - b);
  // Map each original handicap to its 1-based index (+1) in the sorted array
  return holeHandicaps.map(h => sorted.indexOf(h) + 1);
}

// Net score calculation per hole
// playingHandicap is the number of strokes the player gets.
// e.g. If playingHandicap = 4, the player gets 1 stroke on the holes Ranked 1, 2, 3, 4.
// If playingHandicap = 12, player gets 1 stroke on all 9 (9 strokes), plus an extra stroke on holes ranked 1, 2, 3 (another 3 strokes).
export function getStrokesForHole(playingHandicap: number, holeRank1to9: number): number {
  // Math for 9 holes:
  const baseStrokes = Math.floor(playingHandicap / 9);
  const remainder = playingHandicap % 9;
  
  // If the hole's rank is <= remainder, they get an extra stroke
  const extraStroke = holeRank1to9 <= remainder ? 1 : 0;
  
  return baseStrokes + extraStroke;
}
