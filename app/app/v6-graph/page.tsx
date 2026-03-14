"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";

// react-force-graph-2d uses canvas and cannot SSR
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RawNode {
  id: string;
  title: string;
  type: string;
  topic: string;
  fullTopic: string;
  speakers: string[];
  schedule: string;
  technicalLevel: string;
  featured: string;
  abstract: string;
  connections: number;
  x: number;
  y: number;
}

interface RawEdge {
  s: string;
  t: string;
  r: string;
  v: string;
  w: number;
}

interface RelType {
  type: string;
  label: string;
  color: string;
  count: number;
}

interface GraphNode {
  id: string;
  title: string;
  sessionType: string;
  topic: string;
  fullTopic: string;
  speakers: string[];
  schedule: string;
  technicalLevel: string;
  featured: string;
  abstract: string;
  connections: number;
  x: number;
  y: number;
  // added at runtime by force-graph
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relType: string;
  via: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BG = "#0b0b0f";
const PANEL_BG = "rgba(18,18,26,0.94)";
const PANEL_BORDER = "#1e1e2e";
const TEXT_PRIMARY = "#e0e0e8";
const TEXT_SECONDARY = "#8888a0";
const TEXT_DIM = "#555570";

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function getTopicColor(topic: string | undefined): string {
  if (!topic) return TOPIC_COLORS["Other"];
  const base = topic.includes(" - ") ? topic.split(" - ")[0] : topic;
  return TOPIC_COLORS[base] || TOPIC_COLORS["Other"];
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function V6Graph() {
  const fgRef = useRef</* eslint-disable-next-line @typescript-eslint/no-explicit-any */ any>(null);

  // Data
  const [rawNodes, setRawNodes] = useState<RawNode[]>([]);
  const [rawEdges, setRawEdges] = useState<RawEdge[]>([]);
  const [relTypes, setRelTypes] = useState<RelType[]>([]);
  const [loading, setLoading] = useState(true);

  // Interaction state
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(true);
  const [minConnections, setMinConnections] = useState(0);
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());

  // Adjacency and edge lookup (built once)
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map());
  const edgesByNodeRef = useRef<Map<string, RawEdge[]>>(new Map());
  const nodeMapRef = useRef<Map<string, GraphNode>>(new Map());

  /* ---------------------------------------------------------------- */
  /*  Data Loading                                                     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/graph.json");
        const data = await res.json();

        const nodes: RawNode[] = data.nodes;
        const edges: RawEdge[] = data.edges;
        const rTypes: RelType[] = data.relationshipTypes;

        setRawNodes(nodes);
        setRawEdges(edges);
        setRelTypes(rTypes);

        // Default enabled: all except same_subtopic and time_conflict
        const enabled = new Set<string>();
        for (const rt of rTypes) {
          if (rt.type !== "same_subtopic" && rt.type !== "time_conflict") {
            enabled.add(rt.type);
          }
        }
        setEnabledTypes(enabled);

        // Build adjacency across ALL edges (for hover highlight)
        const adj = new Map<string, Set<string>>();
        const ebn = new Map<string, RawEdge[]>();
        for (const n of nodes) {
          adj.set(n.id, new Set());
          ebn.set(n.id, []);
        }
        for (const e of edges) {
          adj.get(e.s)?.add(e.t);
          adj.get(e.t)?.add(e.s);
          ebn.get(e.s)?.push(e);
          ebn.get(e.t)?.push(e);
        }
        adjacencyRef.current = adj;
        edgesByNodeRef.current = ebn;

        setLoading(false);
      } catch (err) {
        console.error("Failed to load graph data:", err);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Derived: graphData for ForceGraph2D                              */
  /* ---------------------------------------------------------------- */

