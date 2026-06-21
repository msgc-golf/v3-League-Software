"use client";

import { useState, useEffect } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ArrowLeft, Users, Calendar, BarChart2, Target } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { League } from "../page";
import { handleFirestoreError, OperationType } from "@/lib/firestoreErrorHandler";

export default function LeagueDashboard() {
  const params = useParams();
  const leagueId = params.id as string;
  const [league, setLeague] = useState<League | null>(null);

  const toggleRingerBoard = async () => {
    if (!league) return;
    try {
      await updateDoc(doc(db, "leagues", leagueId), { ringerBoard: !league.ringerBoard });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "leagues", leagueId), (doc) => {
      if (doc.exists()) {
        setLeague({ id: doc.id, ...doc.data() } as League);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "leagues/" + leagueId);
    });
    return () => unsub();
  }, [leagueId]);

  if (!league) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <header className="mb-8 flex items-center space-x-4">
        <Link href="/leagues" className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold">{league.name}</h1>
          <p className="text-gray-500">Dashboard</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href={`/leagues/${leagueId}/entries`} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <Users className="w-8 h-8 mb-4 text-gray-700" />
          <h2 className="text-xl font-bold mb-2">League Roster</h2>
          <p className="text-sm text-gray-500">Manage individuals or teams participating in this league.</p>
        </Link>

        <Link href={`/leagues/${leagueId}/rounds`} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <Calendar className="w-8 h-8 mb-4 text-gray-700" />
          <h2 className="text-xl font-bold mb-2">Events & Scores</h2>
          <p className="text-sm text-gray-500">Create weekly rounds, select courses, and enter hole-by-hole scores.</p>
        </Link>

        <Link href={`/leagues/${leagueId}/standings`} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <BarChart2 className="w-8 h-8 mb-4 text-gray-700" />
          <h2 className="text-xl font-bold mb-2">Standings</h2>
          <p className="text-sm text-gray-500">View overall rankings, handicaps, and accumluated points.</p>
        </Link>

        {league.ringerBoard && (
          <Link href={`/leagues/${leagueId}/ringer`} className="bg-white p-6 rounded-xl border border-yellow-200 shadow-sm hover:shadow-md transition-shadow">
            <Target className="w-8 h-8 mb-4 text-yellow-600" />
            <h2 className="text-xl font-bold mb-2">Ringer Board</h2>
            <p className="text-sm text-gray-500">Season-best scores on each hole across all rounds.</p>
          </Link>
        )}
      </div>

      <div className="mt-8 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">League Settings</h2>
        <label className="flex items-center gap-3 cursor-pointer w-fit" onClick={toggleRingerBoard}>
          <div className={`relative w-11 h-6 rounded-full transition-colors ${league.ringerBoard ? 'bg-gray-900' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${league.ringerBoard ? 'translate-x-5' : ''}`} />
          </div>
          <span className="text-sm font-medium text-gray-700">Enable Ringer Board</span>
        </label>
      </div>
    </div>
  );
}
