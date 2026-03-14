"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
  topic?: string | string[];
  technicalLevel?: string;
  industry?: string;
  intendedAudience?: string;
  viewingExperience?: string;
  language?: string;
  nvidiaTechnology?: string;
  speakers?: Speaker[];
  schedule?: ScheduleSlot[];
}

interface Star {
  session: Session;
  x: number;
  y: number;
  radius: number;
  mainTopic: string;
  color: string;
  isKeynote: boolean;
  glowPhase: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BG = "#0a0a1a";

const TOPIC_COLORS: Record<string, string> = {
  "Agentic AI / Generative AI": "#00e5ff",
  "Data Center / Cloud": "#ff6e40",
  "Developer Tools & Techniques": "#eeff41",
  "Networking / Communications": "#e040fb",
  MLOps: "#76ff03",
  "Simulation / Modeling / Design": "#ff4081",
  "Data Science": "#40c4ff",
  "Trustworthy AI / Cybersecurity": "#ff9100",
  Robotics: "#69f0ae",
  "Edge Computing": "#7c4dff",
  "Computer Vision / Video Analytics": "#ffab40",
  "AR / VR": "#f50057",
  "Content Creation / Rendering": "#18ffff",
  Other: "#b0bec5",
};

const TYPE_RADIUS: Record<string, number> = {
  Keynote: 7,
  "Fireside Chat": 5.5,
  "Panel Discussion": 5,
  Talk: 4,
  "Sponsored Talk": 4,
  Tutorial: 3.5,
  "Lightning Talk": 3,
  "Training Lab": 3,
  "Full-Day Workshop": 3.5,
  Poster: 2.5,
};
const DEFAULT_RADIUS = 3;

function getMainTopic(topic?: string | string[]): string {
  if (!topic) return "Other";
  const t = Array.isArray(topic) ? topic[0] : topic;
  const idx = t.indexOf(" - ");
  return idx > 0 ? t.substring(0, idx).trim() : t.trim();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/*  Background particles (twinkling)                                   */
/* ------------------------------------------------------------------ */

interface Particle {
  x: number;
  y: number;
  r: number;
  alpha: number;
  speed: number;
  phase: number;
}

function makeParticles(count: number, w: number, h: number): Particle[] {
  const ps: Particle[] = [];
  for (let i = 0; i < count; i++) {
    ps.push({
      x: Math.random() * w * 3 - w,
      y: Math.random() * h * 3 - h,
      r: Math.random() * 1.2 + 0.3,
      alpha: Math.random() * 0.6 + 0.1,
      speed: Math.random() * 0.008 + 0.002,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return ps;
}

/* ------------------------------------------------------------------ */
/*  Layout stars by topic clusters                                     */
/* ------------------------------------------------------------------ */

function layoutStars(
  sessions: Session[],
  canvasW: number,
  canvasH: number
): Star[] {
  const byTopic: Record<string, Session[]> = {};
  for (const s of sessions) {
    const mt = getMainTopic(s.topic);
    if (!byTopic[mt]) byTopic[mt] = [];
    byTopic[mt].push(s);
  }

  const topicNames = Object.keys(byTopic).sort(
    (a, b) => byTopic[b].length - byTopic[a].length
  );
  const numTopics = topicNames.length;

  // Place cluster centres in a roughly circular arrangement
  const centreX = canvasW / 2;
  const centreY = canvasH / 2;
  const ringRadius = Math.min(canvasW, canvasH) * 0.35;

  const clusterCentres: Record<string, { cx: number; cy: number }> = {};
  topicNames.forEach((t, i) => {
    const angle = (2 * Math.PI * i) / numTopics - Math.PI / 2;
    clusterCentres[t] = {
      cx: centreX + Math.cos(angle) * ringRadius,
      cy: centreY + Math.sin(angle) * ringRadius,
    };
  });

  const stars: Star[] = [];

  for (const topicName of topicNames) {
    const topicSessions = byTopic[topicName];
    const { cx, cy } = clusterCentres[topicName];
    const color = TOPIC_COLORS[topicName] || TOPIC_COLORS["Other"];
    const spread = Math.min(180, 50 + topicSessions.length * 0.7);

    for (let i = 0; i < topicSessions.length; i++) {
      const s = topicSessions[i];
      const r = TYPE_RADIUS[s.type] || DEFAULT_RADIUS;
      const isKeynote =
        s.type === "Keynote" ||
        s.type === "Fireside Chat" ||
        s.type === "Panel Discussion";

      // Spiral + random for position within cluster
      const angle =
        (i / topicSessions.length) * Math.PI * 6 + Math.random() * 0.5;
      const dist =
        Math.sqrt(i / topicSessions.length) * spread + Math.random() * 20;
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;

      stars.push({
        session: s,
        x,
        y,
        radius: r,
        mainTopic: topicName,
        color,
        isKeynote,
        glowPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  return stars;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ConstellationPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stars, setStars] = useState<Star[]>([]);
  const [hoveredStar, setHoveredStar] = useState<Star | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [selectedStar, setSelectedStar] = useState<Star | null>(null);
  const [search, setSearch] = useState("");
  const [showLegend, setShowLegend] = useState(true);

  // Camera state stored in refs for animation loop access
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const cameraDragStartRef = useRef({ x: 0, y: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<Star[]>([]);
  const animFrameRef = useRef(0);
  const searchRef = useRef("");

  // Keep refs in sync
  useEffect(() => {
    starsRef.current = stars;
  }, [stars]);

  useEffect(() => {
    searchRef.current = search.toLowerCase();
  }, [search]);

  /* ---- Fetch data ---- */
  useEffect(() => {
    fetch("/data.json")
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions as Session[]);
      });
  }, []);

  /* ---- Layout on data load ---- */
  useEffect(() => {
    if (sessions.length === 0) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const laid = layoutStars(sessions, w * 1.6, h * 1.6);
    setStars(laid);
    // centre camera
    cameraRef.current = {
      x: -(w * 1.6 - w) / 2,
      y: -(h * 1.6 - h) / 2,
      zoom: 1,
    };
    particlesRef.current = makeParticles(600, w * 1.6, h * 1.6);
  }, [sessions]);

  /* ---- Search matching ---- */
  const searchLower = search.toLowerCase();
  const matchesSearch = useCallback(
    (s: Session) => {
      if (!searchLower) return true;
      return (
        s.title.toLowerCase().includes(searchLower) ||
        (s.speakers || []).some((sp) =>
          sp.name.toLowerCase().includes(searchLower)
        ) ||
        (typeof s.topic === "string" &&
          s.topic.toLowerCase().includes(searchLower)) ||
        s.type.toLowerCase().includes(searchLower) ||
        s.sessionCode.toLowerCase().includes(searchLower)
      );
    },
    [searchLower]
  );

  const matchesSearchStatic = (s: Session, q: string) => {
    if (!q) return true;
    return (
      s.title.toLowerCase().includes(q) ||
      (s.speakers || []).some((sp) => sp.name.toLowerCase().includes(q)) ||
      (typeof s.topic === "string" && s.topic.toLowerCase().includes(q)) ||
      s.type.toLowerCase().includes(q) ||
      s.sessionCode.toLowerCase().includes(q)
    );
  };

  /* ---- Canvas coordinate helpers ---- */
  const worldToScreen = useCallback((wx: number, wy: number) => {
    const cam = cameraRef.current;
    return {
      sx: (wx + cam.x) * cam.zoom,
      sy: (wy + cam.y) * cam.zoom,
    };
  }, []);

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cam = cameraRef.current;
    return {
      wx: sx / cam.zoom - cam.x,
      wy: sy / cam.zoom - cam.y,
    };
  }, []);

  /* ---- Hit-test ---- */
  const hitTest = useCallback(
    (sx: number, sy: number): Star | null => {
      const { wx, wy } = screenToWorld(sx, sy);
      const cam = cameraRef.current;
      let closest: Star | null = null;
      let closestDist = Infinity;
      for (const st of starsRef.current) {
        const dx = st.x - wx;
        const dy = st.y - wy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const hitRadius = (st.radius + 4) / cam.zoom;
        if (dist < hitRadius && dist < closestDist) {
          closest = st;
          closestDist = dist;
        }
      }
      return closest;
    },
    [screenToWorld]
  );

  /* ---- Mouse handlers ---- */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    cameraDragStartRef.current = {
      x: cameraRef.current.x,
      y: cameraRef.current.y,
    };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
      if (isDraggingRef.current) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        cameraRef.current.x =
          cameraDragStartRef.current.x + dx / cameraRef.current.zoom;
        cameraRef.current.y =
          cameraDragStartRef.current.y + dy / cameraRef.current.zoom;
        setHoveredStar(null);
      } else {
        const hit = hitTest(e.clientX, e.clientY);
        setHoveredStar(hit);
      }
    },
    [hitTest]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (isDraggingRef.current) {
        const dx = Math.abs(e.clientX - dragStartRef.current.x);
        const dy = Math.abs(e.clientY - dragStartRef.current.y);
        if (dx < 4 && dy < 4) {
          // It was a click, not a drag
          const hit = hitTest(e.clientX, e.clientY);
          setSelectedStar(hit);
        }
      }
      isDraggingRef.current = false;
    },
    [hitTest]
  );

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const cam = cameraRef.current;
    const oldZoom = cam.zoom;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(oldZoom * factor, 0.2), 5);

