"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Trash2, Plus, ArrowLeft, Save, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { rankHoles } from "@/lib/handicap";
import { handleFirestoreError, OperationType } from "@/lib/firestoreErrorHandler";

interface Course {
  id: string;
  name: string;
  pars: number[];
  handicaps: number[];
  startingHole?: number; // 1 = front nine (default), 10 = back nine
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // New Course State
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPars, setNewPars] = useState<number[]>(Array(9).fill(4));
  const [newHandicaps, setNewHandicaps] = useState<number[]>(Array(9).fill(1));
  const [newIsBackNine, setNewIsBackNine] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "courses"), (snapshot) => {
      const c = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));
      setCourses(c);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "courses");
    });
    return () => unsubscribe();
  }, []);

  const handleAddCourse = async () => {
    if (!newName.trim()) return;
    try {
      await addDoc(collection(db, "courses"), {
        name: newName,
        pars: newPars,
        handicaps: newHandicaps,
        startingHole: newIsBackNine ? 10 : 1,
      });
      setIsAdding(false);
      setNewName("");
      setNewPars(Array(9).fill(4));
      setNewHandicaps(Array(9).fill(1));
      setNewIsBackNine(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "courses");
    }
  };

  const handleToggleNine = async (course: Course) => {
    const next = course.startingHole === 10 ? 1 : 10;
    try {
      await updateDoc(doc(db, "courses", course.id), { startingHole: next });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "courses");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this course?")) {
      try {
        await deleteDoc(doc(db, "courses", id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, "courses");
      }
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <header className="mb-8 flex items-center space-x-4">
        <Link href="/" className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-3xl font-bold">Manage Courses (9 Holes)</h1>
      </header>

      {isAdding ? (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8">
          <h2 className="text-xl font-semibold mb-4">Add New Course Nine</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Course/Nine Name</label>
            <input
              className="w-full border border-gray-300 rounded px-3 py-2"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Front 9, Back 9"
            />
          </div>
          <div className="mb-4">
            <label className="flex items-center gap-3 cursor-pointer w-fit">
              <div
                onClick={() => setNewIsBackNine(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${newIsBackNine ? 'bg-gray-900' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${newIsBackNine ? 'translate-x-5' : ''}`} />
              </div>
              <span className="text-sm font-medium text-gray-700">
                Back Nine — holes numbered 10–18
              </span>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse mb-4">
              <thead>
                <tr>
                  <th className="p-2 border-b">Hole</th>
                  {Array.from({length: 9}).map((_, i) => <th key={i} className="p-2 border-b text-center">{(newIsBackNine ? 10 : 1) + i}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 border-b font-medium">Par</td>
                  {newPars.map((p, i) => (
                    <td key={i} className="p-2 border-b">
                      <input 
                        type="number" 
                        className="w-12 border border-gray-300 rounded px-1 py-1 text-center"
                        value={p}
                        onChange={e => {
                          const cp = [...newPars];
                          cp[i] = Number(e.target.value);
                          setNewPars(cp);
                        }}
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2 border-b font-medium">Handicap Allocation</td>
                  {newHandicaps.map((h, i) => (
                    <td key={i} className="p-2 border-b">
                      <input 
                        type="number" 
                        className="w-12 border border-gray-300 rounded px-1 py-1 text-center"
                        value={h}
                        onChange={e => {
                          const ch = [...newHandicaps];
                          ch[i] = Number(e.target.value);
                          setNewHandicaps(ch);
                        }}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 mb-4">Note: The system will automatically rank the handicaps internally 1-9.</p>
          <div className="flex space-x-3 text-sm">
            <button onClick={handleAddCourse} className="bg-gray-900 text-white px-4 py-2 rounded font-medium flex items-center space-x-2 hover:bg-gray-800">
              <Save className="w-4 h-4" /> <span>Save Course</span>
            </button>
            <button onClick={() => { setIsAdding(false); setNewIsBackNine(false); }} className="bg-gray-200 text-gray-800 px-4 py-2 rounded font-medium hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setIsAdding(true)} className="mb-6 flex items-center space-x-2 bg-gray-900 text-white px-4 py-2 rounded font-medium hover:bg-gray-800 transition-colors">
          <Plus className="w-5 h-5" />
          <span>Add Course</span>
        </button>
      )}

      {loading ? <p>Loading...</p> : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">{courses.length} course{courses.length !== 1 ? 's' : ''}</span>
            <button
              onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
              className="flex items-center space-x-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === 'asc' ? 'A–Z' : 'Z–A'}</span>
            </button>
          </div>
          <div className="space-y-6">
          {[...courses].sort((a, b) => sortOrder === 'asc' ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' })).map(course => {
            const totalPar = course.pars.reduce((a, b) => a + b, 0);
            const rankings = rankHoles(course.handicaps);
            return (
              <div key={course.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative">
                <button onClick={() => handleDelete(course.id)} className="absolute top-4 right-4 text-red-500 hover:bg-red-50 p-2 rounded-full">
                  <Trash2 className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-xl font-bold">{course.name}</h3>
                  <button
                    onClick={() => handleToggleNine(course)}
                    title="Click to toggle front/back nine"
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors ${course.startingHole === 10 ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}
                  >
                    {course.startingHole === 10 ? 'Back 9 (10–18)' : 'Front 9 (1–9)'}
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">Total Par: {totalPar}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2 border-b bg-gray-50">Hole</th>
                        {Array.from({length: 9}).map((_, i) => <th key={i} className="p-2 border-b bg-gray-50 text-center">{(course.startingHole ?? 1) + i}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-2 border-b font-medium">Par</td>
                        {course.pars.map((p, i) => <td key={i} className="p-2 border-b text-center">{p}</td>)}
                      </tr>
                      <tr>
                        <td className="p-2 border-b font-medium">Card HDCP</td>
                        {course.handicaps.map((h, i) => <td key={i} className="p-2 border-b text-center text-gray-500">{h}</td>)}
                      </tr>
                      <tr>
                        <td className="p-2 border-b font-medium">Sys Rank (1-9)</td>
                        {rankings.map((r, i) => <td key={i} className="p-2 border-b text-center text-blue-600 font-semibold">{r}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {courses.length === 0 && !isAdding && (
             <div className="text-center p-12 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
               No courses added yet.
             </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}
