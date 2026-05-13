// In a league of N players/teams
// 1st place gets N+1 points
// 2nd place gets N-1 points
// 3rd place gets N-2 points
// ...
// Nth place gets 1 point
export function calculatePoints(
  scores: Array<{ id: string; netScore: number }>,
  totalParticipantsInLeague: number
): Map<string, number> {
  const n = totalParticipantsInLeague; // N teams/players total in league
  
  // Create an array of base points available for each position
  // 1st: n+1, 2nd: n-1, 3rd: n-2 ... until Nth: 1
  const availablePoints = [];
  availablePoints.push(n + 1); // 1st
  for (let i = n - 1; i >= 1; i--) {
    availablePoints.push(i);
  }
  // If actual entries are less than N (some didn't play), we just use the top available points?
  // User didn't specify absent players, but standard is points available are fixed to league size.

  // Group by score to handle ties
  const groupedList = new Map<number, string[]>();
  scores.forEach(s => {
    if (!groupedList.has(s.netScore)) {
      groupedList.set(s.netScore, []);
    }
    groupedList.get(s.netScore)!.push(s.id);
  });

  // Sort scores lowest to highest (golf is lowest wins)
  const uniqueScores = Array.from(groupedList.keys()).sort((a, b) => a - b);

  const finalPoints = new Map<string, number>();
  let currentPositionIndex = 0;

  for (const score of uniqueScores) {
    const tiedIds = groupedList.get(score)!;
    const numTied = tiedIds.length;
    
    // Sum points for these positions
    let sumPts = 0;
    for (let i = 0; i < numTied; i++) {
        // if for some reason we run out of defined points, add 0
        sumPts += availablePoints[currentPositionIndex + i] || 0;
    }
    
    const avgPts = sumPts / numTied;
    
    tiedIds.forEach(id => {
      finalPoints.set(id, avgPts);
    });

    currentPositionIndex += numTied;
  }

  return finalPoints;
}
