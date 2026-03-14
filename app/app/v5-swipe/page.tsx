"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ──────────────────────────── types ──────────────────────────── */

interface ScheduleSlot {
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

interface Speaker {
  name: string;
  bio: string;
  role: string;
}

interface Session {
  sessionCode: string;
  title: string;
  type: string;
  abstract: string;
  speakers?: Speaker[];
  schedule?: ScheduleSlot[];
  topic: string | string[] | null;
  technicalLevel: string | null;
  industry: string;
  intendedAudience: string;
  viewingExperience: string;
  language: string;
  nvidiaTechnology?: string;
}

/* ──────────────────────────── constants ──────────────────────── */

const TOPIC_CATEGORIES = [
  "Agentic AI / Generative AI",
  "AR / VR",
  "Computer Vision / Video Analytics",
  "Content Creation / Rendering",
  "Data Center / Cloud",
  "Data Science",
  "Developer Tools & Techniques",
  "Edge Computing",
  "MLOps",
  "Networking / Communications",
  "Robotics",
  "Simulation / Modeling / Design",
  "Trustworthy AI / Cybersecurity",
];

const TYPE_COLORS: Record<string, string> = {
  Talk: "bg-blue-500",
  Keynote: "bg-purple-600",
  "Panel Discussion": "bg-teal-500",
  Tutorial: "bg-orange-500",
  "Lightning Talk": "bg-yellow-500 text-gray-900",
  "Full-Day Workshop": "bg-red-500",
  "Training Lab": "bg-pink-500",
  Poster: "bg-gray-500",
  "Fireside Chat": "bg-amber-600",
  Certification: "bg-emerald-600",
  "Connect with the Experts": "bg-cyan-600",
  "DLI Self-Paced Training": "bg-indigo-500",
  "Expo Theater": "bg-violet-500",
  "Sponsored Expo Theater": "bg-violet-400",
  "Sponsored Talk": "bg-blue-400",
  "Sponsored Panel": "bg-teal-400",
  "Q&A with NVIDIA Experts": "bg-lime-600",
  "Watch Party": "bg-rose-500",
  Pregame: "bg-fuchsia-500",
  "Public Special Event": "bg-sky-500",
};

const LEVEL_COLORS: Record<string, string> = {
  "Technical - Beginner": "border-green-400 text-green-300",
  "Technical - Intermediate": "border-yellow-400 text-yellow-300",
  "Technical - Advanced": "border-red-400 text-red-300",
  "Business / Executive": "border-blue-400 text-blue-300",
  "General Interest": "border-gray-400 text-gray-300",
};

const CARD_GRADIENTS = [
  "from-slate-900 via-slate-800 to-slate-900",
  "from-gray-900 via-zinc-800 to-gray-900",
  "from-neutral-900 via-stone-800 to-neutral-900",
];

/* ──────────────────────────── helpers ────────────────────────── */

function getTopicCategory(topic: string | string[] | null): string {
  if (!topic) return "Other";
  const t = Array.isArray(topic) ? topic[0] : topic;
  return t.split(" - ")[0];
}

function getSubtopic(topic: string | string[] | null): string {
  if (!topic) return "";
  const t = Array.isArray(topic) ? topic[0] : topic;
  const parts = t.split(" - ");
  return parts.length > 1 ? parts.slice(1).join(" - ") : "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slotsOverlap(a: ScheduleSlot, b: ScheduleSlot): boolean {
  const aStart = new Date(a.utcStartTime.replace(/\//g, "-")).getTime();
  const aEnd = new Date(a.utcEndTime.replace(/\//g, "-")).getTime();
  const bStart = new Date(b.utcStartTime.replace(/\//g, "-")).getTime();
  const bEnd = new Date(b.utcEndTime.replace(/\//g, "-")).getTime();
  return aStart < bEnd && bStart < aEnd;
}

function hasConflict(session: Session, accepted: Session[]): ScheduleSlot | null {
  if (!session.schedule) return null;
  for (const slot of session.schedule) {
    for (const acc of accepted) {
      if (!acc.schedule) continue;
      for (const accSlot of acc.schedule) {
        if (slotsOverlap(slot, accSlot)) return accSlot;
      }
    }
  }
  return null;
}

/* ──────────────────────────── confetti ───────────────────────── */

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  rotation: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
}

function ConfettiEffect({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const frameRef = useRef<number>(0);
  const counterRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const colors = [
      "#FF6B6B", "#FFE66D", "#4ECDC4", "#45B7D1", "#96CEB4",
      "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE",
    ];
    const newParticles: Particle[] = Array.from({ length: 40 }, (_, i) => ({
      id: counterRef.current++,
      x: 50 + (Math.random() - 0.5) * 20,
      y: 40,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      size: 4 + Math.random() * 8,
      speedX: (Math.random() - 0.5) * 8,
      speedY: -(2 + Math.random() * 6),
      opacity: 1,
    }));
    setParticles(newParticles);

    let frame = 0;
    const animate = () => {
      frame++;
      setParticles((prev) =>
        prev
          .map((p) => ({
            ...p,
            x: p.x + p.speedX * 0.3,
            y: p.y + p.speedY * 0.3 + frame * 0.08,
            rotation: p.rotation + p.speedX * 2,
            opacity: Math.max(0, p.opacity - 0.015),
          }))
          .filter((p) => p.opacity > 0)
      );
      if (frame < 80) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setParticles([]);
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [active]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            transform: `rotate(${p.rotation}deg)`,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  );
}

/* ──────────────────────────── main component ────────────────── */

export default function SwipeDeckPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // Topic filter
  const [showFilter, setShowFilter] = useState(true);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());

  // Deck state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [accepted, setAccepted] = useState<Session[]>([]);
  const [skipped, setSkipped] = useState<Session[]>([]);
  const [history, setHistory] = useState<Array<{ action: "accept" | "skip"; session: Session }>>([]);

  // Swipe animation
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const dragStartRef = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  // Confetti
  const [confettiKey, setConfettiKey] = useState(0);
  const [confettiActive, setConfettiActive] = useState(false);

  // Schedule panel
  const [showSchedule, setShowSchedule] = useState(false);

  // Scroll ref for card content
  const contentRef = useRef<HTMLDivElement>(null);

  /* ── fetch data ── */
  useEffect(() => {
    fetch("/data.json")
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions || []);
        setLoading(false);
      });
  }, []);

  /* ── sorted sessions ── */
  const sortedSessions = useMemo(() => {
    if (selectedTopics.size === 0) return sessions;
    const matched: Session[] = [];
    const rest: Session[] = [];
    for (const s of sessions) {
      const cat = getTopicCategory(s.topic);
      if (selectedTopics.has(cat)) {
        matched.push(s);
      } else {
        rest.push(s);
      }
    }
    return [...matched, ...rest];
  }, [sessions, selectedTopics]);

  const currentSession = sortedSessions[currentIndex] || null;
  const totalSessions = sortedSessions.length;
  const reviewed = currentIndex;

  /* ── conflict ── */
  const conflictSlot = currentSession ? hasConflict(currentSession, accepted) : null;

  /* ── actions ── */
  const doAccept = useCallback(() => {
    if (!currentSession || swipeDir) return;
    setSwipeDir("right");
    setConfettiActive(true);
    setConfettiKey((k) => k + 1);
    setTimeout(() => {
      setAccepted((prev) => [...prev, currentSession]);
      setHistory((prev) => [...prev, { action: "accept", session: currentSession }]);
      setCurrentIndex((i) => i + 1);
      setSwipeDir(null);
      setConfettiActive(false);
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }, 400);
  }, [currentSession, swipeDir]);

  const doSkip = useCallback(() => {
    if (!currentSession || swipeDir) return;
    setSwipeDir("left");
    setTimeout(() => {
      setSkipped((prev) => [...prev, currentSession]);
      setHistory((prev) => [...prev, { action: "skip", session: currentSession }]);
      setCurrentIndex((i) => i + 1);
      setSwipeDir(null);
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }, 400);
  }, [currentSession, swipeDir]);

  const doUndo = useCallback(() => {
    if (history.length === 0 || swipeDir) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    if (last.action === "accept") {
      setAccepted((prev) => prev.filter((s) => s.sessionCode !== last.session.sessionCode));
    } else {
      setSkipped((prev) => prev.filter((s) => s.sessionCode !== last.session.sessionCode));
    }
    setCurrentIndex((i) => i - 1);
  }, [history, swipeDir]);

  /* ── keyboard ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showFilter) return;
      if (e.key === "ArrowRight") doAccept();
      else if (e.key === "ArrowLeft") doSkip();
      else if (e.key === "ArrowUp") doUndo();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doAccept, doSkip, doUndo, showFilter]);

  /* ── drag / touch ── */
  const onPointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartRef.current = e.clientX;
    setDragX(0);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setDragX(e.clientX - dragStartRef.current);
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragX > 100) {
      doAccept();
    } else if (dragX < -100) {
      doSkip();
    }
    setDragX(0);
  };

  /* ── schedule grouped by day ── */
  const scheduleByDay = useMemo(() => {
    const groups: Record<string, Array<{ session: Session; slot: ScheduleSlot }>> = {};
    for (const s of accepted) {
      if (!s.schedule) continue;
      for (const slot of s.schedule) {
        const key = slot.date;
        if (!groups[key]) groups[key] = [];
        groups[key].push({ session: s, slot });
      }
    }
    // sort each day by start time
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        const aT = new Date(a.slot.utcStartTime.replace(/\//g, "-")).getTime();
        const bT = new Date(b.slot.utcStartTime.replace(/\//g, "-")).getTime();
        return aT - bT;
      });
    }
    return groups;
  }, [accepted]);

  const sortedDays = Object.keys(scheduleByDay).sort();

  /* ── topic filter modal ── */
  if (showFilter) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-slate-800/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-700/50 p-8">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🎯</div>
            <h1 className="text-3xl font-bold text-white mb-2">
              GTC 2026 Swipe Deck
            </h1>
            <p className="text-slate-400">
              Pick your interests &mdash; matching sessions appear first
            </p>
          </div>

          <div className="space-y-2 mb-8">
            {TOPIC_CATEGORIES.map((cat) => (
              <label
                key={cat}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  selectedTopics.has(cat)
                    ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/50"
                    : "bg-slate-700/40 border border-transparent hover:bg-slate-700/60"
                }`}
                onClick={() => {
                  setSelectedTopics((prev) => {
                    const next = new Set(prev);
                    if (next.has(cat)) next.delete(cat);
                    else next.add(cat);
                    return next;
                  });
                }}
              >
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    selectedTopics.has(cat)
                      ? "bg-amber-500 border-amber-500"
                      : "border-slate-500"
                  }`}
                >
                  {selectedTopics.has(cat) && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-white text-sm font-medium">{cat}</span>
              </label>
            ))}
          </div>

          <button
            onClick={() => setShowFilter(false)}
            className="w-full py-4 rounded-2xl font-bold text-lg text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 transition-all shadow-lg shadow-amber-500/25 active:scale-95"
          >
            Start Swiping ({selectedTopics.size > 0 ? `${selectedTopics.size} topics` : "All sessions"})
          </button>
        </div>
      </div>
    );
  }