  const graphData: GraphData = useMemo(() => {
    if (rawNodes.length === 0) return { nodes: [], links: [] };

    // Filter nodes by minConnections
    const nodeSet = new Set<string>();
    const nodes: GraphNode[] = rawNodes
      .filter((n) => n.connections >= minConnections)
      .map((n) => {
        nodeSet.add(n.id);
        return {
          id: n.id,
          title: n.title,
          sessionType: n.type,
          topic: n.topic,
          fullTopic: n.fullTopic,
          speakers: n.speakers,
          schedule: n.schedule,
          technicalLevel: n.technicalLevel,
          featured: n.featured,
          abstract: n.abstract,
          connections: n.connections,
          x: n.x,
          y: n.y,
        };
      });

    // Build node map for detail panel lookups
    const nm = new Map<string, GraphNode>();
    for (const n of nodes) nm.set(n.id, n);
    nodeMapRef.current = nm;

    // Filter edges by enabled types and node existence
    const links: GraphLink[] = rawEdges
      .filter(
        (e) =>
          enabledTypes.has(e.r) && nodeSet.has(e.s) && nodeSet.has(e.t)
      )
      .map((e) => ({
        source: e.s,
        target: e.t,
        relType: e.r,
        via: e.v,
        weight: e.w,
      }));

    return { nodes, links };
  }, [rawNodes, rawEdges, enabledTypes, minConnections]);

  /* ---------------------------------------------------------------- */
  /*  Highlight sets                                                   */
  /* ---------------------------------------------------------------- */

  const highlightNodes = useMemo(() => {
    const set = new Set<string>();
    if (hoverNode) {
      set.add(hoverNode.id);
      const adj = adjacencyRef.current.get(hoverNode.id);
      if (adj) {
        for (const id of adj) set.add(id);
      }
    }
    return set;
  }, [hoverNode]);

  const highlightLinks = useMemo(() => {
    const set = new Set<string>();
    if (hoverNode) {
      // links connected to hovered node
      for (const link of graphData.links) {
        const sId =
          typeof link.source === "string" ? link.source : link.source.id;
        const tId =
          typeof link.target === "string" ? link.target : link.target.id;
        if (sId === hoverNode.id || tId === hoverNode.id) {
          set.add(`${sId}-${tId}`);
        }
      }
    }
    return set;
  }, [hoverNode, graphData.links]);

