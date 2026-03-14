"use client";

import { useEffect, useRef, useState, useCallback } from "react";

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
  lengthMinutes?: number;
}

interface Session {
  sessionCode: string;
  title: string;
  type: string;
  abstract?: string;
  topic?: string | string[];
  speakers?: Speaker[];
  schedule?: Schedule[];
  technicalLevel?: string;
  industry?: string;
  nvidiaTechnology?: string;
}

interface Edge {
  source: string;
  target: string;
  via: string;
  weight: number;
}

interface RelationshipFile {
  type: string;
  label: string;
  color: string;
  edges: Edge[];
}

interface GraphNode {
  id: string;
  session: Session;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  radius: number;
  color: string;
  topicName: string;
  connections: number;
  degree: number;
}

interface GraphEdge {
  source: string;
  target: string;
  via: string;
  weight: number;
  relType: string;
  color: string;
}

interface RelType {
  type: string;
  label: string;
  color: string;
  count: number;
  enabled: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BG = "#0f0f14";
const PANEL_BG = "#1e1e2e";
const PANEL_BORDER = "#2a2a3e";
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

const RELATIONSHIP_FILES = [
  "shared_speaker",
  "same_topic",
  "time_conflict",
  "same_room_sequential",
  "shared_nvidia_tech",
  "shared_key_theme",
  "cross_topic_speaker",
  "same_subtopic",
  "learning_path",
  "featured_hub",
];

const FEATURED_TYPES = new Set(["Keynote", "Fireside Chat", "Panel Discussion"]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getTopicName(topic: string | string[] | undefined): string {
  if (!topic) return "Other";
  const t = Array.isArray(topic) ? topic[0] : topic;
  const base = t.includes(" - ") ? t.split(" - ")[0] : t;
  return base || "Other";
}

function getTopicColor(topic: string | string[] | undefined): string {
  const name = getTopicName(topic);
  return TOPIC_COLORS[name] || TOPIC_COLORS["Other"];
}

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

/* ------------------------------------------------------------------ */
/*  Spatial Grid for fast hover detection                              */
/* ------------------------------------------------------------------ */

class SpatialGrid {
  private cellSize: number;
  private cells: Map<string, GraphNode[]>;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  private key(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  insert(node: GraphNode) {
    const k = this.key(node.x, node.y);
    const arr = this.cells.get(k);
    if (arr) arr.push(node);
    else this.cells.set(k, [node]);
  }

  query(x: number, y: number, radius: number): GraphNode[] {
    const results: GraphNode[] = [];
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const arr = this.cells.get(`${cx},${cy}`);
        if (arr) {
          for (const n of arr) results.push(n);
        }
      }
    }
    return results;
  }
}

/* ------------------------------------------------------------------ */
/*  Barnes-Hut Quadtree (d3-force style)                              */
/* ------------------------------------------------------------------ */

interface QuadNode {
  // Internal node: has children, no body
  // Leaf node: has body, no children
  x: number; // center of mass x (for internal), or body x (for leaf)
  y: number; // center of mass y
  strength: number; // accumulated strength (for many-body)
  children: (QuadNode | null)[]; // [NW, NE, SW, SE]
  body: GraphNode | null; // leaf body (null for internal nodes)
  isInternal: boolean;
}

class Quadtree {
  root: QuadNode | null = null;
  x0 = 0;
  y0 = 0;
  x1 = 0;
  y1 = 0;

  constructor(nodes: GraphNode[]) {
    if (nodes.length === 0) return;

    // Find bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    }

    // Make it square with some padding
    const dx = maxX - minX;
    const dy = maxY - minY;
    const size = Math.max(dx, dy, 1) + 2;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.x0 = cx - size / 2;
    this.y0 = cy - size / 2;
    this.x1 = cx + size / 2;
    this.y1 = cy + size / 2;

    // Insert all nodes
    for (const n of nodes) {
      this.insert(n);
    }
  }

  private insert(node: GraphNode) {
    if (!this.root) {
      this.root = this.makeLeaf(node);
      return;
    }
    this._insert(this.root, node, this.x0, this.y0, this.x1, this.y1);
  }

  private makeLeaf(node: GraphNode): QuadNode {
    return {
      x: node.x,
      y: node.y,
      strength: 0,
      children: [null, null, null, null],
      body: node,
      isInternal: false,
    };
  }

  private makeInternal(): QuadNode {
    return {
      x: 0,
      y: 0,
      strength: 0,
      children: [null, null, null, null],
      body: null,
      isInternal: true,
    };
  }

  private quadrant(px: number, py: number, mx: number, my: number): number {
    // NW=0, NE=1, SW=2, SE=3
    if (py < my) {
      return px < mx ? 0 : 1;
    } else {
      return px < mx ? 2 : 3;
    }
  }

  private _insert(
    qnode: QuadNode,
    node: GraphNode,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): QuadNode {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;

    if (!qnode.isInternal && qnode.body === null) {
      // Empty leaf, just put the node here
      qnode.body = node;
      qnode.x = node.x;
      qnode.y = node.y;
      return qnode;
    }

    if (!qnode.isInternal && qnode.body !== null) {
      // This is a leaf with an existing body. Split into internal node.
      const existingBody = qnode.body;
      qnode.body = null;
      qnode.isInternal = true;
      qnode.children = [null, null, null, null];

      // Re-insert existing body
      this._insertBody(qnode, existingBody, x0, y0, x1, y1, mx, my);
      // Insert new body
      this._insertBody(qnode, node, x0, y0, x1, y1, mx, my);
      return qnode;
    }

    // Internal node: route to correct child
    this._insertBody(qnode, node, x0, y0, x1, y1, mx, my);
    return qnode;
  }

  private _insertBody(
    qnode: QuadNode,
    node: GraphNode,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    mx: number,
    my: number,
  ) {
    const q = this.quadrant(node.x, node.y, mx, my);
    let cx0: number, cy0: number, cx1: number, cy1: number;
    switch (q) {
      case 0: cx0 = x0; cy0 = y0; cx1 = mx; cy1 = my; break; // NW
      case 1: cx0 = mx; cy0 = y0; cx1 = x1; cy1 = my; break; // NE
      case 2: cx0 = x0; cy0 = my; cx1 = mx; cy1 = y1; break; // SW
      default: cx0 = mx; cy0 = my; cx1 = x1; cy1 = y1; break; // SE
    }
    if (!qnode.children[q]) {
      qnode.children[q] = this.makeLeaf(node);
    } else {
      this._insert(qnode.children[q]!, node, cx0, cy0, cx1, cy1);
    }
  }

