"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Speaker {
  name: string;
  bio?: string;
  role?: string;
}

interface Schedule {
  date: string;
  dayName: string;
  startTime: string;
  endTime: string;
  room: string;
  utcStartTime: string;
  utcEndTime: string;
  lengthMinutes: number;
  inPerson: boolean;
  virtual: boolean;
  seatsRemaining: number;
}

interface Session {
  sessionCode: string;
  title: string;
  type: string;
  abstract: string;
  speakers?: Speaker[];
  schedule?: Schedule[];
  topic?: string | string[];
  technicalLevel?: string;
  industry?: string;
  intendedAudience?: string;
  viewingExperience?: string;
  language?: string;
  nvidiaTechnology?: string;
}

interface DataFile {
  event: string;
  sessions: Session[];
}

/* Flattened: one entry per session x schedule slot */
interface TimelineEntry {
  session: Session;
  schedule: Schedule;
  mainTopic: string;
  startHour: number; // fractional hours from midnight
  durationHours: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAIN_DAYS = [
  { date: "2026-03-16", label: "Mon Mar 16" },
  { date: "2026-03-17", label: "Tue Mar 17" },
  { date: "2026-03-18", label: "Wed Mar 18" },
  { date: "2026-03-19", label: "Thu Mar 19" },
];

const HOUR_START = 8; // 8 AM
const HOUR_END = 21; // 9 PM (exclusive display, shows up to 8 PM label)
const HOUR_WIDTH = 180; // px per hour
const ROW_HEIGHT = 44; // px per swim-lane row
const ROW_GAP = 4;
const TIMELINE_PADDING_LEFT = 72;

const TOPIC_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  "Agentic AI / Generative AI": { bg: "#7c3aed22", border: "#a78bfa", text: "#c4b5fd", glow: "#7c3aed" },
  "Data Center / Cloud": { bg: "#0ea5e922", border: "#38bdf8", text: "#7dd3fc", glow: "#0ea5e9" },
  "Developer Tools & Techniques": { bg: "#10b98122", border: "#34d399", text: "#6ee7b7", glow: "#10b981" },
  Robotics: { bg: "#f9731622", border: "#fb923c", text: "#fdba74", glow: "#f97316" },
  "Data Science": { bg: "#ec489922", border: "#f472b6", text: "#f9a8d4", glow: "#ec4899" },
  "Simulation / Modeling / Design": { bg: "#eab30822", border: "#fbbf24", text: "#fde68a", glow: "#eab308" },
  "Computer Vision / Video Analytics": { bg: "#14b8a622", border: "#2dd4bf", text: "#5eead4", glow: "#14b8a6" },
  "Networking / Communications": { bg: "#6366f122", border: "#818cf8", text: "#a5b4fc", glow: "#6366f1" },
  "Content Creation / Rendering": { bg: "#d946ef22", border: "#e879f9", text: "#f0abfc", glow: "#d946ef" },
  MLOps: { bg: "#06b6d422", border: "#22d3ee", text: "#67e8f9", glow: "#06b6d4" },
  "AR / VR": { bg: "#f4364622", border: "#f87171", text: "#fca5a5", glow: "#ef4444" },
  "Edge Computing": { bg: "#84cc1622", border: "#a3e635", text: "#bef264", glow: "#84cc16" },
  "Trustworthy AI / Cybersecurity": { bg: "#8b5cf622", border: "#a78bfa", text: "#c4b5fd", glow: "#8b5cf6" },
};

const DEFAULT_COLOR = { bg: "#52525b22", border: "#a1a1aa", text: "#d4d4d8", glow: "#71717a" };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getMainTopic(topic: string | string[] | undefined): string {
  if (!topic) return "Other";
  const raw = Array.isArray(topic) ? topic[0] : topic;
  if (!raw) return "Other";
  return raw.includes(" - ") ? raw.split(" - ")[0].trim() : raw.trim();
}

