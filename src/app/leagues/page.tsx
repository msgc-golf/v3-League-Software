"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, ArrowLeft, Trophy, Trash2, ArrowRight, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { handleFirestoreError, OperationType } from "@/lib/firestoreErrorHandler";

export interface League {
  id: string;
  name: string;
  format: 'best_ball' | 'stroke_play';
}

export default function LeaguesPage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFormat, setNewFormat] = useState<'stroke_play'|'best_ball'>("stroke_play");

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "leagues"), (snapshot) => {
      const ls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as League));
      setLeagues(ls);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "leagues");
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await addDoc(collection(db, "leagues"), { 
        name: newName.trim(),
        format: newFormat
      });
      setNewName("");
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "leagues");
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Delete this league entirely?")) {
      try {
        await deleteDoc(doc(db, "leagues", id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, "leagues");
      }
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <header className="mb-8 flex items-center space-x-4">
        <Link href="/" className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-3xl font-bold">Manage Leagues</h1>
      </header>

      {isAdding ? (
        <form onSubmit={handleAdd} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8">
          <h2 className="text-xl font-semibold mb-4">Create League</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">League Name</label>
              <input 
                required
                value={newName} 
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Wednesday Night Drop-in"
                className="w-full border border-gray-300 px-4 py-2 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scoring Format</label>
              <select 
                value={newFormat}
                onChange={e => setNewFormat(e.target.value as any)}
                className="w-full border border-gray-300 px-4 py-2 rounded-lg"
              >
                <option value="stroke_play">Stroke Play (100% Handicap)</option>
                <option value="best_ball">Best Ball (80% Handicap)</option>
              </select>
            </div>
          </div>
          <div className="mt-6 flex space-x-3">
            <button type="submit" className="bg-gray-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-gray-800">
              Create
            </button>
            <button type="button" onClick={() => setIsAdding(false)} className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg font-medium hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setIsAdding(true)} className="mb-8 bg-gray-900 text-white px-4 py-2 rounded-lg flex items-center font-medium hover:bg-gray-800">
          <Plus className="w-5 h-5 mr-2" /> New League
        </button>
      )}

      {loading ? <p>Loading...</p> : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">{leagues.length} league{leagues.length !== 1 ? 's' : ''}</span>
            <button
              onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
              className="flex items-center space-x-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === 'asc' ? 'A–Z' : 'Z–A'}</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...leagues].sort((a, b) => sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)).map(l => (
            <Link key={l.id} href={`/leagues/${l.id}`} className="block bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:border-gray-400 transition-colors relative group">
              <button 
                onClick={(e) => handleDelete(e, l.id)} 
                className="absolute top-4 right-4 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-50 rounded-full"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="flex items-center space-x-3 mb-2">
                <Trophy className="w-6 h-6 text-gray-500" />
                <h3 className="text-xl font-bold">{l.name}</h3>
              </div>
              <p className="text-sm text-gray-500 mb-4 inline-block bg-gray-100 px-2 py-1 rounded">
                {l.format === 'best_ball' ? 'Best Ball' : 'Stroke Play'}
              </p>
              <div className="flex items-center text-sm font-medium text-blue-600 mt-2">
                Manage League <ArrowRight className="w-4 h-4 ml-1" />
              </div>
            </Link>
          ))}
          {leagues.length === 0 && !isAdding && (
            <div className="col-span-full p-8 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
              No leagues created yet.
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}