  /* ---------------------------------------------------------------- */
  /*  Search                                                           */
  /* ---------------------------------------------------------------- */

  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    const matches = new Set<string>();
    for (const n of rawNodes) {
      if (
        n.title.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        n.topic.toLowerCase().includes(q) ||
        n.speakers?.some((sp) => sp.toLowerCase().includes(q))
      ) {
        matches.add(n.id);
      }
    }
    return matches;
  }, [searchQuery, rawNodes]);

  const hasSearch = searchQuery.trim().length > 0;

  /* ---------------------------------------------------------------- */
  /*  Node painting (Obsidian-style glow)                              */
  /* ---------------------------------------------------------------- */

  const paintNode = useCallback(
    (
      node: GraphNode,
      ctx: CanvasRenderingContext2D,
      globalScale: number
    ) => {
      const r = Math.sqrt((node.connections || 0) + 1) * 1.5;
      const color = getTopicColor(node.topic);
      const [cr, cg, cb] = hexToRgb(color);

      const isHovered = node === hoverNode;
      const isHighlighted = highlightNodes.has(node.id);
      const isSearchMatch = hasSearch && searchMatches.has(node.id);
      const dimmedByHover = hoverNode && !isHighlighted;
      const dimmedBySearch = hasSearch && !isSearchMatch;
      const dimmed = dimmedByHover || dimmedBySearch;

      const alpha = dimmed ? 0.07 : isHovered ? 1.0 : 0.85;

      // GLOW effect (the Obsidian secret sauce)
      if (!dimmed) {
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, r * 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${
          isHovered ? 0.18 : isSearchMatch ? 0.12 : 0.06
        })`;
        ctx.fill();
      }

      // Main node circle
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
      ctx.fill();

      // Selected node ring
      if (selectedNode && node.id === selectedNode.id) {
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, r + 1.5 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(255,255,255,0.9)`;
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      // Label on zoom or hover
      if (globalScale > 2.5 || isHovered || (isSearchMatch && globalScale > 1)) {
        const fontSize = Math.max(3, 11 / globalScale);
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = `rgba(255,255,255,${dimmed ? 0.1 : 0.8})`;
        const label = node.title?.length > 30 ? node.title.substring(0, 30) + "..." : node.title;
        ctx.fillText(label, node.x!, node.y! + r + 3 / globalScale);
      }
    },
    [hoverNode, highlightNodes, selectedNode, hasSearch, searchMatches]
  );

  /* ---------------------------------------------------------------- */
  /*  Link painting                                                    */
  /* ---------------------------------------------------------------- */

  const paintLink = useCallback(
    (
      link: GraphLink,
      ctx: CanvasRenderingContext2D,
      globalScale: number
    ) => {
      const source = link.source as GraphNode;
      const target = link.target as GraphNode;
      if (!source.x || !target.x) return;

      const sId = source.id;
      const tId = target.id;
      const linkKey = `${sId}-${tId}`;
      const isHighlighted = highlightLinks.has(linkKey);
      const dimmedByHover = hoverNode && !isHighlighted;
      const dimmedBySearch =
        hasSearch &&
        !searchMatches.has(sId) &&
        !searchMatches.has(tId);
      const dimmed = dimmedByHover || dimmedBySearch;

      const alpha = dimmed
        ? 0.01
        : isHighlighted
        ? 0.25
        : 0.04;

      ctx.beginPath();
      ctx.moveTo(source.x!, source.y!);
      ctx.lineTo(target.x!, target.y!);
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = isHighlighted
        ? 0.8 / globalScale
        : 0.3 / globalScale;
      ctx.stroke();
    },
    [hoverNode, highlightLinks, hasSearch, searchMatches]
  );

  /* ---------------------------------------------------------------- */
  /*  Handlers                                                         */
  /* ---------------------------------------------------------------- */

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoverNode(node || null);
    // Change cursor
    const el = document.querySelector("canvas");
    if (el) el.style.cursor = node ? "pointer" : "grab";
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  const handleNodeDragEnd = useCallback((node: GraphNode) => {
    // Release the node so simulation can continue
    node.fx = undefined;
    node.fy = undefined;
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Force configuration on mount                                     */
  /* ---------------------------------------------------------------- */

  const configureForces = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-40);
    fg.d3Force("link")?.distance(30).strength(0.1);
    fg.d3Force("center")?.strength(0.05);
  }, []);

  useEffect(() => {
    if (!loading && fgRef.current) {
      // Small delay to ensure the ForceGraph is mounted
      const t = setTimeout(configureForces, 100);
      return () => clearTimeout(t);
    }
  }, [loading, configureForces]);

  /* ---------------------------------------------------------------- */
  /*  Zoom to fit on first load                                        */
  /* ---------------------------------------------------------------- */

  const hasZoomedRef = useRef(false);
  useEffect(() => {
    if (!loading && graphData.nodes.length > 0 && !hasZoomedRef.current) {
      hasZoomedRef.current = true;
      const t = setTimeout(() => {
        fgRef.current?.zoomToFit(400, 60);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [loading, graphData.nodes.length]);

  /* ---------------------------------------------------------------- */
  /*  Relationship toggles                                             */
  /* ---------------------------------------------------------------- */

  const toggleRelType = useCallback((type: string) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const showAll = useCallback(() => {
    setEnabledTypes(new Set(relTypes.map((r) => r.type)));
  }, [relTypes]);

  const hideAll = useCallback(() => {
    setEnabledTypes(new Set());
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Detail panel: linked sessions grouped by relationship type       */
  /* ---------------------------------------------------------------- */

  const getLinkedSessions = useCallback(
    (nodeId: string) => {
      const edges = edgesByNodeRef.current.get(nodeId) || [];
      const groups = new Map<
        string,
        { label: string; color: string; items: { nodeId: string; via: string }[] }
      >();

      for (const e of edges) {
        const rt = relTypes.find((r) => r.type === e.r);
        if (!rt) continue;
        const otherId = e.s === nodeId ? e.t : e.s;

        if (!groups.has(e.r)) {
          groups.set(e.r, { label: rt.label, color: rt.color, items: [] });
        }
        const group = groups.get(e.r)!;
        if (!group.items.find((i) => i.nodeId === otherId)) {
          group.items.push({ nodeId: otherId, via: e.v });
        }
      }

      return groups;
    },
    [relTypes]
  );

  const navigateToNode = useCallback(
    (nodeId: string) => {
      const node = nodeMapRef.current.get(nodeId);
      if (!node) return;
      setSelectedNode(node);
      // Center camera on node
      if (fgRef.current) {
        fgRef.current.centerAt(node.x, node.y, 300);
      }
    },
    []
  );

  /* ---------------------------------------------------------------- */
  /*  Stats                                                            */
  /* ---------------------------------------------------------------- */

  const stats = useMemo(() => {
    const enabledCount = enabledTypes.size;
    const totalTypes = relTypes.length;
    return {
      nodes: graphData.nodes.length,
      edges: graphData.links.length,
      enabledCount,
      totalTypes,
    };
  }, [graphData, enabledTypes, relTypes]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background: BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: TEXT_PRIMARY,
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: "3px solid #333",
              borderTop: "3px solid #00e5ff",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <div style={{ fontSize: 18, marginBottom: 8 }}>
            Loading Knowledge Graph...
          </div>
          <div style={{ color: TEXT_SECONDARY, fontSize: 14 }}>
            895 sessions, 10 relationship types
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        background: BG,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: TEXT_PRIMARY,
      }}
    >
      {/* Force Graph Canvas */}
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        backgroundColor={BG}
        nodeCanvasObject={paintNode as any}  /* eslint-disable-line @typescript-eslint/no-explicit-any */
        nodeCanvasObjectMode={() => "replace"}
        linkCanvasObject={paintLink as any}  /* eslint-disable-line @typescript-eslint/no-explicit-any */
        linkCanvasObjectMode={() => "replace"}
        nodeRelSize={4}
        autoPauseRedraw={false}
        onNodeHover={handleNodeHover as any}  /* eslint-disable-line @typescript-eslint/no-explicit-any */
        onNodeClick={handleNodeClick as any}  /* eslint-disable-line @typescript-eslint/no-explicit-any */
        onNodeDragEnd={handleNodeDragEnd as any}  /* eslint-disable-line @typescript-eslint/no-explicit-any */
        onBackgroundClick={handleBackgroundClick}
        warmupTicks={100}
        cooldownTicks={200}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />

      {/* Search bar at top */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
        }}
      >
        <input
          type="text"
          placeholder="Search sessions, speakers, topics..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: 400,
            padding: "10px 16px",
            background: PANEL_BG,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 8,
            color: TEXT_PRIMARY,
            fontSize: 14,
            outline: "none",
            backdropFilter: "blur(10px)",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#00e5ff")}
          onBlur={(e) => (e.target.style.borderColor = PANEL_BORDER)}
        />
        {searchQuery && (
          <div
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: TEXT_SECONDARY,
              fontSize: 12,
            }}
          >
            {searchMatches.size} matches
          </div>
        )}
      </div>

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          fontSize: 14,
          fontWeight: 700,
          color: TEXT_SECONDARY,
          letterSpacing: "0.5px",
        }}
      >
        GTC 2026 KNOWLEDGE GRAPH
      </div>

      {/* Filter panel toggle button */}
      <button
        onClick={() => setFilterOpen((v) => !v)}
        style={{
          position: "absolute",
          top: 48,
          left: 16,
          zIndex: 10,
          padding: "6px 12px",
          background: PANEL_BG,
          border: `1px solid ${PANEL_BORDER}`,
          borderRadius: 6,
          color: TEXT_SECONDARY,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        {filterOpen ? "Hide Filters" : "Show Filters"}
      </button>

      {/* Left filter panel */}
      {filterOpen && (
        <div
          style={{
            position: "absolute",
            top: 80,
            left: 16,
            width: 260,
            maxHeight: "calc(100vh - 140px)",
            overflowY: "auto",
            background: PANEL_BG,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 10,
            padding: 16,
            zIndex: 10,
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: TEXT_SECONDARY,
              marginBottom: 12,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Relationship Types
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <button
              onClick={showAll}
              style={{
                flex: 1,
                padding: "5px 0",
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${PANEL_BORDER}`,
                borderRadius: 4,
                color: TEXT_SECONDARY,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Show All
            </button>
            <button
              onClick={hideAll}
              style={{
                flex: 1,
                padding: "5px 0",
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${PANEL_BORDER}`,
                borderRadius: 4,
                color: TEXT_SECONDARY,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Hide All
            </button>
          </div>

          {relTypes.map((rt) => {
            const enabled = enabledTypes.has(rt.type);
            return (
              <label
                key={rt.type}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  cursor: "pointer",
                  opacity: enabled ? 1 : 0.4,
                  transition: "opacity 0.2s",
                }}
              >
                <div
                  onClick={() => toggleRelType(rt.type)}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    border: `2px solid ${rt.color}`,
                    background: enabled ? rt.color : "transparent",
                    flexShrink: 0,
                    transition: "background 0.2s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {enabled && (
                    <svg width="10" height="10" viewBox="0 0 10 10">
                      <path
                        d="M2 5 L4 7 L8 3"
                        stroke="#000"
                        strokeWidth="1.5"
                        fill="none"
                      />
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: TEXT_PRIMARY,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {rt.label}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: TEXT_DIM,
                    fontFamily: "monospace",
                    flexShrink: 0,
                  }}
                >
                  {rt.count.toLocaleString()}
                </div>
              </label>
            );
          })}

          {/* Min connections slider */}
          <div
            style={{
              marginTop: 16,
              borderTop: `1px solid ${PANEL_BORDER}`,
              paddingTop: 12,
            }}
          >
            <div
              style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 8 }}
            >
              Min Connections:{" "}
              <span
                style={{ color: TEXT_PRIMARY, fontFamily: "monospace" }}
              >
                {minConnections}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              value={minConnections}
              onChange={(e) => setMinConnections(parseInt(e.target.value))}
              style={{ width: "100%", accentColor: "#00e5ff" }}
            />
          </div>

          {/* Topic legend */}
          <div
            style={{
              marginTop: 16,
              borderTop: `1px solid ${PANEL_BORDER}`,
              paddingTop: 12,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: TEXT_SECONDARY,
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Topics
            </div>
            {Object.entries(TOPIC_COLORS)
              .filter(([t]) => t !== "Other")
              .map(([topic, color]) => (
                <div
                  key={topic}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "3px 0",
                    fontSize: 11,
                    color: TEXT_SECONDARY,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: color,
                      boxShadow: `0 0 6px ${color}88`,
                      flexShrink: 0,
                    }}
                  />
                  {topic}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Right detail panel */}
      {selectedNode && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 400,
            height: "100vh",
            background: PANEL_BG,
            borderLeft: `1px solid ${PANEL_BORDER}`,
            overflowY: "auto",
            zIndex: 20,
            backdropFilter: "blur(10px)",
          }}
        >
          {/* Close button */}
          <button
            onClick={() => setSelectedNode(null)}
            style={{
              position: "sticky",
              top: 8,
              float: "right",
              margin: "8px 12px 0 0",
              width: 28,
              height: 28,
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${PANEL_BORDER}`,
              borderRadius: 6,
              color: TEXT_SECONDARY,
              fontSize: 16,
              cursor: "pointer",
              zIndex: 5,
              lineHeight: "26px",
              textAlign: "center",
            }}
          >
            x
          </button>

          <div style={{ padding: "20px 20px 20px 20px" }}>
            {/* Session code badge */}
            {(() => {
              const nodeColor = getTopicColor(selectedNode.topic);
              return (
                <div
                  style={{
                    display: "inline-block",
                    padding: "3px 8px",
                    background: `${nodeColor}22`,
                    border: `1px solid ${nodeColor}44`,
                    borderRadius: 4,
                    fontSize: 11,
                    color: nodeColor,
                    fontFamily: "monospace",
                    marginBottom: 8,
                  }}
                >
                  {selectedNode.id}
                </div>
              );
            })()}

            {/* Title */}
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                lineHeight: 1.3,
                margin: "0 0 12px 0",
                color: TEXT_PRIMARY,
              }}
            >
              {selectedNode.title}
            </h2>

            {/* Meta info */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  padding: "3px 8px",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 4,
                  fontSize: 11,
                  color: TEXT_SECONDARY,
                }}
              >
                {selectedNode.sessionType}
              </span>
              <span
                style={{
                  padding: "3px 8px",
                  background: `${getTopicColor(selectedNode.topic)}15`,
                  borderRadius: 4,
                  fontSize: 11,
                  color: getTopicColor(selectedNode.topic),
                }}
              >
                {selectedNode.topic}
              </span>
              {selectedNode.technicalLevel && (
                <span
                  style={{
                    padding: "3px 8px",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 4,
                    fontSize: 11,
                    color: TEXT_SECONDARY,
                  }}
                >
                  {selectedNode.technicalLevel}
                </span>
              )}
            </div>

            {/* Speakers */}
            {selectedNode.speakers && selectedNode.speakers.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: TEXT_DIM,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: 6,
                  }}
                >
                  Speakers
                </div>
                {selectedNode.speakers.map((sp, i) => (
                  <div key={i} style={{ padding: "4px 0", fontSize: 13 }}>
                    <span style={{ color: TEXT_PRIMARY }}>{sp}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Schedule */}
            {selectedNode.schedule && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: TEXT_DIM,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: 6,
                  }}
                >
                  Schedule
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: TEXT_SECONDARY,
                    padding: "2px 0",
                  }}
                >
                  {selectedNode.schedule}
                </div>
              </div>
            )}

            {/* Abstract */}
            {selectedNode.abstract && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: TEXT_DIM,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: 6,
                  }}
                >
                  Abstract
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: TEXT_SECONDARY,
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  {stripHtml(selectedNode.abstract).slice(0, 500)}
                  {selectedNode.abstract.length > 500 && "..."}
                </div>
              </div>
            )}

            {/* Connected sessions - Obsidian-style backlinks */}
            <div
              style={{
                borderTop: `1px solid ${PANEL_BORDER}`,
                paddingTop: 16,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: TEXT_SECONDARY,
                  marginBottom: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Links ({selectedNode.connections})
              </div>

              {(() => {
                const groups = getLinkedSessions(selectedNode.id);
                return Array.from(groups.entries()).map(
                  ([relType, group]) => (
                    <div key={relType} style={{ marginBottom: 14 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 6,
                        }}
                      >
                        <div
                          style={{
                            width: 8,
                            height: 2,
                            background: group.color,
                            borderRadius: 1,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: group.color,
                          }}
                        >
                          {group.label}
                        </span>
                        <span style={{ fontSize: 10, color: TEXT_DIM }}>
                          ({group.items.length})
                        </span>
                      </div>
                      {group.items.slice(0, 20).map((item) => {
                        const otherNode = nodeMapRef.current.get(
                          item.nodeId
                        );
                        const otherTitle = otherNode?.title || item.nodeId;
                        const otherColor = otherNode
                          ? getTopicColor(otherNode.topic)
                          : "#666";
                        return (
                          <button
                            key={item.nodeId}
                            onClick={() => navigateToNode(item.nodeId)}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: "6px 8px",
                              margin: "2px 0",
                              background: "rgba(255,255,255,0.02)",
                              border: "1px solid transparent",
                              borderRadius: 4,
                              cursor: "pointer",
                              color: TEXT_PRIMARY,
                              fontSize: 12,
                              lineHeight: 1.3,
                              transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "rgba(255,255,255,0.06)";
                              e.currentTarget.style.borderColor =
                                PANEL_BORDER;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background =
                                "rgba(255,255,255,0.02)";
                              e.currentTarget.style.borderColor =
                                "transparent";
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "start",
                                gap: 6,
                              }}
                            >
                              <div
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background: otherColor,
                                  flexShrink: 0,
                                  marginTop: 4,
                                }}
                              />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div
                                  style={{
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {otherTitle}
                                </div>
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: TEXT_DIM,
                                    marginTop: 2,
                                  }}
                                >
                                  {item.nodeId} | via: {item.via}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      {group.items.length > 20 && (
                        <div
                          style={{
                            fontSize: 10,
                            color: TEXT_DIM,
                            padding: "4px 8px",
                          }}
                        >
                          ...and {group.items.length - 20} more
                        </div>
                      )}
                    </div>
                  )
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Bottom stats bar */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          padding: "6px 16px",
          background: PANEL_BG,
          border: `1px solid ${PANEL_BORDER}`,
          borderRadius: 6,
          fontSize: 12,
          color: TEXT_SECONDARY,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        {stats.nodes} nodes | {stats.edges.toLocaleString()} edges |{" "}
        {stats.enabledCount}/{stats.totalTypes} relationship types
      </div>

      {/* Keyboard shortcut hint */}
      <div
        style={{
          position: "absolute",
          bottom: 44,
          left: 16,
          fontSize: 11,
          color: TEXT_DIM,
          zIndex: 5,
        }}
      >
        Scroll to zoom | Drag to pan | Click node for details
      </div>
    </div>
  );
}