  /* ── loading ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading sessions...</div>
      </div>
    );
  }

  /* ── done state ── */
  const isDone = currentIndex >= totalSessions;

  /* ── compute card transforms ── */
  const getCardStyle = (offset: number): React.CSSProperties => {
    if (offset === 0) {
      // current card - swiping or dragging
      if (swipeDir === "right") {
        return {
          transform: "translateX(150%) rotate(20deg)",
          opacity: 0,
          transition: "transform 0.4s cubic-bezier(.2,.8,.3,1), opacity 0.4s ease",
        };
      }
      if (swipeDir === "left") {
        return {
          transform: "translateX(-150%) rotate(-20deg)",
          opacity: 0,
          transition: "transform 0.4s cubic-bezier(.2,.8,.3,1), opacity 0.4s ease",
        };
      }
      if (isDragging && dragX !== 0) {
        const rotation = dragX * 0.08;
        return {
          transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
          transition: "none",
          cursor: "grabbing",
        };
      }
      return {
        transform: "translateX(0) rotate(0deg)",
        transition: "transform 0.3s ease",
        cursor: "grab",
      };
    }
    // stacked cards behind
    const scale = 1 - offset * 0.04;
    const yOff = offset * 10;
    const rot = offset * 1.5;
    return {
      transform: `translateY(${yOff}px) scale(${scale}) rotate(${rot}deg)`,
      transition: "transform 0.3s ease",
      zIndex: 10 - offset,
      pointerEvents: "none" as const,
    };
  };

