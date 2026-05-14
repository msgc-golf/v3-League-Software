"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ArrowLeft, Save, Download } from "lucide-react";
import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getPlayerHandicapForDate, getEffectiveHandicap, RawScoreDoc } from "@/lib/stats";
import { calculatePlayingHandicap, getStrokesForHole, rankHoles } from "@/lib/handicap";
import { handleFirestoreError, OperationType } from "@/lib/firestoreErrorHandler";

export default function ScoreEntryPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const roundId = params.roundId as string;

  const [round, setRound] = useState<any>(null);
  const [course, setCourse] = useState<any>(null);
  const [league, setLeague] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [allScores, setAllScores] = useState<RawScoreDoc[]>([]);

  // Local state for score inputs. Structure: { entryId: { playerId: [9 scores] } }
  const [scoresInput, setScoresInput] = useState<Record<string, Record<string, number[]>>>({});
  // to track which ones are saved to DB
  const [savedScoreIds, setSavedScoreIds] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [isTotalMode, setIsTotalMode] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "rounds", roundId), (d) => {
      setRound({ id: d.id, ...d.data() });
    }, (error) => handleFirestoreError(error, OperationType.GET, `rounds/${roundId}`));
    return unsub;
  }, [roundId]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "leagues", leagueId), (d) => {
      setLeague({ id: d.id, ...d.data() });
    }, (error) => handleFirestoreError(error, OperationType.GET, `leagues/${leagueId}`));
    return unsub;
  }, [leagueId]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "players"), (d) => {
      setPlayers(d.docs.map(x => ({ id: x.id, ...x.data() })));
    }, (error) => handleFirestoreError(error, OperationType.GET, "players"));
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "entries"), where("leagueId", "==", leagueId));
    const unsub = onSnapshot(q, (d) => {
      setEntries(d.docs.map(x => ({ id: x.id, ...x.data() })));
    }, (error) => handleFirestoreError(error, OperationType.GET, "entries"));
    return unsub;
  }, [leagueId]);

  useEffect(() => {
    if (!entries.length) return;

    const q = query(collection(db, "scores"), where("leagueId", "==", leagueId));
    const unsub = onSnapshot(q, (d) => {
      const h = d.docs.map(x => ({ id: x.id, ...x.data() } as RawScoreDoc));
      setAllScores(h);

      const currentRoundScores = h.filter(s => s.roundId === roundId);
      const newInputs: Record<string, Record<string, number[]>> = {};
      const newSavedIds: Record<string, Record<string, string>> = {};

      currentRoundScores.forEach(s => {
        const entry = entries.find((en: any) => en.playerIds.includes(s.playerId));
        if (!entry) return;

        if (!newInputs[entry.id]) newInputs[entry.id] = {};
        if (!newSavedIds[entry.id]) newSavedIds[entry.id] = {};

        newInputs[entry.id][s.playerId] = s.holeScores;
        newSavedIds[entry.id][s.playerId] = s.id;
      });

      setScoresInput(prev => {
        // If we already have user inputs, we might want to merge or only set once
        // For now, let's just set them if we don't have them yet or if it's the first load
        if (Object.keys(prev).length === 0) {
          return newInputs;
        }
        return prev;
      });
      setSavedScoreIds(newSavedIds);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, "scores"));

    return unsub;
  }, [leagueId, roundId, entries]);

  // Load course once round is loaded
  useEffect(() => {
    if (round?.courseId) {
      onSnapshot(doc(db, "courses", round.courseId), (d) => setCourse({id: d.id, ...d.data()}), (error) => handleFirestoreError(error, OperationType.GET, "courses"));
    }
  }, [round]);

  const handleScoreChange = (entryId: string, playerId: string, holeIndex: number, val: string) => {
    const num = val === "" ? 0 : parseInt(val);
    const newInputs = { ...scoresInput };
    if (!newInputs[entryId]) newInputs[entryId] = {};
    if (!newInputs[entryId][playerId]) newInputs[entryId][playerId] = Array(9).fill(0);
    newInputs[entryId][playerId][holeIndex] = num;
    setScoresInput(newInputs);
  };

  const handleSaveEntryScores = async (entryId: string, entry: any) => {
    for (const pId of entry.playerIds) {
      const holes = scoresInput[entryId]?.[pId] || Array(9).fill(0);
      const gross = holes.reduce((a: number, b: number) => a + b, 0);
      const existingDocId = savedScoreIds[entryId]?.[pId];

      try {
        if (gross === 0) {
          // Player didn't play — remove their score doc if one exists
          if (existingDocId) {
            await deleteDoc(doc(db, "scores", existingDocId));
          }
          continue;
        }

        const hdcp = getPlayerHandicapForDate(pId, round.date, allScores);
        const payload = {
          roundId,
          leagueId,
          playerId: pId,
          roundDate: round.date,
          courseId: course.id,
          coursePar: course.pars.reduce((a:any,b:any)=>a+b,0),
          holeScores: holes,
          calculatedHandicap: hdcp,
        };

        if (existingDocId) {
          await updateDoc(doc(db, "scores", existingDocId), payload);
        } else {
          await addDoc(collection(db, "scores"), payload);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "scores");
      }
    }
    alert("Scores saved for entry");
  };

  if(!round || !course || !league) return <div className="p-8">Loading round details...</div>;

  const courseHoleRankings = rankHoles(course.handicaps);
  const cPar = course.pars.reduce((a:any,b:any)=>a+b,0);
  const sortedEntries = [...entries].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`${league.name}  —  ${course.name}`, 14, 18);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Round Date: ${round.date}   •   Generated: ${dateStr}`, 14, 26);
    doc.setTextColor(0);

    let currentY = 34;

    sortedEntries.forEach((entry: any, entryIndex: number) => {
      if (entryIndex > 0) currentY = (doc as any).lastAutoTable.finalY + 10;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(entry.name, 14, currentY);

      const isBestBall = league.format === 'best_ball' && entry.playerIds.length === 2;

      const holeHeaders = isTotalMode
        ? ['Player', 'Hdcp', 'Gross', 'Net']
        : ['Player', 'Hdcp', ...course.pars.map((p: number, i: number) => `H${i + 1}\n(${p})`), 'Gross', 'Net'];

      const rows: any[] = entry.playerIds.map((pId: string) => {
        const pName = players.find((p: any) => p.id === pId)?.name || 'Unknown';
        const baseHdcp = getEffectiveHandicap(pId, round.date, allScores);
        const playingHdcp = calculatePlayingHandicap(baseHdcp, league.format);
        const holeScores = scoresInput[entry.id]?.[pId] || Array(9).fill(0);

        let gross = 0;
        let totalNet = 0;

        holeScores.forEach((sc: number, i: number) => {
          gross += sc;
          const strokes = getStrokesForHole(playingHdcp, courseHoleRankings[i]);
          if (sc > 0) totalNet += sc - strokes;
        });

        if (isTotalMode && gross > 0) totalNet = gross - playingHdcp;

        const hdcpLabel = `${baseHdcp.toFixed(1)} (${playingHdcp})`;

        if (isTotalMode) {
          return [pName, hdcpLabel, gross || '—', gross > 0 ? totalNet : '—'];
        }
        return [pName, hdcpLabel, ...holeScores.map((sc: number) => sc || '—'), gross || '—', gross > 0 ? totalNet : '—'];
      });

      // Best ball team net row
      if (isBestBall) {
        const p1Scores = scoresInput[entry.id]?.[entry.playerIds[0]] || Array(9).fill(0);
        const p2Scores = scoresInput[entry.id]?.[entry.playerIds[1]] || Array(9).fill(0);
        const p1Hdcp = calculatePlayingHandicap(getEffectiveHandicap(entry.playerIds[0], round.date, allScores), 'best_ball');
        const p2Hdcp = calculatePlayingHandicap(getEffectiveHandicap(entry.playerIds[1], round.date, allScores), 'best_ball');

        let teamNet = 0;
        for (let i = 0; i < 9; i++) {
          const g1 = p1Scores[i] || 0;
          const g2 = p2Scores[i] || 0;
          if (g1 === 0 && g2 === 0) continue;
          let best = 999;
          if (g1 > 0) best = Math.min(best, g1 - getStrokesForHole(p1Hdcp, courseHoleRankings[i]));
          if (g2 > 0) best = Math.min(best, g2 - getStrokesForHole(p2Hdcp, courseHoleRankings[i]));
          if (best < 999) teamNet += best;
        }

        const emptyHoles = isTotalMode ? [] : Array(9).fill('');
        rows.push(['Team Best Ball Net', '', ...emptyHoles, '', teamNet]);
      }

      autoTable(doc, {
        startY: currentY + 4,
        head: [holeHeaders],
        body: rows,
        headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 9, halign: 'center' },
        columnStyles: { 0: { halign: 'left', cellWidth: 42 }, 1: { cellWidth: 22 } },
        didParseCell: (data: any) => {
          if (isBestBall && data.row.index === rows.length - 1 && data.section === 'body') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [219, 234, 254];
          }
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;
    });

    const safeName = `${league.name}_${course.name}_${round.date}`.replace(/[^a-z0-9]/gi, '_');
    doc.save(`${safeName}_Scores.pdf`);
  };

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href={`/leagues/${leagueId}/rounds`} className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Enter Scores: {course.name}</h1>
            <div className="flex items-center space-x-4 mt-1">
              <p className="text-gray-500">{round.date} • {league.name}</p>
              {league.format === 'stroke_play' && (
                <label className="flex items-center space-x-2 text-sm bg-gray-100 px-3 py-1 rounded-full cursor-pointer hover:bg-gray-200 transition-colors">
                  <input
                    type="checkbox"
                    checked={isTotalMode}
                    onChange={(e) => setIsTotalMode(e.target.checked)}
                    className="rounded text-gray-900 border-gray-300"
                  />
                  <span className="font-medium text-gray-700">Enter Totals Only</span>
                </label>
              )}
            </div>
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

      <div className="space-y-8">
        {sortedEntries.map(entry => {
          return (
            <div key={entry.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 overflow-x-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{entry.name}</h2>
                <button onClick={() => handleSaveEntryScores(entry.id, entry)} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center">
                  <Save className="w-4 h-4 mr-2" /> Save Entry Scores
                </button>
              </div>

              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="p-2 font-medium">Player</th>
                    <th className="p-2 font-medium text-center">Hndcp</th>
                    {!isTotalMode && Array.from({length: 9}).map((_, i) => (
                      <th key={i} className="p-2 font-medium text-center">
                        <div>H{i+1}</div>
                        <div className="text-xs font-normal">P:{course.pars[i]} R:{courseHoleRankings[i]}</div>
                      </th>
                    ))}
                    <th className="p-2 font-medium text-center">Gross</th>
                    <th className="p-2 font-medium text-center">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entry.playerIds.map((pId: string) => {
                    const pName = players.find(p => p.id === pId)?.name || 'Unknown';
                    const baseHdcp = getEffectiveHandicap(pId, round.date, allScores);
                    const playingHdcp = calculatePlayingHandicap(baseHdcp, league.format);
                    const scores = scoresInput[entry.id]?.[pId] || Array(9).fill(0);
                    
                    let gross = 0;
                    let totalNet = 0;
                    
                    const holeNets = scores.map((sc, i) => {
                       gross += sc;
                       const strokesGained = getStrokesForHole(playingHdcp, courseHoleRankings[i]);
                       const net = sc > 0 ? sc - strokesGained : 0;
                       totalNet += net;
                       return { gross: sc, net, strokesGained };
                    });

                    // For stroke play total mode only
                    if (isTotalMode && gross > 0) {
                      totalNet = gross - playingHdcp;
                    }

                    return (
                      <tr key={pId}>
                        <td className="p-2 font-medium">{pName}</td>
                        <td className="p-2 text-center text-gray-500">
                          {baseHdcp.toFixed(1)} <br/>
                          <span className="text-xs font-bold">({playingHdcp})</span>
                        </td>
                        {!isTotalMode && scores.map((sc: number, i: number) => (
                          <td key={i} className="p-2 text-center">
                            <input 
                              type="number"
                              min="0"
                              value={sc === 0 ? "" : sc}
                              onChange={(e) => handleScoreChange(entry.id, pId, i, e.target.value)}
                              className="w-12 text-center border border-gray-300 rounded p-1"
                            />
                            {sc > 0 && holeNets[i].strokesGained > 0 && (
                              <div className="text-[10px] text-gray-400 mt-1">
                                Net {holeNets[i].net} (-{holeNets[i].strokesGained})
                              </div>
                            )}
                          </td>
                        ))}
                        <td className="p-2 text-center font-bold">
                          {isTotalMode ? (
                            <input
                              type="number"
                              min="0"
                              value={gross === 0 ? "" : gross}
                              onChange={(e) => {
                                const val = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                                const newInputs = { ...scoresInput };
                                if (!newInputs[entry.id]) newInputs[entry.id] = {};
                                newInputs[entry.id][pId] = [val, 0, 0, 0, 0, 0, 0, 0, 0];
                                setScoresInput(newInputs);
                              }}
                              className="w-16 text-center border border-gray-300 rounded p-1 shadow-sm font-semibold text-gray-900"
                            />
                          ) : (
                            gross
                          )}
                        </td>
                        <td className="p-2 text-center font-bold text-blue-600">{totalNet}</td>
                      </tr>
                    )
                  })}
                  
                  {/* Team Summary if 2 players */}
                  {entry.playerIds.length === 2 && league.format === 'best_ball' && (
                    <tr className="bg-blue-50">
                      <td colSpan={11} className="p-2 font-medium text-right">Team Best Ball Net Score:</td>
                      <td className="p-2 text-center font-bold text-blue-800">
                        {(() => {
                           // calculate best ball dynamically from local state inputs
                           const p1Scores = scoresInput[entry.id]?.[entry.playerIds[0]] || Array(9).fill(0);
                           const p2Scores = scoresInput[entry.id]?.[entry.playerIds[1]] || Array(9).fill(0);
                           const p1Hdcp = calculatePlayingHandicap(getEffectiveHandicap(entry.playerIds[0], round.date, allScores), 'best_ball');
                           const p2Hdcp = calculatePlayingHandicap(getEffectiveHandicap(entry.playerIds[1], round.date, allScores), 'best_ball');
                           
                           let teamNet = 0;
                           for(let i=0; i<9; i++) {
                             const p1Gross = p1Scores[i] || 0;
                             const p2Gross = p2Scores[i] || 0;
                             if(p1Gross === 0 && p2Gross === 0) continue; // hole not played yet

                             let holeNet = 999;
                             if (p1Gross > 0) {
                               const net1 = p1Gross - getStrokesForHole(p1Hdcp, courseHoleRankings[i]);
                               if (net1 < holeNet) holeNet = net1;
                             }
                             if (p2Gross > 0) {
                               const net2 = p2Gross - getStrokesForHole(p2Hdcp, courseHoleRankings[i]);
                               if (net2 < holeNet) holeNet = net2;
                             }
                             if(holeNet < 999) teamNet += holeNet;
                           }
                           return teamNet;
                        })()}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )
        })}
        {entries.length === 0 && <p>No entries. Add some to the league first.</p>}
      </div>
    </div>
  );
}
