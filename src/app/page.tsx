import Link from "next/link";
import { Trophy, Users, Map } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Dashboard</h1>
          <p className="text-lg text-gray-500 mt-2">Manage your drop-in and team-based golf leagues.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/leagues" className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-all">
          <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mb-6 group-hover:bg-gray-900 group-hover:text-white transition-colors">
            <Trophy className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold mb-2">Leagues</h2>
          <p className="text-gray-500 mb-4">View standings, add scores, and manage players.</p>
        </Link>
        <Link href="/courses" className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-all">
          <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mb-6 group-hover:bg-gray-900 group-hover:text-white transition-colors">
            <Map className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold mb-2">Courses</h2>
          <p className="text-gray-500 mb-4">Manage 9-hole layouts, pars, and handicap allocations.</p>
        </Link>
        <Link href="/players" className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-all">
          <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mb-6 group-hover:bg-gray-900 group-hover:text-white transition-colors">
            <Users className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold mb-2">Master Roster</h2>
          <p className="text-gray-500 mb-4">View all players and standard global handicaps.</p>
        </Link>
      </div>
    </div>
  );
}
