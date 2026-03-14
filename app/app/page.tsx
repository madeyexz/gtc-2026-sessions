import Link from "next/link";

const views = [
  {
    id: "v1-timeline",
    title: "Timeline River",
    builder: "Claude",
    description:
      "A flowing horizontal timeline where sessions appear as colored stones in a river. The riverbed widens where sessions are dense. Hover to preview, click to add to your schedule.",
    gradient: "from-cyan-500 to-blue-600",
    icon: "\u{1F30A}",
  },
  {
    id: "v2-constellation",
    title: "Topic Constellation",
    builder: "Codex",
    description:
      "An interactive star-map. Sessions are stars clustered into constellations by topic. Brighter stars are keynotes. Lines connect sessions sharing speakers. Search to find your stars.",
    gradient: "from-violet-500 to-purple-700",
    icon: "\u2728",
  },
  {
    id: "v3-matrix",
    title: "Decision Matrix",
    builder: "Gemini",
    description:
      "A Bret Victor-inspired dense information display. Topics x Days matrix with everything visible at a glance. No navigation, no pagination -- just answers.",
    gradient: "from-emerald-500 to-teal-700",
    icon: "\u{1F9E0}",
  },
  {
    id: "v4-heatmap",
    title: "Heatmap Explorer",
    builder: "Claude",
    description:
      "A dense heatmap grid -- days as rows, time slots as columns. Cell intensity shows session density. Filter by topic to reveal patterns. Click to drill into any time slot.",
    gradient: "from-orange-500 to-red-600",
    icon: "\u{1F525}",
  },
  {
    id: "v5-swipe",
    title: "Swipe Deck",
    builder: "Claude",
    description:
      "Tinder for conferences. Swipe right to add sessions to your schedule, left to skip. Smart sorting shows your interests first. Conflict detection built in.",
    gradient: "from-pink-500 to-rose-600",
    icon: "\u{1F498}",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <p className="text-sm font-mono tracking-widest text-green-400 mb-3 uppercase">
            NVIDIA GTC 2026 &middot; San Jose, CA &middot; March 15-19
          </p>
          <h1 className="text-5xl md:text-7xl font-bold mb-4 bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
            Session Explorer
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
            895 sessions. 5 ways to explore. Each visualization built by a
            different AI &mdash; Claude, Codex, and Gemini &mdash; to help you decide what
            to attend.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {views.map((view) => (
            <Link
              key={view.id}
              href={`/${view.id}`}
              className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 hover:border-zinc-600 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/50"
            >
              <div
                className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${view.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}
              />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl">{view.icon}</span>
                  <span className="text-xs font-mono px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
                    Built by {view.builder}
                  </span>
                </div>

                <h2
                  className={`text-xl font-bold mb-2 bg-gradient-to-r ${view.gradient} bg-clip-text text-transparent`}
                >
                  {view.title}
                </h2>

                <p className="text-sm text-zinc-400 leading-relaxed">
                  {view.description}
                </p>

                <div className="mt-4 flex items-center text-sm text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  <span>Explore</span>
                  <svg
                    className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </Link>
          ))}

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 flex flex-col justify-center">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Total Sessions</span>
                <span className="font-mono text-zinc-300">895</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Session Types</span>
                <span className="font-mono text-zinc-300">19</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Conference Days</span>
                <span className="font-mono text-zinc-300">5</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Topics</span>
                <span className="font-mono text-zinc-300">13</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Data Source</span>
                <span className="font-mono text-zinc-300">NVIDIA API</span>
              </div>
              <hr className="border-zinc-800" />
              <p className="text-zinc-600 text-xs">
                Scraped from the GTC 2026 attendee portal network API with full
                metadata including speakers, schedule, topics, and more.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
