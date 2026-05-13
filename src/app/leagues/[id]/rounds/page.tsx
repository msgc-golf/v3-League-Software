"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, ArrowLeft, Trash2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { handleFirestoreError, OperationType } from "@/lib/firestoreErrorHandler";

interface Course {
  id: string;
  name: string;
}

export interface Round {
  id: string;
  leagueId: string;
  date: string;
  courseId: string;
}

export default function LeagueRoundsPage() {
  const params = useParams();
  const leagueId = params.id as string;

  const [rounds, setRounds] = useState<Round[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [isAdding, setIsAdding] = useState(false);
  const [date, setDate] = useState("");
  const [courseId, setCourseId] = useState("");

  useEffect(() => {
    const unsubCourses = onSnapshot(collection(db, "courses"), (snap) => {
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "courses");
    });

    const q = query(collection(db, "rounds"), where("leagueId", "==", leagueId));
    const unsubRounds = onSnapshot(q, (snap) => {
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Round));
      // Sort in JS instead of index
      recs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRounds(recs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "rounds");
    });

    return () => { unsubCourses(); unsubRounds(); };
  }, [leagueId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !courseId) return;

    try {
      await addDoc(collection(db, "rounds"), {
        leagueId,
        date,
        courseId
      });

      setDate("");
      setCourseId("");
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "rounds");
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if(confirm("Delete this round? Scores entered for it will be orphaned.")) {
      try {
        await deleteDoc(doc(db, "rounds", id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, "rounds");
      }
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <header className="mb-8 flex items-center space-x-4">
        <Link href={`/leagues/${leagueId}`} className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-3xl font-bold">Rounds & Scores</h1>
      </header>

      {isAdding ? (
        <form onSubmit={handleAdd} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8 space-y-4">
          <h2 className="text-xl font-semibold">Schedule New Round</h2>
          
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input 
              type="date"
              required 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="w-full border border-gray-300 p-2 rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Select Course / Nine</label>
            <select required value={courseId} onChange={e => setCourseId(e.target.value)} className="w-full border border-gray-300 p-2 rounded">
              <option value="">-- Choose a Course --</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex space-x-3 pt-2">
            <button type="submit" className="bg-gray-900 text-white px-4 py-2 rounded font-medium">Create Round</button>
            <button type="button" onClick={() => setIsAdding(false)} className="bg-gray-200 px-4 py-2 rounded font-medium">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setIsAdding(true)} className="mb-8 flex items-center space-x-2 bg-gray-900 text-white px-4 py-2 rounded hover:bg-gray-800">
          <Plus className="w-5 h-5" />
          <span>Add Round</span>
        </button>
      )}

      {loading ? <p>Loading...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rounds.map(r => {
            const cName = courses.find(c => c.id === r.courseId)?.name || 'Unknown Course';
            return (
              <Link key={r.id} href={`/leagues/${leagueId}/rounds/${r.id}`} className="block bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:border-gray-400 transition-colors relative group">
                <button 
                  onClick={(e) => handleDelete(e, r.id)} 
                  className="absolute top-4 right-4 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-50 rounded-full"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="mb-2 text-sm font-semibold text-gray-500">
                  {r.date}
                </div>
                <h3 className="text-xl font-bold mb-4">{cName}</h3>
                <div className="flex items-center text-sm font-medium text-blue-600">
                  Enter / View Scores <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </Link>
            )
          })}
          {rounds.length === 0 && !isAdding && (
            <div className="col-span-full p-8 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
              No rounds scheduled yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