  const dragOverlayOpacity = Math.min(Math.abs(dragX) / 150, 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 flex flex-col">
      <ConfettiEffect key={confettiKey} active={confettiActive} />

      {/* ── progress bar ── */}
      <div className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800 px-4 py-3">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between text-sm text-slate-400 mb-2">
            <span className="font-medium">
              {reviewed} / {totalSessions} reviewed
            </span>
            <span className="text-amber-400 font-bold">{accepted.length} added</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
              style={{ width: `${(reviewed / Math.max(totalSessions, 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── main area ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 relative">
        {isDone ? (
          /* ── done screen ── */
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6">🎉</div>
            <h2 className="text-3xl font-bold text-white mb-3">All Done!</h2>
            <p className="text-slate-400 mb-2">
              You reviewed all {totalSessions} sessions
            </p>
            <p className="text-lg text-amber-400 font-bold mb-8">
              {accepted.length} sessions in your schedule
            </p>
            <button
              onClick={() => setShowSchedule((s) => !s)}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-2xl font-bold shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all"
            >
              View My Schedule
            </button>
          </div>
        ) : (
          <>
            {/* ── card stack ── */}
            <div className="relative w-full max-w-md" style={{ height: 520 }}>
              {[2, 1, 0].map((offset) => {
                const idx = currentIndex + offset;
                const session = sortedSessions[idx];
                if (!session) return null;
                const isTop = offset === 0;
                const conflict = isTop ? conflictSlot : null;

                return (
                  <div
                    key={session.sessionCode + "-" + idx}
                    ref={isTop ? cardRef : undefined}
                    className={`absolute inset-0 rounded-3xl overflow-hidden shadow-2xl border border-slate-700/50 bg-gradient-to-br ${
                      CARD_GRADIENTS[offset % CARD_GRADIENTS.length]
                    }`}
                    style={{
                      zIndex: isTop ? 20 : 10 - offset,
                      ...getCardStyle(offset),
                    }}
                    onPointerDown={isTop ? onPointerDown : undefined}
                    onPointerMove={isTop ? onPointerMove : undefined}
                    onPointerUp={isTop ? onPointerUp : undefined}
                  >
                    {/* swipe direction overlays */}
                    {isTop && isDragging && (
                      <>
                        <div
                          className="absolute inset-0 bg-green-500/20 rounded-3xl z-10 pointer-events-none flex items-center justify-center"
                          style={{ opacity: dragX > 0 ? dragOverlayOpacity : 0 }}
                        >
                          <div
                            className="text-green-400 text-6xl font-black rotate-[-15deg] border-4 border-green-400 rounded-2xl px-6 py-2"
                            style={{ opacity: dragOverlayOpacity }}
                          >
                            ADD
                          </div>
                        </div>
                        <div
                          className="absolute inset-0 bg-red-500/20 rounded-3xl z-10 pointer-events-none flex items-center justify-center"
                          style={{ opacity: dragX < 0 ? dragOverlayOpacity : 0 }}
                        >
                          <div
                            className="text-red-400 text-6xl font-black rotate-[15deg] border-4 border-red-400 rounded-2xl px-6 py-2"
                            style={{ opacity: dragOverlayOpacity }}
                          >
                            SKIP
                          </div>
                        </div>
                      </>
                    )}

                    {/* card content */}
                    <div
                      ref={isTop ? contentRef : undefined}
                      className="h-full overflow-y-auto p-6 flex flex-col gap-3"
                      style={{ touchAction: "pan-y" }}
                    >
                      {/* badges row */}
                      <div className="flex flex-wrap gap-2 items-center">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold text-white ${
                            TYPE_COLORS[session.type] || "bg-slate-600"
                          }`}
                        >
                          {session.type}
                        </span>
                        {session.technicalLevel && (
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium border ${
                              LEVEL_COLORS[session.technicalLevel] || "border-slate-500 text-slate-400"
                            }`}
                          >
                            {session.technicalLevel}
                          </span>
                        )}
                        {conflict && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse">
                            ⚠ Conflict
                          </span>
                        )}
                      </div>

                      {/* title */}
                      <h2 className="text-xl font-bold text-white leading-tight">
                        {session.title}
                      </h2>

                      {/* topic */}
                      {session.topic && (
                        <div className="text-amber-400/80 text-sm font-medium">
                          {getTopicCategory(session.topic)}
                          {getSubtopic(session.topic) && (
                            <span className="text-slate-500"> / {getSubtopic(session.topic)}</span>
                          )}
                        </div>
                      )}

                      {/* schedule */}
                      {session.schedule && session.schedule.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {session.schedule.map((slot, si) => (
                            <div
                              key={si}
                              className="bg-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-300"
                            >
                              <div className="font-bold text-white">
                                {slot.dayName}, {slot.date.split("-").slice(1).join("/")}
                              </div>
                              <div>
                                {slot.startTime} - {slot.endTime}
                              </div>
                              <div className="text-slate-400 truncate max-w-[200px]">{slot.room}</div>
                              {conflict && si === 0 && (
                                <div className="text-red-400 text-[10px] mt-1">
                                  Overlaps with accepted session
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* speakers */}
                      {session.speakers && session.speakers.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {session.speakers.map((sp, si) => (
                            <div
                              key={si}
                              className="flex items-center gap-2 bg-slate-700/40 rounded-full px-3 py-1.5"
                            >
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[10px] font-bold text-white">
                                {sp.name.charAt(0)}
                              </div>
                              <div>
                                <div className="text-xs text-white font-medium leading-tight">{sp.name}</div>
                                <div className="text-[10px] text-slate-400">{sp.role}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* abstract */}
                      <div className="text-sm text-slate-300 leading-relaxed mt-1 whitespace-pre-wrap">
                        {stripHtml(session.abstract).slice(0, 500)}
                        {stripHtml(session.abstract).length > 500 && (
                          <span className="text-slate-500">...</span>
                        )}
                      </div>

                      {/* session code */}
                      <div className="text-xs text-slate-600 mt-auto pt-2">
                        Session {session.sessionCode}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── action buttons ── */}
            <div className="flex items-center gap-6 mt-8">
              <button
                onClick={doSkip}
                className="group w-16 h-16 rounded-full bg-slate-800 border-2 border-red-500/50 flex items-center justify-center hover:bg-red-500/20 hover:border-red-400 transition-all active:scale-90 shadow-lg"
                title="Skip (←)"
              >
                <svg className="w-7 h-7 text-red-400 group-hover:text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <button
                onClick={doUndo}
                disabled={history.length === 0}
                className="w-12 h-12 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center hover:bg-slate-700 hover:border-slate-500 transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg"
                title="Undo (↑)"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                </svg>
              </button>

              <button
                onClick={doAccept}
                className="group w-16 h-16 rounded-full bg-slate-800 border-2 border-green-500/50 flex items-center justify-center hover:bg-green-500/20 hover:border-green-400 transition-all active:scale-90 shadow-lg"
                title="Add to schedule (→)"
              >
                <svg className="w-7 h-7 text-green-400 group-hover:text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
            </div>

            {/* keyboard hint */}
            <div className="mt-4 flex gap-4 text-xs text-slate-600">
              <span>← Skip</span>
              <span>↑ Undo</span>
              <span>→ Add</span>
            </div>
          </>
        )}
      </div>

      {/* ── schedule toggle button ── */}
      {accepted.length > 0 && (
        <button
          onClick={() => setShowSchedule((s) => !s)}
          className="fixed bottom-6 right-6 z-30 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-2xl font-bold shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all active:scale-95 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          My Schedule ({accepted.length})
        </button>
      )}

      {/* ── schedule panel ── */}
      {showSchedule && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSchedule(false)}
          />
          <div
            className="relative w-full max-w-2xl bg-slate-900 border-t border-slate-700 rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ maxHeight: "75vh" }}
          >
            {/* header */}
            <div className="sticky top-0 bg-slate-900/95 backdrop-blur-lg z-10 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">My Schedule</h3>
                <p className="text-sm text-slate-400">{accepted.length} sessions</p>
              </div>
              <button
                onClick={() => setShowSchedule(false)}
                className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* timeline */}
            <div className="overflow-y-auto p-6 space-y-6" style={{ maxHeight: "calc(75vh - 80px)" }}>
              {accepted.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No sessions added yet</p>
              ) : sortedDays.length === 0 ? (
                /* sessions without schedule */
                <div>
                  <h4 className="text-amber-400 font-bold text-sm mb-3 uppercase tracking-wider">
                    Unscheduled
                  </h4>
                  {accepted
                    .filter((s) => !s.schedule || s.schedule.length === 0)
                    .map((s) => (
                      <div
                        key={s.sessionCode}
                        className="bg-slate-800/60 rounded-xl p-3 mb-2 border border-slate-700/50"
                      >
                        <div className="text-sm text-white font-medium">{s.title}</div>
                        <div className="text-xs text-slate-500">{s.type}</div>
                      </div>
                    ))}
                </div>
              ) : (
                <>
                  {sortedDays.map((day) => (
                    <div key={day}>
                      <h4 className="text-amber-400 font-bold text-sm mb-3 uppercase tracking-wider">
                        {scheduleByDay[day][0].slot.dayName} &mdash;{" "}
                        {day.split("-").slice(1).join("/")}
                      </h4>
                      <div className="space-y-2 border-l-2 border-slate-700 pl-4 ml-2">
                        {scheduleByDay[day].map(({ session, slot }, i) => (
                          <div
                            key={session.sessionCode + "-" + i}
                            className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 relative"
                          >
                            <div className="absolute -left-[1.35rem] top-4 w-3 h-3 rounded-full bg-amber-500 border-2 border-slate-900" />
                            <div className="text-xs text-amber-400/80 font-medium mb-1">
                              {slot.startTime} - {slot.endTime} &middot; {slot.room}
                            </div>
                            <div className="text-sm text-white font-medium">{session.title}</div>
                            <div className="text-xs text-slate-500 mt-1">{session.type}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {/* unscheduled accepted sessions */}
                  {accepted.filter((s) => !s.schedule || s.schedule.length === 0).length > 0 && (
                    <div>
                      <h4 className="text-amber-400 font-bold text-sm mb-3 uppercase tracking-wider">
                        Unscheduled
                      </h4>
                      <div className="space-y-2 pl-4 ml-2">
                        {accepted
                          .filter((s) => !s.schedule || s.schedule.length === 0)
                          .map((s) => (
                            <div
                              key={s.sessionCode}
                              className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50"
                            >
                              <div className="text-sm text-white font-medium">{s.title}</div>
                              <div className="text-xs text-slate-500 mt-1">{s.type}</div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