    // Zoom towards cursor position
    const wx = e.clientX / oldZoom - cam.x;
    const wy = e.clientY / oldZoom - cam.y;
    cam.zoom = newZoom;
    cam.x = e.clientX / newZoom - wx;
    cam.y = e.clientY / newZoom - wy;
  }, []);

  /* ---- Draw loop ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (time: number) => {
      if (!running) return;
      const w = canvas.width;
      const h = canvas.height;
      const cam = cameraRef.current;
      const currentSearch = searchRef.current;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);

      // ---- Background particles ----
      for (const p of particlesRef.current) {
        const alpha =
          p.alpha * (0.5 + 0.5 * Math.sin(time * p.speed + p.phase));
        const sx = (p.x + cam.x) * cam.zoom;
        const sy = (p.y + cam.y) * cam.zoom;
        if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;
        ctx.beginPath();
        ctx.arc(sx, sy, p.r * cam.zoom, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }

      // ---- Determine search ----
      const hasSearch = currentSearch.length > 0;

      // ---- Cluster labels ----
      const clusterCentres: Record<
        string,
        { sx: number; sy: number; count: number }
      > = {};
      for (const st of starsRef.current) {
        if (!clusterCentres[st.mainTopic]) {
          clusterCentres[st.mainTopic] = { sx: 0, sy: 0, count: 0 };
        }
        clusterCentres[st.mainTopic].sx += st.x;
        clusterCentres[st.mainTopic].sy += st.y;
        clusterCentres[st.mainTopic].count += 1;
      }

      for (const topic of Object.keys(clusterCentres)) {
        const c = clusterCentres[topic];
        const avgX = c.sx / c.count;
        const avgY = c.sy / c.count;
        const sx = (avgX + cam.x) * cam.zoom;
        const sy = (avgY + cam.y) * cam.zoom;
        if (sx < -200 || sx > w + 200 || sy < -100 || sy > h + 100) continue;

        const fontSize = Math.max(10, Math.min(16, 14 * cam.zoom));
        ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "center";
        const col = TOPIC_COLORS[topic] || TOPIC_COLORS["Other"];

        // Glow
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = 15;
        ctx.fillStyle = col;
        ctx.globalAlpha = hasSearch ? 0.25 : 0.7;
        ctx.fillText(topic, sx, sy - 24 * cam.zoom);
        ctx.restore();
      }

      // ---- Stars ----
      for (const st of starsRef.current) {
        const sx = (st.x + cam.x) * cam.zoom;
        const sy = (st.y + cam.y) * cam.zoom;
        // Culling
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;

        const isMatch =
          !hasSearch || matchesSearchStatic(st.session, currentSearch);
        const baseAlpha = isMatch ? 1 : 0.08;
        const r = st.radius * cam.zoom;

        // Keynote glow pulse
        if (st.isKeynote && isMatch) {
          const pulse =
            0.5 + 0.5 * Math.sin(time * 0.003 + st.glowPhase);
          const glowR = r * (2.5 + pulse * 1.5);
          const grad = ctx.createRadialGradient(
            sx,
            sy,
            r * 0.5,
            sx,
            sy,
            glowR
          );
          grad.addColorStop(0, st.color + "60");
          grad.addColorStop(0.5, st.color + "20");
          grad.addColorStop(1, st.color + "00");
          ctx.beginPath();
          ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Star circle
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.globalAlpha = baseAlpha;
        ctx.fillStyle = st.color;
        ctx.fill();

        // Bright center for importance
        if (st.isKeynote && isMatch) {
          ctx.beginPath();
          ctx.arc(sx, sy, r * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.globalAlpha = 0.85;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [stars]);

  /* ---- Helpers for rendering ---- */
  const formatSchedule = (sched?: ScheduleSlot[]) => {
    if (!sched || sched.length === 0) return "TBD";
    const s = sched[0];
    return `${s.dayName}, ${s.date} | ${s.startTime} - ${s.endTime}`;
  };

  const formatRoom = (sched?: ScheduleSlot[]) => {
    if (!sched || sched.length === 0) return "";
    return sched[0].room || "";
  };

  const topicDisplay = (topic?: string | string[]) => {
    if (!topic) return "N/A";
    return Array.isArray(topic) ? topic.join(", ") : topic;
  };

  /* ---- Render ---- */
  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      style={{ background: BG }}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          isDraggingRef.current = false;
          setHoveredStar(null);
        }}
        onWheel={handleWheel}
      />

      {/* Search bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions, speakers, topics..."
            className="w-[420px] px-4 py-2.5 pl-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white placeholder-white/40 text-sm focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/30 transition"
          />
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path
              d="m21 21-4.35-4.35"
              strokeLinecap="round"
              strokeWidth="2"
            />
          </svg>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 text-xs"
            >
              Clear
            </button>
          )}
        </div>
        {search && (
          <div className="text-center text-white/50 text-xs mt-1.5">
            {stars.filter((s) => matchesSearch(s.session)).length} of{" "}
            {stars.length} sessions match
          </div>
        )}
      </div>

      {/* Title */}
      <div className="absolute top-4 left-4 z-10 select-none">
        <h1 className="text-white/90 text-lg font-semibold tracking-wide">
          GTC 2026{" "}
          <span className="text-white/50 font-normal">
            Topic Constellation
          </span>
        </h1>
        <p className="text-white/30 text-xs mt-0.5">
          {sessions.length} sessions &middot; Scroll to zoom &middot; Drag to
          pan
        </p>
      </div>

      {/* Tooltip on hover */}
      {hoveredStar && !isDraggingRef.current && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{
            left: mousePos.x + 14,
            top: mousePos.y + 14,
            maxWidth: 340,
          }}
        >
          <div className="bg-black/85 backdrop-blur-sm border border-white/15 rounded-lg px-3.5 py-2.5 shadow-xl">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: hoveredStar.color }}
              />
              <span className="text-white/50 text-[10px] font-medium uppercase tracking-wider">
                {hoveredStar.session.type}
              </span>
            </div>
            <div className="text-white text-sm font-medium leading-snug">
              {hoveredStar.session.title}
            </div>
            {hoveredStar.session.speakers &&
              hoveredStar.session.speakers.length > 0 && (
                <div className="text-white/60 text-xs mt-1">
                  {hoveredStar.session.speakers
                    .map((sp) => sp.name)
                    .join(", ")}
                </div>
              )}
            <div className="text-white/40 text-xs mt-1">
              {formatSchedule(hoveredStar.session.schedule)}
            </div>
          </div>
        </div>
      )}

      {/* Detail panel */}
      <div
        className={`absolute top-0 right-0 h-full w-[420px] max-w-[90vw] z-20 transform transition-transform duration-300 ease-out ${
          selectedStar ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full bg-black/90 backdrop-blur-md border-l border-white/10 overflow-y-auto">
          {selectedStar && (
            <div className="p-6">
              {/* Close button */}
              <button
                onClick={() => setSelectedStar(null)}
                className="absolute top-4 right-4 text-white/40 hover:text-white/90 transition"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M6 18L18 6M6 6l12 12"
                    strokeLinecap="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>

              {/* Type badge */}
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ background: selectedStar.color }}
                />
                <span
                  className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                  style={{
                    color: selectedStar.color,
                    borderColor: selectedStar.color + "40",
                    background: selectedStar.color + "15",
                  }}
                >
                  {selectedStar.session.type}
                </span>
                <span className="text-white/30 text-xs">
                  #{selectedStar.session.sessionCode}
                </span>
              </div>

              {/* Title */}
              <h2 className="text-white text-xl font-bold leading-tight mb-4">
                {selectedStar.session.title}
              </h2>

              {/* Schedule */}
              <div className="mb-4">
                <div className="text-white/40 text-[10px] uppercase tracking-wider font-semibold mb-1">
                  Schedule
                </div>
                <div className="text-white/80 text-sm">
                  {formatSchedule(selectedStar.session.schedule)}
                </div>
                {formatRoom(selectedStar.session.schedule) && (
                  <div className="text-white/50 text-xs mt-0.5">
                    {formatRoom(selectedStar.session.schedule)}
                  </div>
                )}
                {selectedStar.session.schedule &&
                  selectedStar.session.schedule.length > 1 && (
                    <div className="mt-2 space-y-1">
                      {selectedStar.session.schedule
                        .slice(1)
                        .map((slot, i) => (
                          <div key={i} className="text-white/50 text-xs">
                            Also: {slot.dayName} {slot.startTime}-
                            {slot.endTime} ({slot.room})
                          </div>
                        ))}
                    </div>
                  )}
              </div>

              {/* Topic */}
              <div className="mb-4">
                <div className="text-white/40 text-[10px] uppercase tracking-wider font-semibold mb-1">
                  Topic
                </div>
                <div className="text-white/80 text-sm">
                  {topicDisplay(selectedStar.session.topic)}
                </div>
              </div>

              {/* Technical level */}
              {selectedStar.session.technicalLevel && (
                <div className="mb-4">
                  <div className="text-white/40 text-[10px] uppercase tracking-wider font-semibold mb-1">
                    Technical Level
                  </div>
                  <div className="text-white/80 text-sm">
                    {selectedStar.session.technicalLevel}
                  </div>
                </div>
              )}

              {/* Speakers */}
              {selectedStar.session.speakers &&
                selectedStar.session.speakers.length > 0 && (
                  <div className="mb-4">
                    <div className="text-white/40 text-[10px] uppercase tracking-wider font-semibold mb-2">
                      Speakers
                    </div>
                    <div className="space-y-2">
                      {selectedStar.session.speakers.map((sp, i) => (
                        <div
                          key={i}
                          className="bg-white/5 rounded-lg p-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-medium">
                              {sp.name}
                            </span>
                            <span className="text-white/30 text-[10px] uppercase">
                              {sp.role}
                            </span>
                          </div>
                          {sp.bio && (
                            <div className="text-white/40 text-xs mt-1 line-clamp-3">
                              {sp.bio}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Abstract */}
              <div className="mb-4">
                <div className="text-white/40 text-[10px] uppercase tracking-wider font-semibold mb-1">
                  Abstract
                </div>
                <div className="text-white/60 text-sm leading-relaxed">
                  {stripHtml(selectedStar.session.abstract)}
                </div>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {selectedStar.session.industry && (
                  <div>
                    <div className="text-white/30 uppercase tracking-wider text-[10px] mb-0.5">
                      Industry
                    </div>
                    <div className="text-white/60">
                      {selectedStar.session.industry}
                    </div>
                  </div>
                )}
                {selectedStar.session.viewingExperience && (
                  <div>
                    <div className="text-white/30 uppercase tracking-wider text-[10px] mb-0.5">
                      Viewing
                    </div>
                    <div className="text-white/60">
                      {selectedStar.session.viewingExperience}
                    </div>
                  </div>
                )}
                {selectedStar.session.intendedAudience && (
                  <div>
                    <div className="text-white/30 uppercase tracking-wider text-[10px] mb-0.5">
                      Audience
                    </div>
                    <div className="text-white/60">
                      {selectedStar.session.intendedAudience}
                    </div>
                  </div>
                )}
                {selectedStar.session.nvidiaTechnology && (
                  <div>
                    <div className="text-white/30 uppercase tracking-wider text-[10px] mb-0.5">
                      NVIDIA Tech
                    </div>
                    <div className="text-white/60">
                      {selectedStar.session.nvidiaTechnology}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="absolute bottom-4 left-4 z-10 select-none">
          <div className="bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/50 text-[10px] uppercase tracking-wider font-semibold">
                Topic Colors
              </span>
              <button
                onClick={() => setShowLegend(false)}
                className="text-white/30 hover:text-white/60 text-xs ml-4"
              >
                Hide
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(TOPIC_COLORS)
                .filter(([k]) => k !== "Other")
                .map(([topic, color]) => (
                  <div key={topic} className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: color }}
                    />
                    <span className="text-white/50 text-[10px] whitespace-nowrap">
                      {topic}
                    </span>
                  </div>
                ))}
            </div>
            <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-3 text-[10px] text-white/40">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full bg-white/20" />
                Regular
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-4 rounded-full bg-white/30 shadow-[0_0_6px_rgba(255,255,255,0.3)]" />
                Keynote / Featured
              </span>
            </div>
          </div>
        </div>
      )}

      {!showLegend && (
        <button
          onClick={() => setShowLegend(true)}
          className="absolute bottom-4 left-4 z-10 text-white/30 hover:text-white/60 text-xs bg-black/40 backdrop-blur-sm border border-white/10 rounded px-2 py-1"
        >
          Show Legend
        </button>
      )}
    </div>
  );
}