  /**
   * Accumulate center of mass and total strength for Barnes-Hut.
   * Must be called once per tick before force application.
   */
  accumulate(strengthFn: (node: GraphNode) => number) {
    if (this.root) {
      this._accumulate(this.root, strengthFn);
    }
  }

  private _accumulate(
    qnode: QuadNode,
    strengthFn: (node: GraphNode) => number,
  ) {
    if (!qnode.isInternal && qnode.body !== null) {
      // Leaf node
      qnode.strength = strengthFn(qnode.body);
      qnode.x = qnode.body.x;
      qnode.y = qnode.body.y;
      return;
    }

    // Internal node: accumulate from children
    let totalStrength = 0;
    let weightedX = 0;
    let weightedY = 0;

    for (let i = 0; i < 4; i++) {
      const child = qnode.children[i];
      if (!child) continue;
      this._accumulate(child, strengthFn);
      totalStrength += child.strength;
      weightedX += child.x * child.strength;
      weightedY += child.y * child.strength;
    }

    qnode.strength = totalStrength;
    if (totalStrength !== 0) {
      qnode.x = weightedX / totalStrength;
      qnode.y = weightedY / totalStrength;
    }
  }

  /**
   * Visit the quadtree for a given node (Barnes-Hut traversal).
   * callback returns true to recurse into children, false to skip.
   */
  visit(
    callback: (
      qnode: QuadNode,
      x0: number,
      y0: number,
      x1: number,
      y1: number,
    ) => boolean,
  ) {
    if (this.root) {
      this._visit(this.root, this.x0, this.y0, this.x1, this.y1, callback);
    }
  }

