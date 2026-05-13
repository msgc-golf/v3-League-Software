"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, ArrowLeft, Trash2, Upload, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { handleFirestoreError, OperationType } from "@/lib/firestoreErrorHandler";

interface Player {
  id: string;
  name: string;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "players"), (snapshot) => {
      const p = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      setPlayers(p);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "players");
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await addDoc(collection(db, "players"), { name: newName.trim() });
      setNewName("");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "players");
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    
    // Split by newline or comma
    const names = importText
      .split(/[\n,]+/)
      .map(n => n.trim())
      .filter(n => n.length > 0);
      
    // Deduplicate against existing and within the list
    const existingNames = new Set(players.map(p => p.name.toLowerCase()));
    const namesToAdd = Array.from(new Set(names)).filter(n => !existingNames.has(n.toLowerCase()));

    if (namesToAdd.length === 0) {
      setImportText("");
      setShowImport(false);
      return;
    }

    try {
      setLoading(true);
      const batchPromises = namesToAdd.map(name => addDoc(collection(db, "players"), { name }));
      await Promise.all(batchPromises);
      setImportText("");
      setShowImport(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "players");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this player? They may be linked to league scores.")) {
      try {
        await deleteDoc(doc(db, "players", id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, "players");
      }
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/" className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-3xl font-bold">Master Roster</h1>
        </div>
        <button 
          onClick={() => setShowImport(!showImport)}
          className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg transition-colors font-medium text-sm"
        >
          <Upload className="w-4 h-4" /> <span>Bulk Import</span>
        </button>
      </header>

      {showImport && (
        <div className="mb-8 bg-white p-6 border border-gray-200 rounded-xl shadow-sm">
          <h2 className="text-lg font-bold mb-2">Import Players</h2>
          <p className="text-sm text-gray-500 mb-4">Paste a list of player names, separated by commas or new lines.</p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            className="w-full h-32 border border-gray-300 rounded-lg p-3 mb-4 focus:ring-2 focus:ring-gray-900 focus:outline-none"
            placeholder="Tiger Woods, Phil Mickelson&#10;Rory McIlroy"
          />
          <div className="flex space-x-3">
            <button 
              onClick={handleImport}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              Start Import
            </button>
            <button 
              onClick={() => {
                setShowImport(false);
                setImportText("");
              }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleAdd} className="mb-8 flex space-x-2">
        <input 
          value={newName} 
          onChange={e => setNewName(e.target.value)}
          placeholder="New Player Name"
          className="flex-1 border border-gray-300 px-4 py-2 rounded-lg"
        />
        <button type="submit" className="bg-gray-900 text-white px-4 py-2 rounded-lg flex items-center font-medium hover:bg-gray-800">
          <Plus className="w-5 h-5 mr-2" /> Add Player
        </button>
      </form>

      {loading ? <p>Loading...</p> : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">{players.length} player{players.length !== 1 ? 's' : ''}</span>
            <button
              onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
              className="flex items-center space-x-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === 'asc' ? 'A–Z' : 'Z–A'}</span>
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y">
          {[...players].sort((a, b) => sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)).map(p => (
            <div key={p.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
              <span className="font-medium text-gray-900">{p.name}</span>
              <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-full">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {players.length === 0 && (
            <div className="p-8 text-center text-gray-500">No players in roster.</div>
          )}
        </div>
        </>
      )}
    </div>
  );
}
