"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ArrowLeft, Save, Download, Printer } from "lucide-react";
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
  // entryId -> playerId -> sub info
  const [subState, setSubState] = useState<Record<string, Record<string, { isSub: boolean; subName: string; subHandicap: number }>>>({});
  const [showScorecards, setShowScorecards] = useState(false);
  // each group is [entry1Id, entry2Id] — '' means slot empty / solo
  const [pairings, setPairings] = useState<string[][]>([]);

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

      const newSubState: Record<string, Record<string, { isSub: boolean; subName: string; subHandicap: number }>> = {};
      currentRoundScores.forEach(s => {
        const entry = entries.find((en: any) => en.playerIds.includes(s.playerId));
        if (!entry) return;

        if (!newInputs[entry.id]) newInputs[entry.id] = {};
        if (!newSavedIds[entry.id]) newSavedIds[entry.id] = {};

        newInputs[entry.id][s.playerId] = s.holeScores;
        newSavedIds[entry.id][s.playerId] = s.id;

        if (s.isSub) {
          if (!newSubState[entry.id]) newSubState[entry.id] = {};
          newSubState[entry.id][s.playerId] = { isSub: true, subName: s.subName ?? '', subHandicap: s.subHandicap ?? 0 };
        }
      });

      setScoresInput(prev => {
        if (Object.keys(prev).length === 0) {
          return newInputs;
        }
        return prev;
      });
      setSubState(prev => {
        if (Object.keys(prev).length === 0 && Object.keys(newSubState).length > 0) {
          return newSubState;
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

  const toggleSub = (entryId: string, pId: string) => {
    setSubState(prev => {
      const entryMap = { ...(prev[entryId] || {}) };
      if (entryMap[pId]?.isSub) {
        delete entryMap[pId];
      } else {
        entryMap[pId] = { isSub: true, subName: '', subHandicap: 0 };
      }
      return { ...prev, [entryId]: entryMap };
    });
  };

  const updateSub = (entryId: string, pId: string, field: 'subName' | 'subHandicap', value: string | number) => {
    setSubState(prev => ({
      ...prev,
      [entryId]: {
        ...prev[entryId],
        [pId]: { ...prev[entryId]?.[pId], [field]: value }
      }
    }));
  };

  const getBaseHdcp = (entryId: string, pId: string): number => {
    const sub = subState[entryId]?.[pId];
    if (sub?.isSub) return sub.subHandicap ?? 0;
    return getEffectiveHandicap(pId, round?.date, allScores);
  };

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

        const subInfo = subState[entryId]?.[pId];
        const hdcp = subInfo?.isSub ? (subInfo.subHandicap ?? 0) : getPlayerHandicapForDate(pId, round.date, allScores);
        const payload: Record<string, any> = {
          roundId,
          leagueId,
          playerId: pId,
          roundDate: round.date,
          courseId: course.id,
          coursePar: course.pars.reduce((a:any,b:any)=>a+b,0),
          holeScores: holes,
          calculatedHandicap: hdcp,
          isSub: subInfo?.isSub ?? false,
          subName: subInfo?.isSub ? (subInfo.subName ?? '') : '',
          subHandicap: subInfo?.isSub ? (subInfo.subHandicap ?? 0) : 0,
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

  const autoPair = () => {
    const ids = sortedEntries.map((e: any) => e.id);
    const groups: string[][] = [];
    for (let i = 0; i < ids.length; i += 2) {
      groups.push(i + 1 < ids.length ? [ids[i], ids[i + 1]] : [ids[i], '']);
    }
    setPairings(groups);
  };

  const addPairing = () => setPairings(prev => [...prev, ['', '']]);
  const removePairing = (idx: number) => setPairings(prev => prev.filter((_, i) => i !== idx));

  const setSlot = (groupIdx: number, slotIdx: number, entryId: string) => {
    setPairings(prev => {
      const next = prev.map(g => [...g] as string[]);
      if (!next[groupIdx]) next[groupIdx] = ['', ''];
      next[groupIdx] = [...next[groupIdx]];
      next[groupIdx][slotIdx] = entryId;
      return next;
    });
  };

  const getAvailableForSlot = (groupIdx: number, slotIdx: number) => {
    const otherUsed = new Set(
      pairings.flatMap((g, gi) =>
        g.filter((id, si) => id !== '' && !(gi === groupIdx && si === slotIdx))
      )
    );
    return sortedEntries.filter((e: any) => !otherUsed.has(e.id));
  };

  const generateScorecardsPdf = () => {
    const jsPDFDoc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

    const pageW = 279.4;
    const pageH = 215.9;
    const sideMargin = 8;
    const topMargin = 6;
    const midGap = 5;
    const cardW = pageW - sideMargin * 2;
    const cardH = (pageH - topMargin * 2 - midGap) / 2;
    const cardX = sideMargin;
    const labelW = 38;
    const totalW = 20;
    const holeW = (cardW - labelW - totalW) / 9;
    const hdrRowH = 6;

    const drawCutLine = (d: any) => {
      const midY = topMargin + cardH + midGap / 2;
      d.setLineDashPattern([3, 3], 0);
      d.setLineWidth(0.25);
      d.setDrawColor(160, 160, 160);
      d.line(0, midY, pageW, midY);
      d.setLineDashPattern([], 0);
      d.setDrawColor(0);
    };

    const drawCell = (
      d: any, cx: number, cy: number, cw: number, ch: number,
      text: string, bold: boolean, centered: boolean, fontSize: number,
      bg: [number, number, number] | null
    ) => {
      d.setDrawColor(160, 160, 160);
      d.setLineWidth(0.2);
      if (bg) {
        d.setFillColor(bg[0], bg[1], bg[2]);
        d.rect(cx, cy, cw, ch, 'FD');
      } else {
        d.rect(cx, cy, cw, ch);
      }
      if (text) {
        d.setFont('helvetica', bold ? 'bold' : 'normal');
        d.setFontSize(fontSize);
        d.setTextColor(0, 0, 0);
        const textY = cy + ch * 0.65;
        if (centered) {
          d.text(text, cx + cw / 2, textY, { align: 'center' });
        } else {
          d.text(text, cx + 1.5, textY, { maxWidth: cw - 2 });
        }
      }
    };

    const drawTableRow = (
      d: any, ry: number, rh: number, label: string,
      holes: string[], total: string,
      bold: boolean, bg: [number, number, number] | null
    ) => {
      drawCell(d, cardX, ry, labelW, rh, label, bold, false, 7, bg);
      for (let i = 0; i < 9; i++) {
        drawCell(d, cardX + labelW + i * holeW, ry, holeW, rh, holes[i] ?? '', false, true, 7, bg);
      }
      drawCell(d, cardX + labelW + 9 * holeW, ry, totalW, rh, total, bold, true, 7, bg);
    };

    const drawScorecard = (d: any, pairing: string[], cardY: number) => {
      const pEntries = pairing
        .filter(id => id !== '')
        .map(id => entries.find((e: any) => e.id === id))
        .filter(Boolean) as any[];
      const isBestBall = league.format === 'best_ball';
      const totalPlayers = pEntries.reduce((sum: number, e: any) => sum + (e.playerIds?.length ?? 0), 0);
      const teamHeaderH = isBestBall ? 5 : 0;
      const numTeamHeaders = isBestBall ? pEntries.length : 0;
      const headerArea = 13;
      const fixedTableH = hdrRowH * 3 + numTeamHeaders * teamHeaderH;
      const playerRowH = Math.max(10, Math.min(22, (cardH - headerArea - fixedTableH) / Math.max(1, totalPlayers)));

      // Card outline
      d.setDrawColor(0);
      d.setLineWidth(0.5);
      d.rect(cardX, cardY, cardW, cardH);

      // Header
      d.setFontSize(9);
      d.setFont('helvetica', 'bold');
      d.setTextColor(0, 0, 0);
      d.text(league.name, cardX + 2, cardY + 5);

      d.setFontSize(7.5);
      d.setFont('helvetica', 'normal');
      d.text(`${course.name}  •  ${round.date}`, cardX + 2, cardY + 10);

      if (pEntries.length > 0) {
        const groupLabel = pEntries.map((e: any) => e.name).join(' vs ');
        d.setFontSize(7);
        d.setFont('helvetica', 'italic');
        d.text(groupLabel, cardX + cardW - 2, cardY + 5, { align: 'right', maxWidth: cardW * 0.55 });
      }

      const tableY = cardY + headerArea;
      const parTotal = course.pars.reduce((a: number, b: number) => a + b, 0);

      drawTableRow(d, tableY,              hdrRowH, 'Hole', Array.from({ length: 9 }, (_, i) => String(i + 1)), 'Total', true,  [210, 210, 210]);
      drawTableRow(d, tableY + hdrRowH,    hdrRowH, 'Par',  course.pars.map(String), String(parTotal),          false, [235, 235, 235]);
      drawTableRow(d, tableY + hdrRowH * 2,hdrRowH, 'Hdcp', course.handicaps.map(String), '',                   false, [235, 235, 235]);

      let rowY = tableY + hdrRowH * 3;

      pEntries.forEach((entry: any) => {
        if (isBestBall) {
          d.setFillColor(45, 45, 45);
          d.rect(cardX, rowY, cardW, teamHeaderH, 'F');
          d.setFontSize(7);
          d.setFont('helvetica', 'bold');
          d.setTextColor(255, 255, 255);
          d.text(entry.name, cardX + 2, rowY + teamHeaderH * 0.72);
          d.setTextColor(0, 0, 0);
          rowY += teamHeaderH;
        }

        entry.playerIds.forEach((pId: string) => {
          const player = players.find((p: any) => p.id === pId);
          const sub = subState[entry.id]?.[pId];
          const baseHdcp = sub?.isSub
            ? (sub.subHandicap ?? 0)
            : getEffectiveHandicap(pId, round.date, allScores);
          const playingHdcp = calculatePlayingHandicap(baseHdcp, league.format);
          const displayName = sub?.isSub
            ? `${sub.subName || 'Sub'} (sub for ${player?.name || ''})`
            : (player?.name || 'Unknown');
          const rowLabel = `${displayName}  (Hdcp: ${playingHdcp})`;

          drawTableRow(d, rowY, playerRowH, rowLabel, Array(9).fill(''), '', false, null);
          rowY += playerRowH;
        });
      });
    };

    let pageCardCount = 0;
    drawCutLine(jsPDFDoc);

    pairings.forEach(pairing => {
      if (pageCardCount === 2) {
        jsPDFDoc.addPage();
        drawCutLine(jsPDFDoc);
        pageCardCount = 0;
      }
      const cardY = pageCardCount === 0 ? topMargin : topMargin + cardH + midGap;
      drawScorecard(jsPDFDoc, pairing, cardY);
      pageCardCount++;
    });

    const safeName = `${league.name}_${round.date}`.replace(/[^a-z0-9]/gi, '_');
    jsPDFDoc.save(`${safeName}_Scorecards.pdf`);
  };

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
        const realName = players.find((p: any) => p.id === pId)?.name || 'Unknown';
        const pdfSub = subState[entry.id]?.[pId];
        const pName = pdfSub?.isSub ? `${pdfSub.subName || 'Sub'} (sub for ${realName})` : realName;
        const baseHdcp = pdfSub?.isSub ? (pdfSub.subHandicap ?? 0) : getEffectiveHandicap(pId, round.date, allScores);
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
        const p1Hdcp = calculatePlayingHandicap(getBaseHdcp(entry.id, entry.playerIds[0]), 'best_ball');
        const p2Hdcp = calculatePlayingHandicap(getBaseHdcp(entry.id, entry.playerIds[1]), 'best_ball');

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
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowScorecards(s => !s)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors border ${showScorecards ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
          >
            <Printer className="w-4 h-4" />
            <span>Print Scorecards</span>
          </button>
          <button
            onClick={handleDownloadPdf}
            className="flex items-center space-x-2 bg-gray-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download PDF</span>
          </button>
        </div>
      </header>

      {showScorecards && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold">Scorecard Pairings</h2>
            <button onClick={() => setShowScorecards(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <button onClick={autoPair} className="bg-gray-900 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-700">
              Auto-Pair
            </button>
            <button onClick={() => setPairings([])} className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50">
              Clear All
            </button>
          </div>

          <div className="space-y-2 mb-5">
            {pairings.map((group, gIdx) => {
              const avail0 = getAvailableForSlot(gIdx, 0);
              const avail1 = getAvailableForSlot(gIdx, 1);
              const current0 = group[0] || '';
              const current1 = group[1] || '';
              return (
                <div key={gIdx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs font-bold text-gray-400 w-16 shrink-0">Group {gIdx + 1}</span>
                  <select
                    value={current0}
                    onChange={e => setSlot(gIdx, 0, e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm flex-1 min-w-0"
                  >
                    <option value="">— Select Entry —</option>
                    {avail0.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    {current0 && !avail0.find((e: any) => e.id === current0) && (
                      <option value={current0}>{entries.find((e: any) => e.id === current0)?.name}</option>
                    )}
                  </select>
                  <span className="text-gray-400 text-sm shrink-0">vs</span>
                  <select
                    value={current1}
                    onChange={e => setSlot(gIdx, 1, e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm flex-1 min-w-0"
                  >
                    <option value="">— Solo (no partner) —</option>
                    {avail1.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    {current1 && !avail1.find((e: any) => e.id === current1) && (
                      <option value={current1}>{entries.find((e: any) => e.id === current1)?.name}</option>
                    )}
                  </select>
                  <button onClick={() => removePairing(gIdx)} className="text-gray-300 hover:text-red-400 shrink-0 text-2xl leading-none px-1">×</button>
                </div>
              );
            })}
            {pairings.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No groups yet — click Auto-Pair or Add Group.</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={addPairing} className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50">
              + Add Group
            </button>
            {pairings.some(g => g.some(id => id !== '')) && (
              <button onClick={generateScorecardsPdf} className="bg-green-700 text-white px-5 py-1.5 rounded text-sm font-medium hover:bg-green-800">
                Generate Scorecards PDF
              </button>
            )}
          </div>
        </div>
      )}

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
                    const sub = subState[entry.id]?.[pId];
                    const baseHdcp = getBaseHdcp(entry.id, pId);
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
                        <td className="p-2 font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            {sub?.isSub ? (
                              <>
                                <input
                                  type="text"
                                  value={sub.subName}
                                  onChange={e => updateSub(entry.id, pId, 'subName', e.target.value)}
                                  placeholder="Sub name"
                                  className="border border-orange-300 rounded px-2 py-1 text-sm w-28"
                                />
                                <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">sub for {pName}</span>
                              </>
                            ) : (
                              <span>{pName}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleSub(entry.id, pId)}
                              className={`text-xs px-2 py-0.5 rounded border whitespace-nowrap transition-colors ${sub?.isSub ? 'border-orange-300 text-orange-600 hover:bg-orange-50' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                            >
                              {sub?.isSub ? '✕ Remove Sub' : 'Sub'}
                            </button>
                          </div>
                        </td>
                        <td className="p-2 text-center text-gray-500">
                          {sub?.isSub ? (
                            <>
                              <input
                                type="number"
                                min="0"
                                max="18"
                                step="0.5"
                                value={sub.subHandicap}
                                onChange={e => updateSub(entry.id, pId, 'subHandicap', parseFloat(e.target.value) || 0)}
                                className="w-14 text-center border border-orange-300 rounded p-1 text-sm"
                              />
                              <br/>
                              <span className="text-xs font-bold">({playingHdcp})</span>
                            </>
                          ) : (
                            <>
                              {baseHdcp.toFixed(1)} <br/>
                              <span className="text-xs font-bold">({playingHdcp})</span>
                            </>
                          )}
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
                           const p1Hdcp = calculatePlayingHandicap(getBaseHdcp(entry.id, entry.playerIds[0]), 'best_ball');
                           const p2Hdcp = calculatePlayingHandicap(getBaseHdcp(entry.id, entry.playerIds[1]), 'best_ball');
                           
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
