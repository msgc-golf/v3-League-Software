"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ArrowLeft, Trophy, Download } from "lucide-react";
import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import Link from "next/link";
import { useParams } from "next/navigation";
import { calculatePoints } from "@/lib/points";
import { calculatePlayingHandicap, getStrokesForHole, rankHoles } from "@/lib/handicap";
import { getPlayerHandicapDetailsForDate, getEffectiveHandicap, RawScoreDoc } from "@/lib/stats";
import { handleFirestoreError, OperationType } from "@/lib/firestoreErrorHandler";

export default function StandingsPage() {
  const params = useParams();
  const leagueId = params.id as string;

  const [league, setLeague] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "leagues", leagueId), (d) => {
      setLeague({ id: d.id, ...d.data() });
    }, (error) => handleFirestoreError(error, OperationType.GET, `leagues/${leagueId}`));
    return unsub;
  }, [leagueId]);

  useEffect(() => {
    const q = query(collection(db, "entries"), where("leagueId", "==", leagueId));
    const unsub = onSnapshot(q, (d) => {
      setEntries(d.docs.map(x => ({ id: x.id, ...x.data() })));
    }, (error) => handleFirestoreError(error, OperationType.GET, "entries"));
    return unsub;
  }, [leagueId]);

  useEffect(() => {
    const q = query(collection(db, "rounds"), where("leagueId", "==", leagueId));
    const unsub = onSnapshot(q, (d) => {
      setRounds(d.docs.map(x => ({ id: x.id, ...x.data() })));
    }, (error) => handleFirestoreError(error, OperationType.GET, "rounds"));
    return unsub;
  }, [leagueId]);

  useEffect(() => {
    const q = query(collection(db, "scores"), where("leagueId", "==", leagueId));
    const unsub = onSnapshot(q, (d) => {
      setScores(d.docs.map(x => ({ id: x.id, ...x.data() })));
    }, (error) => handleFirestoreError(error, OperationType.GET, "scores"));
    return unsub;
  }, [leagueId]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courses"), (d) => {
      setCourses(d.docs.map(x => ({ id: x.id, ...x.data() })));
    }, (error) => handleFirestoreError(error, OperationType.GET, "courses"));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "players"), (d) => {
      setPlayers(d.docs.map(x => ({ id: x.id, ...x.data() })));
    }, (error) => handleFirestoreError(error, OperationType.GET, "players"));
    return unsub;
  }, []);

  useEffect(() => {
    // Better loading check: ensure we have at least tried to load essential data
    if (league !== null && entries.length !== undefined && rounds.length !== undefined) {
      setLoading(false);
    }
  }, [league, entries, rounds]);

  if(loading) return <div className="p-8">Calculating Standings...</div>;
  if(!league) return null;

  // We need to calculate points per Round!
  // For each round, find each entry's net score.
  
  // Accumulated points map: EntryID -> Points
  const totalPoints: Record<string, number> = {};
  // Per-round points: roundId -> entryId -> points
  const roundPoints: Record<string, Record<string, number>> = {};
  entries.forEach(e => totalPoints[e.id] = 0);

  rounds.forEach(round => {
    const course = courses.find(c => c.id === round.courseId);
    if (!course) return; // Ignore if course deleted somehow
    const courseRankings = rankHoles(course.handicaps);

    const roundScores: Array<{ id: string, netScore: number }> = [];

    entries.forEach(entry => {
      const eScores = entry.playerIds.map((pId: string) => scores.find(s => s.roundId === round.id && s.playerId === pId));
      const isBestBall = league.format === 'best_ball' && entry.playerIds.length === 2;

      // Best ball: at least one player must have played. All other formats: everyone must have played.
      if (isBestBall ? eScores.every((s: any) => !s) : eScores.some((s: any) => !s)) return;

      if (isBestBall) {
        let teamNet = 0;
        const s1 = eScores[0] as any;
        const s2 = eScores[1] as any;
        const h1 = s1 ? calculatePlayingHandicap(getEffectiveHandicap(s1.playerId, s1.roundDate, scores as RawScoreDoc[]), 'best_ball') : 0;
        const h2 = s2 ? calculatePlayingHandicap(getEffectiveHandicap(s2.playerId, s2.roundDate, scores as RawScoreDoc[]), 'best_ball') : 0;

        for(let i=0; i<9; i++) {
          let holeNet = 999;
          if (s1 && s1.holeScores[i] > 0) {
             const net1 = s1.holeScores[i] - getStrokesForHole(h1, courseRankings[i]);
             if (net1 < holeNet) holeNet = net1;
          }
          if (s2 && s2.holeScores[i] > 0) {
             const net2 = s2.holeScores[i] - getStrokesForHole(h2, courseRankings[i]);
             if (net2 < holeNet) holeNet = net2;
          }
          if (holeNet < 999) teamNet += holeNet;
        }
        roundScores.push({ id: entry.id, netScore: teamNet });
      } else {
         // Individual or stroke play team — all players must have valid scores
         let eNet = 0;
         let valid = true;
         eScores.forEach((s: any) => {
            const h = calculatePlayingHandicap(getEffectiveHandicap(s.playerId, s.roundDate, scores as RawScoreDoc[]), league.format);
            const gross = s.holeScores.reduce((a:number,b:number)=>a+b, 0);
            if (gross > 0) {
               eNet += (gross - h);
            } else {
               valid = false;
            }
         });
         if (valid) {
            roundScores.push({ id: entry.id, netScore: eNet });
         }
      }
    });

    if (roundScores.length > 0) {
      const pointsMap = calculatePoints(roundScores, entries.length);
      roundPoints[round.id] = {};
      roundScores.forEach(rs => {
        const pts = pointsMap.get(rs.id) || 0;
        totalPoints[rs.id] += pts;
        roundPoints[round.id][rs.id] = pts;
      });
    }
  });

  const naturalName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const sortedEntries = [...entries]
    .map(e => ({...e, points: totalPoints[e.id]}))
    .sort((a, b) => b.points - a.points || naturalName(a.name, b.name));

  const handleDownloadPdf = () => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Header
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(league.name, 14, 20);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Standings Report  —  ${dateStr}`, 14, 29);
    doc.setTextColor(0);

    // Standings table
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Overall Standings', 14, 42);

    autoTable(doc, {
      startY: 47,
      head: [['Rank', 'Entry / Team', 'Total Points']],
      body: sortedEntries.map((e, idx) => [idx + 1, e.name, e.points.toFixed(1)]),
      headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { halign: 'center', cellWidth: 20 }, 2: { halign: 'right', cellWidth: 35 } },
      styles: { fontSize: 11 },
    });

    // Points by round table
    const sortedRounds = [...rounds].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const numRounds = sortedRounds.length;

    const afterStandings = (doc as any).lastAutoTable.finalY + 14;

    if (numRounds > 0) {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Points by Round', 14, afterStandings);

      const usableWidth = 182;
      const nameColW = numRounds <= 8 ? 55 : 45;
      const totalColW = 18;
      const roundColW = Math.max(8, (usableWidth - nameColW - totalColW) / numRounds);
      const tblFontSize = numRounds <= 8 ? 9 : numRounds <= 12 ? 8 : 7;

      const roundHeaders = sortedRounds.map((r, i) => {
        const shortDate = r.date ? r.date.replace(/^\d{4}-/, '').replace(/^0/, '') : '';
        return `R${i + 1}\n${shortDate}`;
      });

      const roundColStyles: Record<number, any> = {};
      for (let i = 1; i <= numRounds; i++) {
        roundColStyles[i] = { halign: 'center', cellWidth: roundColW };
      }
      roundColStyles[numRounds + 1] = { halign: 'right', cellWidth: totalColW, fontStyle: 'bold' };

      autoTable(doc, {
        startY: afterStandings + 5,
        head: [['Entry / Team', ...roundHeaders, 'Total']],
        body: sortedEntries.map(e => [
          e.name,
          ...sortedRounds.map(r => {
            const pts = roundPoints[r.id]?.[e.id];
            return pts !== undefined ? pts.toFixed(1) : '—';
          }),
          e.points.toFixed(1),
        ]),
        headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold', fontSize: tblFontSize },
        styles: { fontSize: tblFontSize },
        columnStyles: { 0: { cellWidth: nameColW }, ...roundColStyles },
      });
    }

    const afterRoundTable = (doc as any).lastAutoTable?.finalY ?? afterStandings;

    // Handicap report
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Player Handicap Report', 14, afterRoundTable + 14);

    const allPlayerIds = Array.from(new Set(entries.flatMap((e: any) => e.playerIds)))
      .sort((a, b) => naturalName(players.find(p => p.id === a)?.name ?? '', players.find(p => p.id === b)?.name ?? ''));
    const handicapRows = allPlayerIds.flatMap((playerId: any) => {
      const player = players.find(p => p.id === playerId);
      if (!player) return [];
      const hdcpDetails = getPlayerHandicapDetailsForDate(playerId, null, scores);
      const playingHdcp = calculatePlayingHandicap(hdcpDetails.baseHandicap, league.format);
      const diffs = [...hdcpDetails.differentials].reverse().slice(0, 3)
        .map(d => {
          const shortDate = d.date ? d.date.replace(/^\d{4}-/, '').replace(/^0/, '') : '?';
          return `${d.used ? '* ' : ''}${d.differential > 0 ? '+' : ''}${d.differential}  ${shortDate}`;
        })
        .join('\n');
      return [[player.name, hdcpDetails.baseHandicap.toFixed(1), String(playingHdcp), diffs || '—']];
    });

    autoTable(doc, {
      startY: afterRoundTable + 19,
      head: [['Player', 'Base Hdcp', 'Playing Hdcp', 'Recent Differentials (★ = used)']],
      body: handicapRows,
      headStyles: { fillColor: [75, 85, 99], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'center', cellWidth: 28 },
        2: { halign: 'center', cellWidth: 30 },
        3: { fontSize: 7, overflow: 'linebreak', cellWidth: 55 },
      },
      styles: { fontSize: 10 },
    });

    const safeName = league.name.replace(/[^a-z0-9]/gi, '_');
    doc.save(`${safeName}_Standings.pdf`);
  };

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href={`/leagues/${leagueId}`} className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-3xl font-bold">Standings</h1>
        </div>
        <button
          onClick={handleDownloadPdf}
          className="flex items-center space-x-2 bg-gray-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Download PDF</span>
        </button>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-12">
        <div className="bg-gray-900 px-6 py-4">
          <h2 className="text-white font-bold text-lg">Overall Standings</h2>
        </div>
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold border-b border-gray-200">
            <tr>
              <th className="p-4 px-6 w-16 text-center">Rank</th>
              <th className="p-4">Entry / Team</th>
              <th className="p-4 text-right pr-8">Total Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedEntries.map((e, idx) => (
              <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-4 px-6 text-center font-bold text-gray-400 text-lg">
                  {idx === 0 ? <Trophy className="w-6 h-6 text-yellow-500 mx-auto" /> : idx + 1}
                </td>
                <td className="p-4 font-bold text-gray-900 text-lg">{e.name}</td>
                <td className="p-4 text-right pr-8 font-extrabold text-blue-600 text-xl">{e.points.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <p className="p-8 text-center text-gray-500">No teams/players in this league yet.</p>}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gray-100 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="font-bold text-lg text-gray-900">Player Handicap Report</h2>
          <span className="text-sm text-gray-500">Calculated from league history</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold border-b border-gray-200">
              <tr>
                <th className="p-4 px-6">Player</th>
                <th className="p-4 text-center">Current Hndcp</th>
                <th className="p-4 text-center">Playing Hndcp</th>
                <th className="p-4">Recent Differentials (Used in bold)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from(new Set(entries.flatMap(e => e.playerIds)))
                .sort((a, b) => naturalName(players.find(p => p.id === a)?.name ?? '', players.find(p => p.id === b)?.name ?? ''))
                .map(playerId => {
                const player = players.find(p => p.id === playerId);
                if (!player) return null;
                const hdcpDetails = getPlayerHandicapDetailsForDate(playerId, null, scores);
                const playingHdcp = calculatePlayingHandicap(hdcpDetails.baseHandicap, league.format);
                
                return (
                  <tr key={playerId} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 px-6 font-medium text-gray-900">{player.name}</td>
                    <td className="p-4 text-center font-mono font-semibold text-gray-700">
                      {hdcpDetails.baseHandicap.toFixed(1)}
                    </td>
                    <td className="p-4 text-center">
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-bold text-sm">
                        {playingHdcp}
                      </span>
                    </td>
                    <td className="p-4">
                      {hdcpDetails.differentials.length === 0 ? (
                        <span className="text-gray-400 text-sm italic">No valid scores yet</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {/* Show from newest to oldest normally, differentials arr is oldest to newest, so let's reverse for display */}
                          {[...hdcpDetails.differentials].reverse().slice(0, 3).map((diff, i) => (
                            <div key={i} className={`flex flex-col border rounded px-2 py-1 text-xs ${diff.used ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-200 bg-gray-50 text-gray-500 opacity-60'}`}>
                              <span className="font-semibold">{diff.used ? '★' : ''} Diff: {diff.differential > 0 ? `+${diff.differential}` : diff.differential}</span>
                              <span className="text-[10px] mt-0.5">{diff.date || 'Unknown'} (Sc: {diff.score})</span>
                            </div>
                          ))}
                          {hdcpDetails.differentials.length > 3 && (
                             <div className="text-xs text-gray-400 flex items-center ml-2">+{hdcpDetails.differentials.length - 3} older</div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
