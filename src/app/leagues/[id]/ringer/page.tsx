"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ArrowLeft, Download } from "lucide-react";
import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import Link from "next/link";
import { useParams } from "next/navigation";
import { handleFirestoreError, OperationType } from "@/lib/firestoreErrorHandler";

export default function RingerBoardPage() {
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
    if (league !== null) setLoading(false);
  }, [league]);

  if (loading) return <div className="p-8">Loading Ringer Board...</div>;
  if (!league) return null;

  // Courses used in this league's rounds
  const usedCourseIds = new Set(rounds.map(r => r.courseId));
  const usedCourses = courses.filter(c => usedCourseIds.has(c.id));

  // Identify front (1–9) and back (10–18) nines
  const frontCourse = usedCourses.find(c => (c.startingHole ?? 1) === 1);
  const backCourse  = usedCourses.find(c => c.startingHole === 10);

  const frontPars: number[] = frontCourse?.pars ?? Array(9).fill(4);
  const backPars:  number[] = backCourse?.pars  ?? Array(9).fill(4);
  const allPars = [...frontPars, ...backPars];

  // All players in the league (from entries)
  const leaguePlayerIds = Array.from(new Set(entries.flatMap((e: any) => e.playerIds as string[])));

  // Build ringer map: playerId -> best score per hole (null = not yet played)
  const ringerMap: Record<string, (number | null)[]> = {};
  leaguePlayerIds.forEach(pid => { ringerMap[pid] = Array(18).fill(null); });

  scores.forEach((score: any) => {
    if (score.isSub) return;
    if (!leaguePlayerIds.includes(score.playerId)) return;
    const course = courses.find(c => c.id === score.courseId);
    if (!course) return;
    const offset = course.startingHole === 10 ? 9 : 0;
    (score.holeScores as number[]).forEach((hs: number, i: number) => {
      if (hs === 0) return;
      const idx = offset + i;
      const cur = ringerMap[score.playerId][idx];
      if (cur === null || hs < cur) ringerMap[score.playerId][idx] = hs;
    });
  });

  const computeTotals = (pid: string) => {
    const holes = ringerMap[pid];
    const frontPlayed = holes.slice(0, 9).filter(h => h !== null) as number[];
    const backPlayed  = holes.slice(9, 18).filter(h => h !== null) as number[];
    const allPlayed   = holes.filter(h => h !== null) as number[];
    return {
      outTotal:      frontPlayed.length > 0 ? frontPlayed.reduce((a, b) => a + b, 0) : null,
      inTotal:       backPlayed.length  > 0 ? backPlayed.reduce((a, b) => a + b, 0)  : null,
      runningTotal:  allPlayed.length   > 0 ? allPlayed.reduce((a, b) => a + b, 0)   : null,
      playedHoles:   allPlayed.length,
    };
  };

  const sortedPlayers = [...leaguePlayerIds].sort((a, b) => {
    const ta = computeTotals(a);
    const tb = computeTotals(b);
    if (ta.playedHoles !== tb.playedHoles) return tb.playedHoles - ta.playedHoles;
    if (ta.runningTotal !== null && tb.runningTotal !== null) return ta.runningTotal - tb.runningTotal;
    if (ta.runningTotal !== null) return -1;
    if (tb.runningTotal !== null) return 1;
    const na = players.find(p => p.id === a)?.name ?? '';
    const nb = players.find(p => p.id === b)?.name ?? '';
    return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' });
  });

  const cellBg = (score: number | null, par: number) => {
    if (score === null) return '';
    const d = score - par;
    if (d <= -2) return 'bg-yellow-100 text-yellow-800 font-bold';
    if (d === -1) return 'bg-blue-100 text-blue-700 font-bold';
    if (d === 0)  return 'text-gray-900';
    if (d === 1)  return 'bg-orange-50 text-orange-700';
    return 'bg-red-50 text-red-700';
  };

  const frontParTotal = frontPars.reduce((a, b) => a + b, 0);
  const backParTotal  = backPars.reduce((a, b) => a + b, 0);

  const handleDownloadPdf = () => {
    const pdfDoc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    pdfDoc.setFontSize(18);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text(league.name, 14, 16);
    pdfDoc.setFontSize(10);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.setTextColor(100);
    pdfDoc.text(`Ringer Board  —  ${dateStr}`, 14, 23);
    pdfDoc.setTextColor(0);

    const holeHeaders = [
      ...Array.from({ length: 9 },  (_, i) => String(i + 1)),
      ...Array.from({ length: 9 },  (_, i) => String(i + 10)),
    ];
    const headers = ['Player', ...holeHeaders, 'Out', 'In', 'Total'];

    const parRow = [
      'Par',
      ...allPars.map(String),
      String(frontParTotal),
      String(backParTotal),
      String(frontParTotal + backParTotal),
    ];

    const bodyRows = sortedPlayers.map(pid => {
      const player = players.find(p => p.id === pid);
      const holes = ringerMap[pid];
      const { outTotal, inTotal, runningTotal } = computeTotals(pid);
      return [
        player?.name ?? 'Unknown',
        ...holes.map(h => h !== null ? String(h) : '—'),
        outTotal     !== null ? String(outTotal)     : '—',
        inTotal      !== null ? String(inTotal)      : '—',
        runningTotal !== null ? String(runningTotal) : '—',
      ];
    });

    autoTable(pdfDoc, {
      startY: 28,
      head: [headers],
      body: [parRow, ...bodyRows],
      headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      styles: { fontSize: 7, halign: 'center' },
      columnStyles: {
        0:  { halign: 'left', cellWidth: 36 },
        ...Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, { cellWidth: 9 }])),
        19: { cellWidth: 11, fontStyle: 'bold' },
        20: { cellWidth: 11, fontStyle: 'bold' },
        21: { cellWidth: 13, fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.row.index === 0) {
          data.cell.styles.fillColor = [235, 235, 235];
          data.cell.styles.fontStyle = 'bold';
          return;
        }
        if (data.section === 'body' && data.row.index > 0) {
          const col = data.column.index;
          if (col >= 1 && col <= 18) {
            const par = allPars[col - 1];
            const val = parseInt(data.cell.raw);
            if (!isNaN(val)) {
              const d = val - par;
              if (d <= -2) { data.cell.styles.fillColor = [254, 249, 195]; data.cell.styles.textColor = [133, 77, 14]; data.cell.styles.fontStyle = 'bold'; }
              else if (d === -1) { data.cell.styles.fillColor = [219, 234, 254]; data.cell.styles.textColor = [29, 78, 216]; data.cell.styles.fontStyle = 'bold'; }
              else if (d === 1)  { data.cell.styles.fillColor = [255, 237, 213]; data.cell.styles.textColor = [154, 52, 18]; }
              else if (d >= 2)   { data.cell.styles.fillColor = [254, 226, 226]; data.cell.styles.textColor = [185, 28, 28]; }
            }
          }
          if (col >= 19) data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    const safeName = league.name.replace(/[^a-z0-9]/gi, '_');
    pdfDoc.save(`${safeName}_Ringer_Board.pdf`);
  };

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8 flex items-center justify-between max-w-screen-xl mx-auto">
        <div className="flex items-center space-x-4">
          <Link href={`/leagues/${leagueId}`} className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Ringer Board</h1>
            <p className="text-sm text-gray-500">{league.name} — best gross score per hole this season</p>
          </div>
        </div>
        <button
          onClick={handleDownloadPdf}
          className="flex items-center space-x-2 bg-gray-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Download PDF</span>
        </button>
      </header>

      <div className="overflow-x-auto max-w-screen-xl mx-auto">
        <table className="text-sm border-collapse bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden w-full">
          <thead>
            {/* Hole number header */}
            <tr className="bg-gray-900 text-white">
              <th className="p-3 text-left font-semibold sticky left-0 bg-gray-900 z-10 min-w-[150px]">Player</th>
              {Array.from({ length: 9 }).map((_, i) => (
                <th key={i} className="p-2 text-center font-semibold w-9 text-xs">{i + 1}</th>
              ))}
              <th className="p-2 text-center font-bold w-11 bg-gray-700 text-xs">Out</th>
              {Array.from({ length: 9 }).map((_, i) => (
                <th key={i + 9} className="p-2 text-center font-semibold w-9 text-xs">{i + 10}</th>
              ))}
              <th className="p-2 text-center font-bold w-11 bg-gray-700 text-xs">In</th>
              <th className="p-2 text-center font-bold w-13 bg-gray-800 text-xs">Total</th>
            </tr>
            {/* Par row */}
            <tr className="bg-gray-100 text-gray-600 text-xs font-semibold border-b-2 border-gray-300">
              <td className="p-2 px-3 sticky left-0 bg-gray-100 z-10 font-bold text-gray-500">Par</td>
              {frontPars.map((p, i) => (
                <td key={i} className="p-2 text-center">{p}</td>
              ))}
              <td className="p-2 text-center font-bold bg-gray-200">{frontParTotal}</td>
              {backPars.map((p, i) => (
                <td key={i + 9} className="p-2 text-center">{p}</td>
              ))}
              <td className="p-2 text-center font-bold bg-gray-200">{backParTotal}</td>
              <td className="p-2 text-center font-bold bg-gray-300">{frontParTotal + backParTotal}</td>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedPlayers.map((pid, rowIdx) => {
              const player = players.find(p => p.id === pid);
              const holes = ringerMap[pid];
              const { outTotal, inTotal, runningTotal } = computeTotals(pid);
              const rowBase = rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
              return (
                <tr key={pid} className={`${rowBase} hover:bg-blue-50 transition-colors`}>
                  <td className={`p-3 font-medium sticky left-0 z-10 ${rowBase}`}>
                    {player?.name ?? 'Unknown'}
                  </td>
                  {/* Front nine */}
                  {holes.slice(0, 9).map((score, i) => (
                    <td key={i} className={`p-1 text-center text-xs font-mono ${cellBg(score, frontPars[i])}`}>
                      {score !== null ? score : <span className="text-gray-200">—</span>}
                    </td>
                  ))}
                  <td className="p-2 text-center font-bold text-sm bg-gray-100 text-gray-800">
                    {outTotal !== null ? outTotal : <span className="text-gray-300">—</span>}
                  </td>
                  {/* Back nine */}
                  {holes.slice(9, 18).map((score, i) => (
                    <td key={i + 9} className={`p-1 text-center text-xs font-mono ${cellBg(score, backPars[i])}`}>
                      {score !== null ? score : <span className="text-gray-200">—</span>}
                    </td>
                  ))}
                  <td className="p-2 text-center font-bold text-sm bg-gray-100 text-gray-800">
                    {inTotal !== null ? inTotal : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="p-2 text-center font-extrabold text-blue-600 bg-blue-50">
                    {runningTotal !== null ? runningTotal : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
            {sortedPlayers.length === 0 && (
              <tr>
                <td colSpan={22} className="p-10 text-center text-gray-400">
                  No scores recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-5 flex flex-wrap gap-4 text-xs text-gray-500 max-w-screen-xl mx-auto">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-yellow-100 border border-yellow-200 inline-block" />
          Eagle or better
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-blue-100 border border-blue-200 inline-block" />
          Birdie
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-white border border-gray-200 inline-block" />
          Par
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-orange-50 border border-orange-200 inline-block" />
          Bogey
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-red-50 border border-red-200 inline-block" />
          Double or worse
        </span>
        <span className="ml-2 text-gray-400 italic">— = hole not yet played this season</span>
      </div>
    </div>
  );
}
