"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Speaker {
  name: string;
  bio?: string;
  role?: string;
}

interface ScheduleEntry {
  date: string;
  dayName: string;
  startTime: string;
  endTime: string;
  room: string;
  lengthMinutes: number;
  inPerson: boolean;
  virtual: boolean;
  seatsRemaining?: number;
}

interface Session {
  sessionCode: string;
  title: string;
  type: string;
  abstract?: string;
  speakers?: Speaker[];
  schedule?: ScheduleEntry[];
  topic?: string | string[];
  technicalLevel?: string;
  industry?: string;
  intendedAudience?: string;
  viewingExperience?: string;
  language?: string;
  nvidiaTechnology?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DAYS = [
  { date: "2026-03-15", label: "Sun Mar 15" },
  { date: "2026-03-16", label: "Mon Mar 16" },
  { date: "2026-03-17", label: "Tue Mar 17" },
  { date: "2026-03-18", label: "Wed Mar 18" },
  { date: "2026-03-19", label: "Thu Mar 19" },
];

// 8:00 AM to 7:30 PM  => 24 half-hour slots
function buildTimeSlots() {
  const slots: { label: string; hour: number; minute: number }[] = [];
  for (let h = 8; h <= 19; h++) {
    for (const m of [0, 30]) {
      if (h === 19 && m === 30) continue; // stop at 7:30 PM
      const ampm = h >= 12 ? "PM" : "AM";
      const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const mm = m === 0 ? "00" : "30";
      slots.push({ label: `${displayH}:${mm} ${ampm}`, hour: h, minute: m });
    }
  }
  return slots;
}

const TIME_SLOTS = buildTimeSlots();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Parse "08:00 AM" => { hour24, minute } */
function parseTime(t: string): { hour24: number; minute: number } {
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return { hour24: 0, minute: 0 };
  let h = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return { hour24: h, minute: min };
}

/** Which half-hour slot index does this time fall into? */
function slotIndex(hour24: number, minute: number): number {
  const slotH = hour24 - 8; // 8 AM = 0
  const slotM = minute >= 30 ? 1 : 0;
  return slotH * 2 + slotM;
}

/** Normalize topic to string[] */
function getTopics(session: Session): string[] {
  if (!session.topic) return [];
  if (Array.isArray(session.topic)) return session.topic;
  return [session.topic];
}

/** Extract the main (top-level) topic category */
function mainTopic(topic: string): string {
  const idx = topic.indexOf(" - ");
  return idx >= 0 ? topic.substring(0, idx).trim() : topic.trim();
}

/** Get all main topics for a session */
function sessionMainTopics(session: Session): string[] {
  return getTopics(session)
    .map(mainTopic)
    .filter((t) => t.length > 0);
}

/** Cell color based on count */
function cellColor(count: number, maxCount: number): string {
  if (count === 0) return "bg-gray-900/60";
  if (count <= 2) return "bg-blue-900";
  if (count <= 5) return "bg-orange-700";
  return "bg-red-600";
}

function cellTextColor(count: number): string {
  if (count === 0) return "text-gray-700";
  return "text-white";
}

/** Badge color by session type */
function typeBadgeColor(type: string): string {
  const map: Record<string, string> = {
    Talk: "bg-blue-600",
    "Lightning Talk": "bg-cyan-600",
    "Panel Discussion": "bg-purple-600",
    Tutorial: "bg-emerald-600",
    "Full-Day Workshop": "bg-amber-600",
    "Training Lab": "bg-amber-700",
    Keynote: "bg-red-600",
    "Fireside Chat": "bg-rose-600",
    Poster: "bg-teal-600",
    Certification: "bg-indigo-600",
    "Connect with the Experts": "bg-pink-600",
    "Expo Theater": "bg-slate-600",
    "Sponsored Talk": "bg-blue-700",
    "Sponsored Panel": "bg-purple-700",
    "Sponsored Expo Theater": "bg-slate-700",
    Pregame: "bg-yellow-700",
    "Watch Party": "bg-orange-600",
    "Q&A with NVIDIA Experts": "bg-pink-700",
    "Public Special Event": "bg-fuchsia-600",
    "DLI Self-Paced Training": "bg-green-700",
  };
  return map[type] || "bg-gray-600";
}

function levelBadgeColor(level: string): string {
  if (level.includes("Advanced")) return "bg-red-800 text-red-200";
  if (level.includes("Intermediate")) return "bg-amber-800 text-amber-200";
  if (level.includes("Beginner")) return "bg-green-800 text-green-200";
  if (level.includes("Executive")) return "bg-purple-800 text-purple-200";
  return "bg-gray-700 text-gray-300";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function HeatmapExplorer() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [activeTopics, setActiveTopics] = useState<Set<string>>(new Set());
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Fetch data
  useEffect(() => {
    fetch("/data.json")
      .then((r) => r.json())
      .then((d) => {
        setSessions(d.sessions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Derive unique main topics & types
  const allMainTopics = useMemo(() => {
    const s = new Set<string>();
    sessions.forEach((ses) => sessionMainTopics(ses).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [sessions]);

  const allTypes = useMemo(() => {
    const s = new Set<string>();
    sessions.forEach((ses) => {
      if (ses.type) s.add(ses.type);
    });
    return Array.from(s).sort();
  }, [sessions]);

  // Flat list: each (session, scheduleEntry) pair expanded
  const expandedSessions = useMemo(() => {
    const result: { session: Session; sched: ScheduleEntry }[] = [];
    sessions.forEach((ses) => {
      if (ses.schedule) {
        ses.schedule.forEach((sch) => {
          result.push({ session: ses, sched: sch });
        });
      }
    });
    return result;
  }, [sessions]);

  // Filter logic
  const passesFilter = useCallback(
    (ses: Session) => {
      const topicPass =
        activeTopics.size === 0 ||
        sessionMainTopics(ses).some((t) => activeTopics.has(t));
      const typePass = activeTypes.size === 0 || activeTypes.has(ses.type);
      return topicPass && typePass;
    },
    [activeTopics, activeTypes]
  );

  // Build the heatmap grid: dayIndex x slotIndex => count
  const grid = useMemo(() => {
    const g: number[][] = DAYS.map(() => TIME_SLOTS.map(() => 0));
    expandedSessions.forEach(({ session, sched }) => {
      if (!passesFilter(session)) return;
      const dayIdx = DAYS.findIndex((d) => d.date === sched.date);
      if (dayIdx < 0) return;
      const { hour24, minute } = parseTime(sched.startTime);
      const si = slotIndex(hour24, minute);
      if (si >= 0 && si < TIME_SLOTS.length) {
        g[dayIdx][si]++;
      }
    });
    return g;
  }, [expandedSessions, passesFilter]);

  // Max count for color scaling reference
  const maxCount = useMemo(
    () => Math.max(1, ...grid.flat()),
    [grid]
  );

  // Total and filtered counts
  const totalSessionCount = sessions.length;
  const filteredCount = useMemo(
    () => sessions.filter(passesFilter).length,
    [sessions, passesFilter]
  );

  // Sessions for selected cells
  const selectedSessions = useMemo(() => {
    if (selectedCells.size === 0) return [];
    const result: { session: Session; sched: ScheduleEntry; cellKey: string }[] = [];
    expandedSessions.forEach(({ session, sched }) => {
      if (!passesFilter(session)) return;
      const dayIdx = DAYS.findIndex((d) => d.date === sched.date);
      if (dayIdx < 0) return;
      const { hour24, minute } = parseTime(sched.startTime);
      const si = slotIndex(hour24, minute);
      const key = `${dayIdx}-${si}`;
      if (selectedCells.has(key)) {
        result.push({ session, sched, cellKey: key });
      }
    });
    return result;
  }, [selectedCells, expandedSessions, passesFilter]);

  // Cell click handler (multi-select support)
  const handleCellClick = useCallback(
    (dayIdx: number, slotIdx: number, e: React.MouseEvent) => {
      const key = `${dayIdx}-${slotIdx}`;
      setSelectedCells((prev) => {
        const next = new Set(prev);
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          // Multi-select
          if (next.has(key)) next.delete(key);
          else next.add(key);
        } else {
          // Single select toggle
          if (next.has(key) && next.size === 1) {
            next.clear();
          } else {
            next.clear();
            next.add(key);
          }
        }
        return next;
      });
    },
    []
  );

  // Toggle topic filter
  const toggleTopic = (topic: string) => {
    setActiveTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

  // Toggle type filter
  const toggleType = (type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400 text-xl">
        Loading sessions...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* ---- HEADER ---- */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            GTC 2026 — Heatmap Explorer
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {filteredCount === totalSessionCount
              ? `${totalSessionCount} total sessions`
              : `${filteredCount} of ${totalSessionCount} sessions (filtered)`}
            {selectedCells.size > 0 && (
              <span className="ml-3 text-cyan-400">
                {selectedSessions.length} session
                {selectedSessions.length !== 1 ? "s" : ""} in{" "}
                {selectedCells.size} selected cell
                {selectedCells.size !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Legend */}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Density:</span>
            <span className="inline-block w-6 h-4 rounded bg-gray-900/60 border border-gray-700" />
            <span>0</span>
            <span className="inline-block w-6 h-4 rounded bg-blue-900" />
            <span>1-2</span>
            <span className="inline-block w-6 h-4 rounded bg-orange-700" />
            <span>3-5</span>
            <span className="inline-block w-6 h-4 rounded bg-red-600" />
            <span>6+</span>
          </div>
          <button
            onClick={() => setSidebarOpen((p) => !p)}
            className="text-sm px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            {sidebarOpen ? "Hide Filters" : "Show Filters"}
          </button>
        </div>
      </header>

      {/* ---- MAIN AREA ---- */}
      <div className="flex flex-1 overflow-hidden">
        {/* ---- SIDEBAR ---- */}
        {sidebarOpen && (
          <aside className="w-64 border-r border-gray-800 overflow-y-auto flex-shrink-0 p-4 space-y-6">
            {/* Topic Filters */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                  Topics
                </h2>
                {activeTopics.size > 0 && (
                  <button
                    onClick={() => setActiveTopics(new Set())}
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {allMainTopics.map((topic) => (
                  <label
                    key={topic}
                    className="flex items-start gap-2 cursor-pointer text-sm py-0.5 hover:text-white transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={activeTopics.has(topic)}
                      onChange={() => toggleTopic(topic)}
                      className="mt-0.5 accent-cyan-500 rounded"
                    />
                    <span
                      className={
                        activeTopics.has(topic)
                          ? "text-cyan-300"
                          : "text-gray-400"
                      }
                    >
                      {topic}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Type Filters */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                  Session Type
                </h2>
                {activeTypes.size > 0 && (
                  <button
                    onClick={() => setActiveTypes(new Set())}
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {allTypes.map((type) => (
                  <label
                    key={type}
                    className="flex items-start gap-2 cursor-pointer text-sm py-0.5 hover:text-white transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={activeTypes.has(type)}
                      onChange={() => toggleType(type)}
                      className="mt-0.5 accent-cyan-500 rounded"
                    />
                    <span
                      className={
                        activeTypes.has(type)
                          ? "text-cyan-300"
                          : "text-gray-400"
                      }
                    >
                      {type}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Multi-select hint */}
            <div className="text-xs text-gray-600 border-t border-gray-800 pt-4">
              Hold <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">Cmd</kbd> /
              <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400 ml-1">Ctrl</kbd> and
              click cells to multi-select
            </div>
          </aside>
        )}

        {/* ---- CONTENT ---- */}
        <main className="flex-1 overflow-auto p-6 flex flex-col gap-6">
          {/* Heatmap Grid */}
          <div className="overflow-x-auto">
            <table className="border-collapse w-full min-w-[900px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-950 p-2 text-right text-xs text-gray-500 font-normal w-28 min-w-[7rem]">
                    Day / Time
                  </th>
                  {TIME_SLOTS.map((slot, i) => (
                    <th
                      key={i}
                      className="p-0 text-center text-[10px] text-gray-500 font-normal"
                      style={{ minWidth: 44 }}
                    >
                      {slot.minute === 0 ? slot.label.replace(":00", "") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day, dayIdx) => (
                  <tr key={day.date}>
                    <td className="sticky left-0 z-10 bg-gray-950 pr-3 py-1 text-right text-xs text-gray-400 font-medium whitespace-nowrap">
                      {day.label}
                    </td>
                    {TIME_SLOTS.map((_, slotIdx) => {
                      const count = grid[dayIdx][slotIdx];
                      const key = `${dayIdx}-${slotIdx}`;
                      const isSelected = selectedCells.has(key);
                      return (
                        <td key={slotIdx} className="p-0">
                          <button
                            onClick={(e) =>
                              handleCellClick(dayIdx, slotIdx, e)
                            }
                            className={`
                              w-full aspect-square min-w-[40px] min-h-[40px]
                              flex items-center justify-center
                              text-xs font-semibold
                              border border-gray-800
                              transition-all duration-150
                              cursor-pointer
                              ${cellColor(count, maxCount)}
                              ${cellTextColor(count)}
                              ${
                                isSelected
                                  ? "ring-2 ring-cyan-400 ring-inset z-20 scale-105"
                                  : "hover:ring-1 hover:ring-gray-600 hover:ring-inset"
                              }
                            `}
                            title={`${day.label} ${TIME_SLOTS[slotIdx].label}: ${count} session${count !== 1 ? "s" : ""}`}
                          >
                            {count > 0 ? count : ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---- SELECTED SESSIONS PANEL ---- */}
          {selectedCells.size > 0 && (
            <div className="border-t border-gray-800 pt-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-200">
                  {selectedSessions.length} Session
                  {selectedSessions.length !== 1 ? "s" : ""} in Selected Slot
                  {selectedCells.size !== 1 ? "s" : ""}
                </h2>
                <button
                  onClick={() => setSelectedCells(new Set())}
                  className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Clear selection
                </button>
              </div>

              {selectedSessions.length === 0 ? (
                <p className="text-gray-600 text-sm">
                  No sessions match current filters in selected slot(s).
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {selectedSessions.map(({ session, sched }, i) => (
                    <div
                      key={`${session.sessionCode}-${sched.date}-${sched.startTime}-${i}`}
                      className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
                    >
                      {/* Type badge */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded ${typeBadgeColor(session.type)} text-white`}
                        >
                          {session.type}
                        </span>
                        {session.technicalLevel && (
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded ${levelBadgeColor(session.technicalLevel)}`}
                          >
                            {session.technicalLevel}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-semibold text-gray-100 leading-snug mb-2 line-clamp-2">
                        {session.title}
                      </h3>

                      {/* Time & Room */}
                      <div className="text-xs text-gray-400 space-y-0.5 mb-2">
                        <div>
                          {sched.dayName} {sched.date.slice(5)} &middot;{" "}
                          {sched.startTime} &ndash; {sched.endTime}
                        </div>
                        {sched.room && <div>Room: {sched.room}</div>}
                      </div>

                      {/* Speakers */}
                      {session.speakers && session.speakers.length > 0 && (
                        <div className="text-xs text-gray-500 mb-2">
                          {session.speakers
                            .map(
                              (sp) =>
                                sp.name +
                                (sp.role ? ` (${sp.role})` : "")
                            )
                            .join(", ")}
                        </div>
                      )}

                      {/* Topic */}
                      {session.topic && (
                        <div className="text-[11px] text-gray-600 mt-1">
                          {Array.isArray(session.topic)
                            ? session.topic.join(" | ")
                            : session.topic}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state hint */}
          {selectedCells.size === 0 && (
            <div className="text-center text-gray-600 text-sm py-8">
              Click any cell in the heatmap to see sessions at that time slot.
              Use filters on the left to focus on specific topics or session
              types.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