function parseTime(t: string): number {
  // "08:30 AM" => 8.5
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h + min / 60;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function colorFor(topic: string) {
  return TOPIC_COLORS[topic] ?? DEFAULT_COLOR;
}

/* ------------------------------------------------------------------ */
/*  Build swim-lane rows (greedy packing)                              */
/* ------------------------------------------------------------------ */

function assignRows(entries: TimelineEntry[]): { entry: TimelineEntry; row: number }[] {
  // Sort by start hour then by shorter duration first
  const sorted = [...entries].sort((a, b) => a.startHour - b.startHour || a.durationHours - b.durationHours);
  const rows: number[] = []; // each stores the end-hour of the last item placed in that row
  const result: { entry: TimelineEntry; row: number }[] = [];

  for (const entry of sorted) {
    let placed = false;
    for (let r = 0; r < rows.length; r++) {
      if (entry.startHour >= rows[r]) {
        rows[r] = entry.startHour + entry.durationHours;
        result.push({ entry, row: r });
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push(entry.startHour + entry.durationHours);
      result.push({ entry, row: rows.length - 1 });
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Density calculation (sessions overlapping each 15-min bucket)      */
/* ------------------------------------------------------------------ */

function computeDensity(entries: TimelineEntry[]): number[] {
  const buckets = (HOUR_END - HOUR_START) * 4; // 15-min buckets
  const density = new Array(buckets).fill(0);
  for (const e of entries) {
    const startBucket = Math.max(0, Math.floor((e.startHour - HOUR_START) * 4));
    const endBucket = Math.min(buckets, Math.ceil((e.startHour + e.durationHours - HOUR_START) * 4));
    for (let b = startBucket; b < endBucket; b++) {
      density[b]++;
    }
  }
  return density;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function TimelineRiverPage() {
  const [data, setData] = useState<DataFile | null>(null);
  const [selectedDay, setSelectedDay] = useState(MAIN_DAYS[1].date); // Tue is busiest
  const [schedule, setSchedule] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Fetch data */
  useEffect(() => {
    fetch("/data.json")
      .then((r) => r.json())
      .then((d: DataFile) => setData(d));
  }, []);

  /* Build timeline entries for selected day */
  const entries = useMemo<TimelineEntry[]>(() => {
    if (!data) return [];
    const result: TimelineEntry[] = [];
    for (const session of data.sessions) {
      if (!session.schedule) continue;
      for (const sch of session.schedule) {
        if (sch.date !== selectedDay) continue;
        const startHour = parseTime(sch.startTime);
        const durationHours = sch.lengthMinutes / 60;
        // Only include sessions that overlap with our visible window
        if (startHour + durationHours <= HOUR_START || startHour >= HOUR_END) continue;
        result.push({
          session,
          schedule: sch,
          mainTopic: getMainTopic(session.topic),
          startHour,
          durationHours,
        });
      }
    }
    return result;
  }, [data, selectedDay]);

  const rowAssignments = useMemo(() => assignRows(entries), [entries]);
  const maxRow = useMemo(() => Math.max(0, ...rowAssignments.map((r) => r.row)), [rowAssignments]);
  const density = useMemo(() => computeDensity(entries), [entries]);
  const maxDensity = useMemo(() => Math.max(1, ...density), [density]);

  /* All sessions added to schedule (across all days) */
  const scheduledSessions = useMemo(() => {
    if (!data) return [];
    return data.sessions.filter((s) => schedule.has(s.sessionCode));
  }, [data, schedule]);

  const toggleSchedule = useCallback((code: string) => {
    setSchedule((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  /* Hovered entry data */
  const hoveredEntry = useMemo(() => {
    if (!hoveredId) return null;
    return rowAssignments.find((r) => r.entry.session.sessionCode + "_" + r.entry.schedule.utcStartTime === hoveredId) ?? null;
  }, [hoveredId, rowAssignments]);

  const timelineWidth = (HOUR_END - HOUR_START) * HOUR_WIDTH + TIMELINE_PADDING_LEFT + 40;
  const riverHeight = (maxRow + 1) * (ROW_HEIGHT + ROW_GAP) + 24;

  /* Unique topics present today for legend */
  const todayTopics = useMemo(() => {
    const s = new Set<string>();
    entries.forEach((e) => s.add(e.mainTopic));
    return Array.from(s).sort();
  }, [entries]);

  /* ---------------------------------------------------------------- */

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0b0e17" }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "#7c3aed", borderTopColor: "transparent" }}
          />
          <p className="text-sm tracking-widest uppercase" style={{ color: "#a1a1aa" }}>
            Loading GTC 2026 sessions...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0b0e17", color: "#e4e4e7" }}>
      {/* -------- Header -------- */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 border-b"
        style={{
          background: "linear-gradient(180deg, #0f1220 0%, #0b0e17 100%)",
          borderColor: "#1e1e2e",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "#76b900" }}>
            GTC 2026
          </h1>
          <span className="text-xs uppercase tracking-widest" style={{ color: "#71717a" }}>
            Timeline River
          </span>
        </div>
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
          style={{
            background: schedule.size > 0 ? "#76b90018" : "#27272a",
            border: `1px solid ${schedule.size > 0 ? "#76b900" : "#3f3f46"}`,
            color: schedule.size > 0 ? "#76b900" : "#a1a1aa",
          }}
        >
          <span style={{ fontSize: 16 }}>{sidebarOpen ? "✕" : "★"}</span>
          My Schedule ({schedule.size})
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* -------- Main area -------- */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Day tabs */}
          <nav className="flex gap-1 px-6 pt-4 pb-2">
            {MAIN_DAYS.map((d) => {
              const active = d.date === selectedDay;
              const count = entries.length;
              const dayCount = data.sessions.filter((s) => s.schedule?.some((sc) => sc.date === d.date)).length;
              return (
                <button
                  key={d.date}
                  onClick={() => setSelectedDay(d.date)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: active
                      ? "linear-gradient(135deg, #76b90022, #76b90011)"
                      : "transparent",
                    border: `1px solid ${active ? "#76b900" : "#27272a"}`,
                    color: active ? "#76b900" : "#71717a",
                    boxShadow: active ? "0 0 20px #76b90015" : "none",
                  }}
                >
                  {d.label}
                  <span
                    className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      background: active ? "#76b90022" : "#27272a",
                      color: active ? "#a3e635" : "#52525b",
                    }}
                  >
                    {dayCount}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-6 pb-3">
            {todayTopics.map((t) => {
              const c = colorFor(t);
              return (
                <div key={t} className="flex items-center gap-1.5 text-xs" style={{ color: c.text }}>
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{ background: c.border, boxShadow: `0 0 6px ${c.glow}55` }}
                  />
                  {t}
                </div>
              );
            })}
          </div>

          {/* Timeline scroll area */}
          <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto px-6 pb-6 relative">
            <div style={{ width: timelineWidth, minHeight: riverHeight + 60, position: "relative" }}>
              {/* Hour markers */}
              <div className="sticky top-0 z-20" style={{ height: 32, background: "#0b0e17ee" }}>
                {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => {
                  const hour = HOUR_START + i;
                  const label =
                    hour === 0
                      ? "12 AM"
                      : hour < 12
                      ? `${hour} AM`
                      : hour === 12
                      ? "12 PM"
                      : `${hour - 12} PM`;
                  return (
                    <div
                      key={hour}
                      className="absolute text-xs font-mono"
                      style={{
                        left: TIMELINE_PADDING_LEFT + i * HOUR_WIDTH,
                        top: 8,
                        color: "#52525b",
                        width: HOUR_WIDTH,
                      }}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>

              {/* River bed: density background */}
              <div
                className="absolute"
                style={{
                  top: 32,
                  left: TIMELINE_PADDING_LEFT,
                  width: (HOUR_END - HOUR_START) * HOUR_WIDTH,
                  height: riverHeight,
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {/* Density gradient blocks (each 15-min bucket) */}
                {density.map((d, i) => {
                  const opacity = 0.03 + (d / maxDensity) * 0.18;
                  return (
                    <div
                      key={i}
                      className="absolute"
                      style={{
                        left: i * (HOUR_WIDTH / 4),
                        top: 0,
                        width: HOUR_WIDTH / 4 + 1,
                        height: "100%",
                        background: `rgba(118, 185, 0, ${opacity})`,
                        transition: "background 0.4s ease",
                      }}
                    />
                  );
                })}
                {/* Vertical hour gridlines */}
                {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute"
                    style={{
                      left: i * HOUR_WIDTH,
                      top: 0,
                      width: 1,
                      height: "100%",
                      background: i === 0 || i === HOUR_END - HOUR_START ? "#27272a" : "#1a1a2e",
                    }}
                  />
                ))}
              </div>

              {/* Session stones */}
              {rowAssignments.map(({ entry, row }) => {
                const { session, schedule: sch, mainTopic, startHour, durationHours } = entry;
                const c = colorFor(mainTopic);
                const left = TIMELINE_PADDING_LEFT + (Math.max(startHour, HOUR_START) - HOUR_START) * HOUR_WIDTH;
                const effectiveStart = Math.max(startHour, HOUR_START);
                const effectiveEnd = Math.min(startHour + durationHours, HOUR_END);
                const width = Math.max(40, (effectiveEnd - effectiveStart) * HOUR_WIDTH - 4);
                const top = 32 + row * (ROW_HEIGHT + ROW_GAP) + 4;
                const entryId = session.sessionCode + "_" + sch.utcStartTime;
                const isScheduled = schedule.has(session.sessionCode);
                const isHovered = hoveredId === entryId;

                return (
                  <div
                    key={entryId}
                    className="absolute cursor-pointer group"
                    style={{
                      left,
                      top,
                      width,
                      height: ROW_HEIGHT,
                      borderRadius: 8,
                      background: isHovered
                        ? c.bg.replace("22", "44")
                        : c.bg,
                      border: `1px solid ${isHovered ? c.border : c.border + "66"}`,
                      boxShadow: isHovered
                        ? `0 0 20px ${c.glow}33, inset 0 0 20px ${c.glow}11`
                        : isScheduled
                        ? `0 0 12px ${c.glow}22`
                        : "none",
                      transition: "all 0.2s ease",
                      zIndex: isHovered ? 15 : 10,
                      overflow: "hidden",
                    }}
                    onClick={() => toggleSchedule(session.sessionCode)}
                    onMouseEnter={(e) => {
                      setHoveredId(entryId);
                      const rect = scrollRef.current?.getBoundingClientRect();
                      if (rect) {
                        setHoverPos({
                          x: e.clientX - rect.left + scrollRef.current!.scrollLeft,
                          y: e.clientY - rect.top + scrollRef.current!.scrollTop,
                        });
                      }
                    }}
                    onMouseMove={(e) => {
                      const rect = scrollRef.current?.getBoundingClientRect();
                      if (rect) {
                        setHoverPos({
                          x: e.clientX - rect.left + scrollRef.current!.scrollLeft,
                          y: e.clientY - rect.top + scrollRef.current!.scrollTop,
                        });
                      }
                    }}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {/* Neon top accent line */}
                    <div
                      className="absolute top-0 left-0 right-0"
                      style={{
                        height: 2,
                        background: `linear-gradient(90deg, transparent, ${c.border}, transparent)`,
                        opacity: isHovered ? 1 : 0.4,
                        transition: "opacity 0.2s ease",
                      }}
                    />
                    <div className="flex items-center h-full px-2 gap-1.5" style={{ minWidth: 0 }}>
                      {isScheduled && (
                        <span
                          className="flex-shrink-0 text-sm"
                          style={{
                            color: "#facc15",
                            filter: "drop-shadow(0 0 4px #facc15aa)",
                          }}
                        >
                          ★
                        </span>
                      )}
                      <span
                        className="truncate text-xs font-medium"
                        style={{ color: c.text, lineHeight: "1.2" }}
                      >
                        {session.title}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Hover tooltip */}
              {hoveredEntry && (
                <div
                  className="absolute z-30 pointer-events-none"
                  style={{
                    left: Math.min(hoverPos.x + 16, timelineWidth - 380),
                    top: hoverPos.y + 16,
                    width: 360,
                  }}
                >
                  <div
                    className="rounded-xl p-4 shadow-2xl"
                    style={{
                      background: "linear-gradient(135deg, #1a1a2e 0%, #16162a 100%)",
                      border: `1px solid ${colorFor(hoveredEntry.entry.mainTopic).border}44`,
                      boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 24px ${colorFor(hoveredEntry.entry.mainTopic).glow}15`,
                    }}
                  >
                    {/* Topic badge */}
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{
                          background: colorFor(hoveredEntry.entry.mainTopic).border,
                          boxShadow: `0 0 8px ${colorFor(hoveredEntry.entry.mainTopic).glow}`,
                        }}
                      />
                      <span className="text-xs" style={{ color: colorFor(hoveredEntry.entry.mainTopic).text }}>
                        {hoveredEntry.entry.mainTopic}
                      </span>
                      <span className="text-xs ml-auto" style={{ color: "#52525b" }}>
                        {hoveredEntry.entry.session.sessionCode}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-semibold mb-2" style={{ color: "#f4f4f5", lineHeight: 1.4 }}>
                      {hoveredEntry.entry.session.title}
                    </h3>

                    {/* Meta row */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-xs" style={{ color: "#a1a1aa" }}>
                      <span>
                        {hoveredEntry.entry.schedule.startTime} - {hoveredEntry.entry.schedule.endTime}
                      </span>
                      <span>{hoveredEntry.entry.schedule.lengthMinutes} min</span>
                      {hoveredEntry.entry.schedule.room && (
                        <span className="truncate" style={{ maxWidth: 200 }}>
                          {hoveredEntry.entry.schedule.room}
                        </span>
                      )}
                    </div>

                    {/* Speakers */}
                    {hoveredEntry.entry.session.speakers && hoveredEntry.entry.session.speakers.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs" style={{ color: "#76b900" }}>
                          {hoveredEntry.entry.session.speakers.map((s) => s.name).join(", ")}
                        </p>
                      </div>
                    )}

                    {/* Abstract preview */}
                    {hoveredEntry.entry.session.abstract && (
                      <p
                        className="text-xs leading-relaxed"
                        style={{
                          color: "#71717a",
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {stripHtml(hoveredEntry.entry.session.abstract).slice(0, 250)}
                        {stripHtml(hoveredEntry.entry.session.abstract).length > 250 ? "..." : ""}
                      </p>
                    )}

                    {/* Click hint */}
                    <div className="mt-3 pt-2 border-t flex items-center justify-between" style={{ borderColor: "#27272a" }}>
                      <span className="text-xs" style={{ color: "#52525b" }}>
                        Click to {schedule.has(hoveredEntry.entry.session.sessionCode) ? "remove from" : "add to"} schedule
                      </span>
                      {schedule.has(hoveredEntry.entry.session.sessionCode) && (
                        <span className="text-xs" style={{ color: "#facc15" }}>★ Scheduled</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* -------- Sidebar: My Schedule -------- */}
        <aside
          className="flex-shrink-0 overflow-y-auto border-l transition-all duration-300"
          style={{
            width: sidebarOpen ? 320 : 0,
            opacity: sidebarOpen ? 1 : 0,
            borderColor: "#1e1e2e",
            background: "linear-gradient(180deg, #0f1220 0%, #0b0e17 100%)",
          }}
        >
          {sidebarOpen && (
            <div className="p-4">
              <h2 className="text-sm font-bold tracking-wider uppercase mb-4" style={{ color: "#76b900" }}>
                My Schedule
              </h2>
              {scheduledSessions.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-3xl mb-3" style={{ opacity: 0.3 }}>★</p>
                  <p className="text-xs" style={{ color: "#52525b" }}>
                    Click sessions on the timeline to add them here
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {scheduledSessions.map((s) => {
                    const mt = getMainTopic(s.topic);
                    const c = colorFor(mt);
                    return (
                      <div
                        key={s.sessionCode}
                        className="rounded-lg p-3 group cursor-pointer transition-all"
                        style={{
                          background: c.bg,
                          border: `1px solid ${c.border}33`,
                        }}
                        onClick={() => toggleSchedule(s.sessionCode)}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className="flex-shrink-0 text-sm mt-0.5"
                            style={{
                              color: "#facc15",
                              filter: "drop-shadow(0 0 3px #facc15aa)",
                            }}
                          >
                            ★
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate" style={{ color: c.text }}>
                              {s.title}
                            </p>
                            {s.schedule && s.schedule.length > 0 && (
                              <div className="flex flex-wrap gap-x-2 mt-1">
                                {s.schedule.map((sch, i) => (
                                  <span key={i} className="text-xs" style={{ color: "#52525b" }}>
                                    {sch.dayName.slice(0, 3)} {sch.startTime}
                                  </span>
                                ))}
                              </div>
                            )}
                            <p className="text-xs mt-1" style={{ color: "#3f3f46" }}>
                              {mt}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* -------- Bottom stats bar -------- */}
      <footer
        className="flex items-center justify-between px-6 py-2 border-t text-xs"
        style={{ borderColor: "#1e1e2e", color: "#3f3f46", background: "#0b0e17" }}
      >
        <span>
          {entries.length} sessions visible &middot; {maxRow + 1} concurrent lanes &middot;{" "}
          peak density: {Math.max(...density)} sessions
        </span>
        <span>NVIDIA GTC 2026 &middot; San Jose, CA</span>
      </footer>
    </div>
  );
}
