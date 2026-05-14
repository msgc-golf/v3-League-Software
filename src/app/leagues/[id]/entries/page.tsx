"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, ArrowLeft, Trash2, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { handleFirestoreError, OperationType } from "@/lib/firestoreErrorHandler";

interface Player {
  id: string;
  name: string;
}

interface Entry {
  id: string;
  name: string;
  playerIds: string[];
}

export default function LeagueEntriesPage() {
  const params = useParams();
  const leagueId = params.id as string;

  const [entries, setEntries] = useState<Entry[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [isAdding, setIsAdding] = useState(false);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [entryName, setEntryName] = useState("");

  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Bulk add state
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());
  const [bulkSearch, setBulkSearch] = useState("");

  useEffect(() => {
    // Load Master Roster
    const unsubPlayers = onSnapshot(collection(db, "players"), (snap) => {
      setAllPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Player)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "players");
    });

    // Load Entries for this league
    const q = query(collection(db, "entries"), where("leagueId", "==", leagueId));
    const unsubEntries = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as Entry)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "entries");
    });

    return () => { unsubPlayers(); unsubEntries(); };
  }, [leagueId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!p1) return;
    
    let name = entryName;
    if (!name) {
      const p1Name = allPlayers.find(p => p.id === p1)?.name || "Unknown";
      if (p2) {
        const p2Name = allPlayers.find(p => p.id === p2)?.name || "Unknown";
        name = `${p1Name} & ${p2Name}`;
      } else {
        name = p1Name;
      }
    }

    const playerIds = p2 ? [p1, p2] : [p1];

    try {
      await addDoc(collection(db, "entries"), {
        leagueId,
        name,
        playerIds
      });

      setP1("");
      setP2("");
      setEntryName("");
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "entries");
    }
  };

  const handleBulkAdd = async () => {
    if (selectedForBulk.size === 0) return;
    try {
      setLoading(true);
      const promises = Array.from(selectedForBulk).map(playerId => {
        const p = allPlayers.find(pl => pl.id === playerId);
        if (!p) return Promise.resolve();
        return addDoc(collection(db, "entries"), {
          leagueId,
          name: p.name,
          playerIds: [p.id]
        });
      });
      await Promise.all(promises);
      setSelectedForBulk(new Set());
      setIsBulkAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "entries");
    } finally {
      setLoading(false);
    }
  };

  const toggleBulkSelect = (id: string) => {
    const next = new Set(selectedForBulk);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedForBulk(next);
  };

  const playersInLeague = new Set(entries.flatMap(e => e.playerIds));
  const availablePlayers = allPlayers
    .filter(p => !playersInLeague.has(p.id))
    .filter(p => p.name.toLowerCase().includes(bulkSearch.toLowerCase()))
    .sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const handleDelete = async (id: string) => {
    if(confirm("Remove this entry from the league?")) {
      try {
        await deleteDoc(doc(db, "entries", id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, "entries");
      }
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <header className="mb-8 flex items-center space-x-4">
        <Link href={`/leagues/${leagueId}`} className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-3xl font-bold">League Roster</h1>
      </header>

      {isAdding ? (
        <form onSubmit={handleAdd} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8 space-y-4">
          <h2 className="text-xl font-semibold">Add Individual or Team</h2>
          
          <div>
            <label className="block text-sm font-medium mb-1">Player 1 (Required)</label>
            <select required value={p1} onChange={e => setP1(e.target.value)} className="w-full border border-gray-300 p-2 rounded">
              <option value="">Select a player</option>
              {allPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Player 2 (Optional, for 2-man teams)</label>
            <select value={p2} onChange={e => setP2(e.target.value)} className="w-full border border-gray-300 p-2 rounded">
              <option value="">None</option>
              {allPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Team Name (Optional, defaults to names)</label>
            <input 
              value={entryName} 
              onChange={e => setEntryName(e.target.value)} 
              placeholder="e.g. The Bogey Boys" 
              className="w-full border border-gray-300 p-2 rounded"
            />
          </div>

          <div className="flex space-x-3 pt-2">
            <button type="submit" className="bg-gray-900 text-white px-4 py-2 rounded font-medium">Add Entry</button>
            <button type="button" onClick={() => setIsAdding(false)} className="bg-gray-200 px-4 py-2 rounded font-medium">Cancel</button>
          </div>
        </form>
      ) : isBulkAdding ? (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Add Multiple Players</h2>
            <button type="button" onClick={() => {
              if (selectedForBulk.size === availablePlayers.length && availablePlayers.length > 0) {
                setSelectedForBulk(new Set());
              } else {
                setSelectedForBulk(new Set(availablePlayers.map(p => p.id)));
              }
            }} className="text-sm font-medium text-blue-600 hover:text-blue-800">
              {selectedForBulk.size === availablePlayers.length && availablePlayers.length > 0 ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div>
            <input 
              type="text" 
              placeholder="Search players..."
              value={bulkSearch}
              onChange={e => setBulkSearch(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 rounded mb-4"
            />
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded divide-y">
              {availablePlayers.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">No players available to add.</div>
              ) : (
                availablePlayers.map(p => (
                  <label key={p.id} className="flex items-center space-x-3 p-3 hover:bg-gray-50 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={selectedForBulk.has(p.id)}
                      onChange={() => toggleBulkSelect(p.id)}
                      className="w-4 h-4 rounded text-gray-900"
                    />
                    <span className="font-medium">{p.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="flex space-x-3 pt-2">
            <button onClick={handleBulkAdd} disabled={selectedForBulk.size === 0} className="bg-gray-900 text-white px-4 py-2 rounded font-medium disabled:opacity-50">
              Add Selected ({selectedForBulk.size})
            </button>
            <button type="button" onClick={() => { setIsBulkAdding(false); setSelectedForBulk(new Set()); }} className="bg-gray-200 px-4 py-2 rounded font-medium">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-8 flex space-x-3">
          <button onClick={() => setIsAdding(true)} className="flex items-center space-x-2 bg-gray-900 text-white px-4 py-2 rounded hover:bg-gray-800">
            <Plus className="w-5 h-5" />
            <span>Add Single Entry</span>
          </button>
          <button onClick={() => setIsBulkAdding(true)} className="flex items-center space-x-2 bg-gray-100 text-gray-800 border border-gray-200 px-4 py-2 rounded hover:bg-gray-200">
            <Plus className="w-5 h-5" />
            <span>Bulk Add Individuals</span>
          </button>
        </div>
      )}

      {loading ? <p>Loading...</p> : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">{entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}</span>
            <button
              onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
              className="flex items-center space-x-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === 'asc' ? 'A–Z' : 'Z–A'}</span>
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y">
          {[...entries].sort((a, b) => sortOrder === 'asc' ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : b.name.localeCompare(a.name)).map(e => (
            <div key={e.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between hover:bg-gray-50">
              <div>
                <span className="font-bold text-lg block">{e.name}</span>
                <span className="text-gray-500 text-sm">
                  {e.playerIds.length === 1 ? "Individual Entry" : "2-Person Team"}
                </span>
              </div>
              <button onClick={() => handleDelete(e.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-full self-start md:self-auto mt-2 md:mt-0">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
          {entries.length === 0 && !isAdding && (
            <div className="p-8 text-center text-gray-500">No one has been added to this league yet.</div>
          )}
        </div>
        </>
      )}
    </div>
  );
}