  private _visit(
    qnode: QuadNode,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    callback: (
      qnode: QuadNode,
      x0: number,
      y0: number,
      x1: number,
      y1: number,
    ) => boolean,
  ) {
    const shouldRecurse = callback(qnode, x0, y0, x1, y1);
    if (shouldRecurse && qnode.isInternal) {
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      if (qnode.children[0]) this._visit(qnode.children[0], x0, y0, mx, my, callback);
      if (qnode.children[1]) this._visit(qnode.children[1], mx, y0, x1, my, callback);
      if (qnode.children[2]) this._visit(qnode.children[2], x0, my, mx, y1, callback);
      if (qnode.children[3]) this._visit(qnode.children[3], mx, my, x1, y1, callback);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Quadtree for forceCollide (uses predicted positions)              */
/* ------------------------------------------------------------------ */

class CollisionQuadtree {
  root: QuadNode | null = null;
  x0 = 0;
  y0 = 0;
  x1 = 0;
  y1 = 0;

  constructor(nodes: GraphNode[]) {
    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const px = n.x + n.vx;
      const py = n.y + n.vy;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }

    const dx = maxX - minX;
    const dy = maxY - minY;
    const size = Math.max(dx, dy, 1) + 2;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.x0 = cx - size / 2;
    this.y0 = cy - size / 2;
    this.x1 = cx + size / 2;
    this.y1 = cy + size / 2;

    for (const n of nodes) {
      this.insert(n);
    }
  }

  private insert(node: GraphNode) {
    const px = node.x + node.vx;
    const py = node.y + node.vy;
    if (!this.root) {
      this.root = {
        x: px, y: py, strength: 0,
        children: [null, null, null, null],
        body: node, isInternal: false,
      };
      return;
    }
    this._insert(this.root, node, px, py, this.x0, this.y0, this.x1, this.y1);
  }

  private _insert(
    qnode: QuadNode, node: GraphNode,
    px: number, py: number,
    x0: number, y0: number, x1: number, y1: number,
  ) {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;

    if (!qnode.isInternal && qnode.body === null) {
      qnode.body = node;
      qnode.x = px;
      qnode.y = py;
      return;
    }

    if (!qnode.isInternal && qnode.body !== null) {
      const existingBody = qnode.body;
      const epx = existingBody.x + existingBody.vx;
      const epy = existingBody.y + existingBody.vy;
      qnode.body = null;
      qnode.isInternal = true;
      qnode.children = [null, null, null, null];
      this._insertAt(qnode, existingBody, epx, epy, x0, y0, x1, y1, mx, my);
      this._insertAt(qnode, node, px, py, x0, y0, x1, y1, mx, my);
      return;
    }

    this._insertAt(qnode, node, px, py, x0, y0, x1, y1, mx, my);
  }

  private _insertAt(
    qnode: QuadNode, node: GraphNode,
    px: number, py: number,
    x0: number, y0: number, x1: number, y1: number,
    mx: number, my: number,
  ) {
    const q = py < my ? (px < mx ? 0 : 1) : (px < mx ? 2 : 3);
    let cx0: number, cy0: number, cx1: number, cy1: number;
    switch (q) {
      case 0: cx0 = x0; cy0 = y0; cx1 = mx; cy1 = my; break;
      case 1: cx0 = mx; cy0 = y0; cx1 = x1; cy1 = my; break;
      case 2: cx0 = x0; cy0 = my; cx1 = mx; cy1 = y1; break;
      default: cx0 = mx; cy0 = my; cx1 = x1; cy1 = y1; break;
    }
    if (!qnode.children[q]) {
      qnode.children[q] = {
        x: px, y: py, strength: 0,
        children: [null, null, null, null],
        body: node, isInternal: false,
      };
    } else {
      this._insert(qnode.children[q]!, node, px, py, cx0, cy0, cx1, cy1);
    }
  }

  visit(
    callback: (
      qnode: QuadNode,
      x0: number, y0: number, x1: number, y1: number,
    ) => boolean,
  ) {
    if (this.root) {
      this._visit(this.root, this.x0, this.y0, this.x1, this.y1, callback);
    }
  }

  private _visit(
    qnode: QuadNode,
    x0: number, y0: number, x1: number, y1: number,
    callback: (q: QuadNode, x0: number, y0: number, x1: number, y1: number) => boolean,
  ) {
    const shouldRecurse = callback(qnode, x0, y0, x1, y1);
    if (shouldRecurse && qnode.isInternal) {
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      if (qnode.children[0]) this._visit(qnode.children[0], x0, y0, mx, my, callback);
      if (qnode.children[1]) this._visit(qnode.children[1], mx, y0, x1, my, callback);
      if (qnode.children[2]) this._visit(qnode.children[2], x0, my, mx, y1, callback);
      if (qnode.children[3]) this._visit(qnode.children[3], mx, my, x1, y1, callback);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  d3-force Simulation Parameters (Obsidian/Juggl ecosystem)         */
/* ------------------------------------------------------------------ */

const SIM_ALPHA_MIN = 0.001;
const SIM_ALPHA_DECAY = 1 - Math.pow(SIM_ALPHA_MIN, 1 / 300); // ~0.02276
const SIM_VELOCITY_DECAY = 0.4;

// forceManyBody
const MANY_BODY_STRENGTH = -30;
const MANY_BODY_THETA = 0.9;
const MANY_BODY_DISTANCE_MIN = 3;

// forceLink
const LINK_DISTANCE = 25;
const LINK_STRENGTH = 0.15;
const LINK_ITERATIONS = 1;

// forceCollide
const COLLIDE_RADIUS = 6;
const COLLIDE_STRENGTH = 0.7;
const COLLIDE_ITERATIONS = 1;

// forceX + forceY
const POSITION_STRENGTH_X = 0.15;
const POSITION_STRENGTH_Y = 0.15;

/* ------------------------------------------------------------------ */
/*  Jiggle helper                                                      */
/* ------------------------------------------------------------------ */

let _jiggleSeed = 1;
function jiggle(): number {
  // Small deterministic-ish random nudge when nodes coincide
  _jiggleSeed = (_jiggleSeed * 16807) % 2147483647;
  return ((_jiggleSeed / 2147483647) - 0.5) * 1e-6;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function V6Graph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Data state
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [relTypes, setRelTypes] = useState<RelType[]>([]);

  // Interaction state
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(true);
  const [minConnections, setMinConnections] = useState(0);

  // Refs for canvas animation loop (avoid re-renders)
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const relTypesRef = useRef<RelType[]>([]);
  const nodeMapRef = useRef<Map<string, GraphNode>>(new Map());
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map());
  const edgesByNodeRef = useRef<Map<string, GraphEdge[]>>(new Map());
  const gridRef = useRef(new SpatialGrid(50));

  // Camera
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const hoveredNodeRef = useRef<GraphNode | null>(null);
  const selectedNodeRef = useRef<GraphNode | null>(null);
  const searchQueryRef = useRef("");
  const searchMatchesRef = useRef<Set<string>>(new Set());
  const minConnectionsRef = useRef(0);

  // Drag state
  const dragRef = useRef<{
    type: "node" | "pan" | null;
    node: GraphNode | null;
    startX: number;
    startY: number;
    camStartX: number;
    camStartY: number;
  }>({ type: null, node: null, startX: 0, startY: 0, camStartX: 0, camStartY: 0 });

  // Simulation state (d3-force style)
  const simRef = useRef({
    alpha: 1,
    alphaMin: SIM_ALPHA_MIN,
    alphaDecay: SIM_ALPHA_DECAY,
    alphaTarget: 0,
    velocityDecay: SIM_VELOCITY_DECAY,
    running: true,
  });
  const animFrameRef = useRef<number>(0);

  // Topic cluster label positions
  const clusterLabelsRef = useRef<Map<string, { x: number; y: number; count: number }>>(new Map());

  /* ---------------------------------------------------------------- */
  /*  Data Loading                                                     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    async function loadData() {
      try {
        const dataRes = await fetch("/data.json");
        const data = await dataRes.json();
        const sessionsData: Session[] = data.sessions;
        setSessions(sessionsData);

        // Build node map
        const nodeMap = new Map<string, GraphNode>();
        const adjacency = new Map<string, Set<string>>();
        const edgesByNode = new Map<string, GraphEdge[]>();

        // Load precomputed positions from graph.json
        const graphRes = await fetch("/graph.json");
        const graphData = await graphRes.json();
        const precomputedPos = new Map<string, {x: number; y: number}>();
        for (const gn of graphData.nodes) {
          if (gn.x !== undefined && gn.y !== undefined) {
            precomputedPos.set(gn.id, { x: gn.x, y: gn.y });
          }
        }

        // Create graph nodes using precomputed positions
        for (const s of sessionsData) {
          const pos = precomputedPos.get(s.sessionCode);
          nodeMap.set(s.sessionCode, {
            id: s.sessionCode,
            session: s,
            x: pos?.x ?? (Math.random() - 0.5) * 500,
            y: pos?.y ?? (Math.random() - 0.5) * 500,
            vx: 0,
            vy: 0,
            fx: null,
            fy: null,
            radius: 4,
            color: getTopicColor(s.topic),
            topicName: getTopicName(s.topic),
            connections: 0,
            degree: 0,
          });
          adjacency.set(s.sessionCode, new Set());
          edgesByNode.set(s.sessionCode, []);
        }

        // Load relationship files
        const allEdges: GraphEdge[] = [];
        const relTypesList: RelType[] = [];

        const relResults = await Promise.allSettled(
          RELATIONSHIP_FILES.map((f) =>
            fetch(`/relationships/${f}.json`).then((r) => {
              if (!r.ok) throw new Error(`${r.status}`);
              return r.json() as Promise<RelationshipFile>;
            })
          )
        );

        for (const result of relResults) {
          if (result.status !== "fulfilled") continue;
          const rel = result.value;

          // Only keep edges where both nodes exist
          let edges = rel.edges.filter(
            (e) => nodeMap.has(e.source) && nodeMap.has(e.target)
          );

          // For very large relationship types, sample to keep total manageable
          if (edges.length > 3000) {
            edges.sort((a, b) => b.weight - a.weight);
            edges = edges.slice(0, 3000);
          }

          relTypesList.push({
            type: rel.type,
            label: rel.label,
            color: rel.color,
            count: edges.length,
            enabled: rel.type !== "same_subtopic" && rel.type !== "time_conflict",
          });

          for (const e of edges) {
            const ge: GraphEdge = {
              source: e.source,
              target: e.target,
              via: e.via,
              weight: e.weight,
              relType: rel.type,
              color: rel.color,
            };
            allEdges.push(ge);

            // Update connections
            const sn = nodeMap.get(e.source);
            const tn = nodeMap.get(e.target);
            if (sn) sn.connections++;
            if (tn) tn.connections++;

            // Adjacency
            adjacency.get(e.source)?.add(e.target);
            adjacency.get(e.target)?.add(e.source);

            // Edges by node
            edgesByNode.get(e.source)?.push(ge);
            edgesByNode.get(e.target)?.push(ge);
          }
        }

        // Compute degree (number of edges connected, for link bias calculation)
        // We count across ALL edges, not just enabled ones, for stable bias
        const degreeMap = new Map<string, number>();
        for (const e of allEdges) {
          degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
          degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
        }
        for (const [id, deg] of degreeMap) {
          const node = nodeMap.get(id);
          if (node) node.degree = deg;
        }

        // Set node radii based on connection count
        const maxConn = Math.max(1, ...Array.from(nodeMap.values()).map((n) => n.connections));
        for (const node of nodeMap.values()) {
          node.radius = 3 + (node.connections / maxConn) * 9;
          if (node.session.type === "Keynote") node.radius = Math.max(node.radius, 10);
        }

        const nodes = Array.from(nodeMap.values());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__graphNodes = nodes;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__graphEdges = allEdges;
        nodesRef.current = nodes;
        edgesRef.current = allEdges;
        nodeMapRef.current = nodeMap;
        adjacencyRef.current = adjacency;
        edgesByNodeRef.current = edgesByNode;
        relTypesRef.current = relTypesList;

        setRelTypes(relTypesList);
        setLoading(false);

        // Positions are precomputed — start simulation stopped
        simRef.current = {
          alpha: 0,
          alphaMin: SIM_ALPHA_MIN,
          alphaDecay: SIM_ALPHA_DECAY,
          alphaTarget: 0,
          velocityDecay: SIM_VELOCITY_DECAY,
          running: false,
        };
      } catch (err) {
        console.error("Failed to load data:", err);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Sync refs with state                                             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
    if (!searchQuery.trim()) {
      searchMatchesRef.current = new Set();
    } else {
      const q = searchQuery.toLowerCase();
      const matches = new Set<string>();
      for (const n of nodesRef.current) {
        if (
          n.session.title.toLowerCase().includes(q) ||
          n.session.sessionCode.toLowerCase().includes(q) ||
          n.topicName.toLowerCase().includes(q) ||
          n.session.speakers?.some((sp) => sp.name.toLowerCase().includes(q))
        ) {
          matches.add(n.id);
        }
      }
      searchMatchesRef.current = matches;
    }
  }, [searchQuery]);

  useEffect(() => {
    minConnectionsRef.current = minConnections;
  }, [minConnections]);

  /* ---------------------------------------------------------------- */
  /*  d3-force Simulation Tick                                        */
  /* ---------------------------------------------------------------- */

  const simulate = useCallback(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const relTypeMap = new Map(relTypesRef.current.map((r) => [r.type, r]));
    if (nodes.length === 0) return;

    const sim = simRef.current;

    // 1. Update alpha (velocity Verlet step 1)
    sim.alpha += (sim.alphaTarget - sim.alpha) * sim.alphaDecay;

    const alpha = sim.alpha;

    // Clamp any NaN positions from previous tick
    for (const n of nodes) {
      if (isNaN(n.x) || !isFinite(n.x)) n.x = Math.random() * 100;
      if (isNaN(n.y) || !isFinite(n.y)) n.y = Math.random() * 100;
      if (isNaN(n.vx) || !isFinite(n.vx)) n.vx = 0;
      if (isNaN(n.vy) || !isFinite(n.vy)) n.vy = 0;
    }

    // ---- FORCE: forceManyBody (Barnes-Hut quadtree repulsion) ----
    {
      const tree = new Quadtree(nodes);
      const strength = MANY_BODY_STRENGTH;
      const theta2 = MANY_BODY_THETA * MANY_BODY_THETA;
      const distanceMin2 = MANY_BODY_DISTANCE_MIN * MANY_BODY_DISTANCE_MIN;

      // Accumulate center of mass and total strength
      tree.accumulate(() => strength);

      for (const node of nodes) {
        tree.visit((qnode, x0, y0, x1, y1) => {
          if (qnode.strength === 0) return false; // skip empty

          let dx = qnode.x - node.x;
          let dy = qnode.y - node.y;
          const w = x1 - x0;

          // If this is a leaf node with the same body, skip
          if (!qnode.isInternal && qnode.body === node) return false;

          let dist2 = dx * dx + dy * dy;

          // Barnes-Hut: if w/sqrt(dist2) < theta (i.e., w^2/dist2 < theta^2), treat as single body
          if (!qnode.isInternal || (w * w / dist2) < theta2) {
            // Apply force if not too close
            if (dist2 < distanceMin2) {
              // Jiggle coincident nodes
              dx = jiggle();
              dy = jiggle();
              dist2 = dx * dx + dy * dy;
            }

            // F = strength * alpha / dist2, applied along (dx, dy)/dist
            const dist = Math.sqrt(dist2);
            const force = qnode.strength * alpha / dist2;
            node.vx += dx / dist * force;
            node.vy += dy / dist * force;
            return false; // don't recurse
          }

          return true; // recurse into children
        });
      }
    }

    // ---- FORCE: forceLink (spring attraction along edges) ----
    // Cap active edges per tick to prevent overload
    let linkCount = 0;
    const MAX_LINKS_PER_TICK = 4000;
    for (let iter = 0; iter < LINK_ITERATIONS; iter++) {
      linkCount = 0;
      for (const e of edges) {
        if (linkCount >= MAX_LINKS_PER_TICK) break;
        const rt = relTypeMap.get(e.relType);
        if (!rt?.enabled) continue;
        linkCount++;

        const sourceNode = nodeMapRef.current.get(e.source);
        const targetNode = nodeMapRef.current.get(e.target);
        if (!sourceNode || !targetNode) continue;

        let dx = targetNode.x + targetNode.vx - (sourceNode.x + sourceNode.vx);
        let dy = targetNode.y + targetNode.vy - (sourceNode.y + sourceNode.vy);

        // Jiggle if coincident
        if (dx === 0 && dy === 0) {
          dx = jiggle();
          dy = jiggle();
        }

        const d = Math.sqrt(dx * dx + dy * dy);
        const l = (d - LINK_DISTANCE) / d * alpha * LINK_STRENGTH;

        // Bias: nodes with fewer connections move more
        const sourceDeg = sourceNode.degree || 1;
        const targetDeg = targetNode.degree || 1;
        const bias = sourceDeg / (sourceDeg + targetDeg);

        targetNode.vx -= dx * l * bias;
        targetNode.vy -= dy * l * bias;
        sourceNode.vx += dx * l * (1 - bias);
        sourceNode.vy += dy * l * (1 - bias);
      }
    }

    // ---- FORCE: forceCollide (overlap prevention via quadtree) ----
    for (let iter = 0; iter < COLLIDE_ITERATIONS; iter++) {
      const collisionTree = new CollisionQuadtree(nodes);

      for (const node of nodes) {
        const ri = COLLIDE_RADIUS;
        const xi = node.x + node.vx;
        const yi = node.y + node.vy;

        collisionTree.visit((qnode, x0, y0, x1, y1) => {
          if (qnode.body && qnode.body !== node) {
            const rj = COLLIDE_RADIUS;
            const rSum = ri + rj;
            let dx = xi - (qnode.body.x + qnode.body.vx);
            let dy = yi - (qnode.body.y + qnode.body.vy);
            let dist2 = dx * dx + dy * dy;

            if (dist2 < rSum * rSum) {
              if (dx === 0 && dy === 0) {
                dx = jiggle();
                dy = jiggle();
                dist2 = dx * dx + dy * dy;
              }
              const dist = Math.sqrt(dist2);
              const overlap = (rSum - dist) / dist * COLLIDE_STRENGTH;
              const totalR = ri + rj;
              const ratioI = ri / totalR;
              const ratioJ = rj / totalR;
              node.vx += dx * overlap * ratioJ;
              node.vy += dy * overlap * ratioJ;
              qnode.body.vx -= dx * overlap * ratioI;
              qnode.body.vy -= dy * overlap * ratioI;
            }
          }

          // Should we recurse? Only if the quadrant could contain overlapping nodes
          if (qnode.isInternal) {
            // Check if quadrant is close enough that it could overlap
            const closest_x = Math.max(x0, Math.min(xi, x1));
            const closest_y = Math.max(y0, Math.min(yi, y1));
            const ddx = xi - closest_x;
            const ddy = yi - closest_y;
            return ddx * ddx + ddy * ddy < (ri + COLLIDE_RADIUS) * (ri + COLLIDE_RADIUS);
          }

          return false;
        });
      }
    }

    // ---- FORCE: forceCenter (centering) ----
    {
      let sumX = 0, sumY = 0;
      const n = nodes.length;
      for (const node of nodes) {
        sumX += node.x;
        sumY += node.y;
      }
      const avgX = sumX / n;
      const avgY = sumY / n;
      // Center target = (0, 0) - translate all nodes
      for (const node of nodes) {
        node.x -= avgX;
        node.y -= avgY;
      }
    }

    // ---- FORCE: forceX + forceY (gentle position attraction toward center) ----
    {
      const targetX = 0;
      const targetY = 0;
      for (const node of nodes) {
        node.vx += (targetX - node.x) * POSITION_STRENGTH_X * alpha;
        node.vy += (targetY - node.y) * POSITION_STRENGTH_Y * alpha;
      }
    }

    // 2. Apply velocity decay and update positions (Velocity Verlet step 2)
    for (const node of nodes) {
      // Respect fixed positions (used during dragging)
      if (node.fx !== null) {
        node.x = node.fx;
        node.vx = 0;
      } else {
        node.vx *= sim.velocityDecay;
        node.x += node.vx;
      }
      if (node.fy !== null) {
        node.y = node.fy;
        node.vy = 0;
      } else {
        node.vy *= sim.velocityDecay;
        node.y += node.vy;
      }
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Cluster Label Positions                                          */
  /* ---------------------------------------------------------------- */

  const updateClusterLabels = useCallback(() => {
    const clusters = new Map<string, { sumX: number; sumY: number; count: number }>();
    for (const n of nodesRef.current) {
      if (n.connections < minConnectionsRef.current) continue;
      const c = clusters.get(n.topicName);
      if (c) {
        c.sumX += n.x;
        c.sumY += n.y;
        c.count++;
      } else {
        clusters.set(n.topicName, { sumX: n.x, sumY: n.y, count: 1 });
      }
    }
    const labels = new Map<string, { x: number; y: number; count: number }>();
    for (const [topic, data] of clusters) {
      if (data.count < 5) continue;
      labels.set(topic, {
        x: data.sumX / data.count,
        y: data.sumY / data.count,
        count: data.count,
      });
    }
    clusterLabelsRef.current = labels;
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Canvas Rendering & Animation Loop                                */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (loading) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let mounted = true;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function worldToScreen(wx: number, wy: number): [number, number] {
      const cam = cameraRef.current;
      const cx = canvas!.width / 2;
      const cy = canvas!.height / 2;
      return [(wx - cam.x) * cam.zoom + cx, (wy - cam.y) * cam.zoom + cy];
    }

    function screenToWorld(sx: number, sy: number): [number, number] {
      const cam = cameraRef.current;
      const cx = canvas!.width / 2;
      const cy = canvas!.height / 2;
      return [(sx - cx) / cam.zoom + cam.x, (sy - cy) / cam.zoom + cam.y];
    }

    // Build spatial grid for hover
    function rebuildGrid() {
      const grid = gridRef.current;
      grid.clear();
      for (const n of nodesRef.current) {
        if (n.connections < minConnectionsRef.current) continue;
        grid.insert(n);
      }
    }

    let tickCount = 0;

    function render() {
      if (!ctx || !canvas || !mounted) return;

      const sim = simRef.current;
      const cam = cameraRef.current;
      const w = canvas.width;
      const h = canvas.height;

      // Run simulation tick if active (d3-force style, only during drag)
      if (sim.running && sim.alpha >= sim.alphaMin) {
        simulate();
        tickCount++;
        rebuildGrid();
        if (tickCount % 20 === 0) updateClusterLabels();
        if (sim.alpha < sim.alphaMin) {
          sim.running = false;
        }
      }

      // Auto-fit camera on first frame
      if (tickCount === 0) {
        tickCount = 1;
        const nodes = nodesRef.current;
        if (nodes.length > 0) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const n of nodes) {
            if (isNaN(n.x) || isNaN(n.y)) continue;
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
          }
          if (isFinite(minX) && isFinite(maxX)) {
            const rangeX = maxX - minX || 1;
            const rangeY = maxY - minY || 1;
            const fitZoom = Math.min(w * 0.8 / rangeX, h * 0.8 / rangeY, 2);
            cameraRef.current.x = (minX + maxX) / 2;
            cameraRef.current.y = (minY + maxY) / 2;
            cameraRef.current.zoom = fitZoom;
          }
        }
        rebuildGrid();
        updateClusterLabels();
      }

      // Clear
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);

      // Viewport in world coordinates
      const [vwLeft, vwTop] = screenToWorld(0, 0);
      const [vwRight, vwBottom] = screenToWorld(w, h);
      const vpMargin = 50 / cam.zoom;

      const hovered = hoveredNodeRef.current;
      const selected = selectedNodeRef.current;
      const hasSearch = searchQueryRef.current.trim().length > 0;
      const searchMatches = searchMatchesRef.current;
      const hoveredAdj = hovered ? adjacencyRef.current.get(hovered.id) : null;
      const relTypeMap = new Map(relTypesRef.current.map((r) => [r.type, r]));
      const minConn = minConnectionsRef.current;

      // Count visible edges
      let visibleEdgeCount = 0;

      // Draw edges
      ctx.lineCap = "round";
      for (const e of edgesRef.current) {
        const rt = relTypeMap.get(e.relType);
        if (!rt?.enabled) continue;

        const sn = nodeMapRef.current.get(e.source);
        const tn = nodeMapRef.current.get(e.target);
        if (!sn || !tn) continue;
        if (sn.connections < minConn || tn.connections < minConn) continue;

        // Viewport culling: skip if both endpoints are outside viewport
        const inView =
          (sn.x >= vwLeft - vpMargin && sn.x <= vwRight + vpMargin &&
            sn.y >= vwTop - vpMargin && sn.y <= vwBottom + vpMargin) ||
          (tn.x >= vwLeft - vpMargin && tn.x <= vwRight + vpMargin &&
            tn.y >= vwTop - vpMargin && tn.y <= vwBottom + vpMargin);
        if (!inView) continue;

        visibleEdgeCount++;

        let alpha = 0.08 + Math.min(e.weight * 0.05, 0.15);

        // Dimming logic
        if (hovered) {
          const isConnected =
            e.source === hovered.id || e.target === hovered.id;
          alpha = isConnected ? 0.6 : 0.02;
        } else if (hasSearch) {
          const isMatch = searchMatches.has(e.source) || searchMatches.has(e.target);
          alpha = isMatch ? 0.3 : 0.02;
        }

        const [sx, sy] = worldToScreen(sn.x, sn.y);
        const [tx, ty] = worldToScreen(tn.x, tn.y);

        const [r, g, b] = hexToRgb(e.color);
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = Math.max(0.5, cam.zoom * (0.5 + e.weight * 0.3));
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }

      // Draw cluster labels (behind nodes)
      if (cam.zoom > 0.15 && cam.zoom < 2) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const [topic, pos] of clusterLabelsRef.current) {
          const [sx, sy] = worldToScreen(pos.x, pos.y);
          if (sx < -200 || sx > w + 200 || sy < -200 || sy > h + 200) continue;
          const color = TOPIC_COLORS[topic] || TOPIC_COLORS["Other"];
          const [r, g, b] = hexToRgb(color);
          const fontSize = Math.max(10, Math.min(18, 14 * cam.zoom));
          ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.fillStyle = `rgba(${r},${g},${b},0.25)`;
          ctx.fillText(topic, sx, sy);
        }
      }

      // Draw nodes
      for (const node of nodesRef.current) {
        if (node.connections < minConn) continue;

        // Viewport culling
        if (
          node.x < vwLeft - vpMargin || node.x > vwRight + vpMargin ||
          node.y < vwTop - vpMargin || node.y > vwBottom + vpMargin
        ) continue;

        const [sx, sy] = worldToScreen(node.x, node.y);
        const r = node.radius * cam.zoom;
        if (r < 0.3) continue;

        const [cr, cg, cb] = hexToRgb(node.color);
        let nodeAlpha = 0.85;

        // Dimming
        if (hovered) {
          const isHovered = node.id === hovered.id;
          const isConnected = hoveredAdj?.has(node.id) ?? false;
          nodeAlpha = isHovered ? 1 : isConnected ? 0.9 : 0.12;
        } else if (hasSearch) {
          nodeAlpha = searchMatches.has(node.id) ? 1 : 0.1;
        }

        // Glow for featured types or hovered/selected
        const isHoveredNode = node.id === hovered?.id;
        const isSelectedNode = node.id === selected?.id;
        const isFeatured = FEATURED_TYPES.has(node.session.type);
        const isSearchMatch = hasSearch && searchMatches.has(node.id);

        if ((isFeatured || isHoveredNode || isSelectedNode || isSearchMatch) && nodeAlpha > 0.3) {
          ctx.save();
          const glowR = r * (isHoveredNode ? 4 : isSearchMatch ? 3.5 : 2.5);
          const grad = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, glowR);
          const glowAlpha = isHoveredNode ? 0.4 : isSearchMatch ? 0.35 : 0.15;
          grad.addColorStop(0, `rgba(${cr},${cg},${cb},${glowAlpha})`);
          grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Node circle
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${nodeAlpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(r, 1), 0, Math.PI * 2);
        ctx.fill();

        // Border for selected
        if (isSelectedNode) {
          ctx.strokeStyle = `rgba(255,255,255,0.9)`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(r, 1) + 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Tooltip for hovered node
      if (hovered) {
        const [sx, sy] = worldToScreen(hovered.x, hovered.y);
        const s = hovered.session;
        const lines = [
          s.title,
          `${s.type} | ${hovered.topicName}`,
        ];
        if (s.speakers?.length) {
          lines.push(s.speakers.map((sp) => sp.name).join(", "));
        }
        lines.push(`${hovered.connections} connections`);

        const padding = 10;
        const lineHeight = 18;
        ctx.font = "13px -apple-system, BlinkMacSystemFont, sans-serif";
        const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const boxW = maxWidth + padding * 2;
        const boxH = lines.length * lineHeight + padding * 2;

        let tx = sx + 15;
        let ty = sy - boxH / 2;
        if (tx + boxW > w - 10) tx = sx - boxW - 15;
        if (ty < 10) ty = 10;
        if (ty + boxH > h - 10) ty = h - boxH - 10;

        ctx.fillStyle = "rgba(20,20,35,0.92)";
        ctx.strokeStyle = "rgba(100,100,140,0.5)";
        ctx.lineWidth = 1;
        const cornerR = 6;
        ctx.beginPath();
        ctx.roundRect(tx, ty, boxW, boxH, cornerR);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = TEXT_PRIMARY;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        for (let i = 0; i < lines.length; i++) {
          ctx.font = i === 0 ? "bold 13px -apple-system, sans-serif" : "12px -apple-system, sans-serif";
          ctx.fillStyle = i === 0 ? TEXT_PRIMARY : TEXT_SECONDARY;
          ctx.fillText(lines[i], tx + padding, ty + padding + i * lineHeight, maxWidth);
        }
      }

      // Stats bar at bottom center
      const enabledTypes = relTypesRef.current.filter((r) => r.enabled).length;
      const totalEdges = edgesRef.current.length;
      const totalNodes = nodesRef.current.filter(n => n.connections >= minConn).length;
      const statsText = `${totalNodes} nodes  |  ${totalEdges.toLocaleString()} total edges  |  ${visibleEdgeCount.toLocaleString()} visible edges  |  ${enabledTypes}/${relTypesRef.current.length} relationship types`;
      ctx.font = "12px -apple-system, BlinkMacSystemFont, monospace";
      const stW = ctx.measureText(statsText).width + 30;
      ctx.fillStyle = "rgba(20,20,35,0.85)";
      ctx.beginPath();
      ctx.roundRect(w / 2 - stW / 2, h - 36, stW, 28, 6);
      ctx.fill();
      ctx.fillStyle = TEXT_SECONDARY;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(statsText, w / 2, h - 22);

      animFrameRef.current = requestAnimationFrame(render);
    }

    animFrameRef.current = requestAnimationFrame(render);

    /* -------------------------------------------------------------- */
    /*  Mouse / Touch Events                                           */
    /* -------------------------------------------------------------- */

    function handleMouseMove(ev: MouseEvent) {
      const cam = cameraRef.current;
      const [wx, wy] = screenToWorld(ev.clientX, ev.clientY);

      if (dragRef.current.type === "pan") {
        cam.x = dragRef.current.camStartX - (ev.clientX - dragRef.current.startX) / cam.zoom;
        cam.y = dragRef.current.camStartY - (ev.clientY - dragRef.current.startY) / cam.zoom;
        return;
      }

      if (dragRef.current.type === "node" && dragRef.current.node) {
        // d3-force drag: set fx/fy to mouse position
        dragRef.current.node.fx = wx;
        dragRef.current.node.fy = wy;
        return;
      }

      // Hover detection using spatial grid
      const hitRadius = Math.max(15, 15 / cam.zoom);
      const candidates = gridRef.current.query(wx, wy, hitRadius);
      let closest: GraphNode | null = null;
      let closestDist = Infinity;
      const minConn = minConnectionsRef.current;
      for (const n of candidates) {
        if (n.connections < minConn) continue;
        const dx = n.x - wx;
        const dy = n.y - wy;
        const d = Math.sqrt(dx * dx + dy * dy);
        const effectiveR = Math.max(n.radius, 8 / cam.zoom);
        if (d < effectiveR && d < closestDist) {
          closest = n;
          closestDist = d;
        }
      }
      hoveredNodeRef.current = closest;
      if (canvas) canvas.style.cursor = closest ? "pointer" : "grab";
    }

    function handleMouseDown(ev: MouseEvent) {
      if (ev.button !== 0) return;
      // Check if clicking on UI panels
      const target = ev.target as HTMLElement;
      if (target !== canvas) return;

      const hovered = hoveredNodeRef.current;
      if (hovered) {
        dragRef.current = { type: "node", node: hovered, startX: ev.clientX, startY: ev.clientY, camStartX: 0, camStartY: 0 };
        // d3-force drag start: fix node position and reheat
        const [wx, wy] = screenToWorld(ev.clientX, ev.clientY);
        hovered.fx = wx;
        hovered.fy = wy;
        // Reheat simulation to alpha 0.3 for interactive dragging
        simRef.current.alpha = Math.max(simRef.current.alpha, 0.3);
        simRef.current.alphaTarget = 0;
        simRef.current.running = true;
      } else {
        const cam = cameraRef.current;
        dragRef.current = { type: "pan", node: null, startX: ev.clientX, startY: ev.clientY, camStartX: cam.x, camStartY: cam.y };
        if (canvas) canvas.style.cursor = "grabbing";
      }
    }

    function handleMouseUp(ev: MouseEvent) {
      const drag = dragRef.current;
      if (drag.type === "node" && drag.node) {
        // If barely moved, treat as click
        const dx = ev.clientX - drag.startX;
        const dy = ev.clientY - drag.startY;
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
          setSelectedNode((prev) =>
            prev?.id === drag.node!.id ? null : drag.node
          );
        }
        // d3-force drag end: clear fx/fy
        drag.node.fx = null;
        drag.node.fy = null;
      } else if (drag.type === "pan") {
        const dx = ev.clientX - drag.startX;
        const dy = ev.clientY - drag.startY;
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
          // Clicked on empty space - deselect
          setSelectedNode(null);
        }
      }
      dragRef.current = { type: null, node: null, startX: 0, startY: 0, camStartX: 0, camStartY: 0 };
      if (canvas) canvas.style.cursor = hoveredNodeRef.current ? "pointer" : "grab";
    }

    function handleWheel(ev: WheelEvent) {
      ev.preventDefault();
      const cam = cameraRef.current;
      const factor = ev.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.05, Math.min(5, cam.zoom * factor));

      // Zoom toward mouse position
      const [wx, wy] = screenToWorld(ev.clientX, ev.clientY);
      cam.zoom = newZoom;
      const [wx2, wy2] = screenToWorld(ev.clientX, ev.clientY);
      cam.x -= wx2 - wx;
      cam.y -= wy2 - wy;
    }

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      mounted = false;
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [loading, simulate, updateClusterLabels]);

  /* ---------------------------------------------------------------- */
  /*  Relationship toggle                                              */
  /* ---------------------------------------------------------------- */

  const toggleRelType = useCallback((type: string) => {
    setRelTypes((prev) => {
      const next = prev.map((r) =>
        r.type === type ? { ...r, enabled: !r.enabled } : r
      );
      relTypesRef.current = next;
      // Reheat to alpha 0.3 for a gentle re-settle (not 1.0)
      simRef.current.alpha = 0.3;
      simRef.current.alphaTarget = 0;
      simRef.current.running = true;
      return next;
    });
  }, []);

  const showAll = useCallback(() => {
    setRelTypes((prev) => {
      const next = prev.map((r) => ({ ...r, enabled: true }));
      relTypesRef.current = next;
      simRef.current.alpha = 0.3;
      simRef.current.alphaTarget = 0;
      simRef.current.running = true;
      return next;
    });
  }, []);

  const hideAll = useCallback(() => {
    setRelTypes((prev) => {
      const next = prev.map((r) => ({ ...r, enabled: false }));
      relTypesRef.current = next;
      simRef.current.alpha = 0.3;
      simRef.current.alphaTarget = 0;
      simRef.current.running = true;
      return next;
    });
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Detail panel: connected sessions grouped by relationship type    */
  /* ---------------------------------------------------------------- */

  const getLinkedSessions = useCallback(
    (nodeId: string) => {
      const edges = edgesByNodeRef.current.get(nodeId) || [];
      const groups = new Map<string, { label: string; color: string; items: { node: GraphNode; via: string }[] }>();

      for (const e of edges) {
        const rt = relTypesRef.current.find((r) => r.type === e.relType);
        if (!rt) continue;
        const otherId = e.source === nodeId ? e.target : e.source;
        const otherNode = nodeMapRef.current.get(otherId);
        if (!otherNode) continue;

        if (!groups.has(e.relType)) {
          groups.set(e.relType, { label: rt.label, color: rt.color, items: [] });
        }
        // Deduplicate
        const group = groups.get(e.relType)!;
        if (!group.items.find((i) => i.node.id === otherId)) {
          group.items.push({ node: otherNode, via: e.via });
        }
      }

      return groups;
    },
    []
  );

  /* ---------------------------------------------------------------- */
  /*  Navigate to linked session                                       */
  /* ---------------------------------------------------------------- */

  const navigateToNode = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    // Pan camera to center on this node
    cameraRef.current.x = node.x;
    cameraRef.current.y = node.y;
  }, []);

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
          <div style={{ fontSize: 18, marginBottom: 8 }}>Loading Knowledge Graph...</div>
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
      ref={containerRef}
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
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          cursor: "grab",
        }}
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
            background: "rgba(30,30,46,0.92)",
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
            {searchMatchesRef.current.size} matches
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
          background: "rgba(30,30,46,0.9)",
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
            background: "rgba(30,30,46,0.92)",
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

          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 12,
            }}
          >
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

          {relTypes.map((rt) => (
            <label
              key={rt.type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                cursor: "pointer",
                opacity: rt.enabled ? 1 : 0.4,
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
                  background: rt.enabled ? rt.color : "transparent",
                  flexShrink: 0,
                  transition: "background 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {rt.enabled && (
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <path d="M2 5 L4 7 L8 3" stroke="#000" strokeWidth="1.5" fill="none" />
                  </svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: TEXT_PRIMARY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
          ))}

          {/* Min connections slider */}
          <div style={{ marginTop: 16, borderTop: `1px solid ${PANEL_BORDER}`, paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 8 }}>
              Min Connections: <span style={{ color: TEXT_PRIMARY, fontFamily: "monospace" }}>{minConnections}</span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              value={minConnections}
              onChange={(e) => setMinConnections(parseInt(e.target.value))}
              style={{
                width: "100%",
                accentColor: "#00e5ff",
              }}
            />
          </div>

          {/* Topic legend */}
          <div style={{ marginTop: 16, borderTop: `1px solid ${PANEL_BORDER}`, paddingTop: 12 }}>
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
            background: "rgba(30,30,46,0.95)",
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
            <div
              style={{
                display: "inline-block",
                padding: "3px 8px",
                background: `${selectedNode.color}22`,
                border: `1px solid ${selectedNode.color}44`,
                borderRadius: 4,
                fontSize: 11,
                color: selectedNode.color,
                fontFamily: "monospace",
                marginBottom: 8,
              }}
            >
              {selectedNode.session.sessionCode}
            </div>

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
              {selectedNode.session.title}
            </h2>

            {/* Meta info */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              <span
                style={{
                  padding: "3px 8px",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 4,
                  fontSize: 11,
                  color: TEXT_SECONDARY,
                }}
              >
                {selectedNode.session.type}
              </span>
              <span
                style={{
                  padding: "3px 8px",
                  background: `${selectedNode.color}15`,
                  borderRadius: 4,
                  fontSize: 11,
                  color: selectedNode.color,
                }}
              >
                {selectedNode.topicName}
              </span>
              {selectedNode.session.technicalLevel && (
                <span
                  style={{
                    padding: "3px 8px",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 4,
                    fontSize: 11,
                    color: TEXT_SECONDARY,
                  }}
                >
                  {selectedNode.session.technicalLevel}
                </span>
              )}
            </div>

            {/* Speakers */}
            {selectedNode.session.speakers && selectedNode.session.speakers.length > 0 && (
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
                {selectedNode.session.speakers.map((sp, i) => (
                  <div key={i} style={{ padding: "4px 0", fontSize: 13 }}>
                    <span style={{ color: TEXT_PRIMARY }}>{sp.name}</span>
                    {sp.role && (
                      <span style={{ color: TEXT_DIM, fontSize: 11, marginLeft: 6 }}>
                        {sp.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Schedule */}
            {selectedNode.session.schedule && selectedNode.session.schedule.length > 0 && (
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
                {selectedNode.session.schedule.map((sc, i) => (
                  <div key={i} style={{ fontSize: 12, color: TEXT_SECONDARY, padding: "2px 0" }}>
                    {sc.dayName} {sc.date} | {sc.startTime} - {sc.endTime}
                    {sc.room && <span style={{ color: TEXT_DIM }}> | {sc.room}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Abstract */}
            {selectedNode.session.abstract && (
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
                  {stripHtml(selectedNode.session.abstract).slice(0, 500)}
                  {(selectedNode.session.abstract?.length ?? 0) > 500 && "..."}
                </div>
              </div>
            )}

            {/* Additional info */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
              {selectedNode.session.industry && (
                <span style={{ padding: "3px 8px", background: "rgba(255,255,255,0.04)", borderRadius: 4, fontSize: 11, color: TEXT_DIM }}>
                  {selectedNode.session.industry}
                </span>
              )}
              {selectedNode.session.nvidiaTechnology && (
                <span style={{ padding: "3px 8px", background: "rgba(118,185,0,0.1)", borderRadius: 4, fontSize: 11, color: "#76b900" }}>
                  {selectedNode.session.nvidiaTechnology}
                </span>
              )}
            </div>

            {/* Connected sessions - Obsidian-style backlinks */}
            <div style={{ borderTop: `1px solid ${PANEL_BORDER}`, paddingTop: 16 }}>
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
                return Array.from(groups.entries()).map(([relType, group]) => (
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
                      <span style={{ fontSize: 11, fontWeight: 600, color: group.color }}>
                        {group.label}
                      </span>
                      <span style={{ fontSize: 10, color: TEXT_DIM }}>
                        ({group.items.length})
                      </span>
                    </div>
                    {group.items.slice(0, 20).map((item) => (
                      <button
                        key={item.node.id}
                        onClick={() => navigateToNode(item.node)}
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
                          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                          e.currentTarget.style.borderColor = PANEL_BORDER;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                          e.currentTarget.style.borderColor = "transparent";
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "start", gap: 6 }}>
                          <div
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: item.node.color,
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
                              {item.node.session.title}
                            </div>
                            <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 2 }}>
                              {item.node.session.sessionCode} | via: {item.via}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                    {group.items.length > 20 && (
                      <div style={{ fontSize: 10, color: TEXT_DIM, padding: "4px 8px" }}>
                        ...and {group.items.length - 20} more
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcut hint */}
      <div
        style={{
          position: "absolute",
          bottom: 50,
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
