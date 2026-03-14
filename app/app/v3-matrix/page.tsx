'use client';

import React, { useState, useEffect, useMemo } from 'react';

interface Speaker {
  name: string;
  role: string;
}

interface Schedule {
  date: string;
  dayName: string;
  startTime: string;
  endTime: string;
  room: string;
}

interface Session {
  sessionCode: string;
  title: string;
  type: string;
  topic: string;
  technicalLevel: string;
  schedule: Schedule[];
  speakers?: Speaker[];
}

interface EventData {
  event: string;
  sessions: Session[];
}

export default function DecisionMatrix() {
  const [data, setData] = useState<EventData | null>(null);
  const [techFilter, setTechFilter] = useState<string>('All');
  const [hoveredSpeaker, setHoveredSpeaker] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/data.json')
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching data:', err);
        setLoading(false);
      });
  }, []);

  const { matrix, days, mainTopics, filteredSessions } = useMemo(() => {
    if (!data) return { matrix: {}, days: [], mainTopics: [], filteredSessions: [] };

    // Normalize technical level filter
    const sessions = data.sessions.filter((s) => {
      if (techFilter === 'All') return true;
      if (techFilter === 'Business' && s.technicalLevel?.includes('Beginner')) return true;
      if (techFilter === 'Intermediate' && s.technicalLevel?.includes('Intermediate')) return true;
      if (techFilter === 'Advanced' && s.technicalLevel?.includes('Advanced')) return true;
      return false;
    });

    const daySet = new Set<string>();
    const topicSet = new Set<string>();
    const matrixData: Record<string, Record<string, Session[]>> = {};

    sessions.forEach((s) => {
      const rawTopic = Array.isArray(s.topic) ? s.topic[0] : s.topic;
      const mainTopic = rawTopic?.split(' - ')[0]?.split(' / ')[0] || 'Other';
      topicSet.add(mainTopic);

      s.schedule?.forEach((sch) => {
        daySet.add(sch.dayName);
        if (!matrixData[mainTopic]) matrixData[mainTopic] = {};
        if (!matrixData[mainTopic][sch.dayName]) matrixData[mainTopic][sch.dayName] = [];
        matrixData[mainTopic][sch.dayName].push(s);
      });
    });

    const sortedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].filter((d) => daySet.has(d));
    const sortedTopics = Array.from(topicSet).sort();

    return { 
      matrix: matrixData, 
      days: sortedDays, 
      mainTopics: sortedTopics,
      filteredSessions: sessions 
    };
  }, [data, techFilter]);

  const recommendations = useMemo(() => {
    if (interests.length === 0) return [];
    return filteredSessions
      .filter((s) => { const t = Array.isArray(s.topic) ? s.topic.join(' ') : (s.topic || ''); return interests.some(interest => t.toLowerCase().includes(interest.toLowerCase()) || s.title?.toLowerCase().includes(interest.toLowerCase())); })
      .slice(0, 5);
  }, [filteredSessions, interests]);

  if (loading) return <div className="min-h-screen bg-black text-white p-8 flex items-center justify-center font-mono">LOADING DATA...</div>;
  if (!data) return <div className="min-h-screen bg-black text-white p-8 font-mono">ERROR LOADING DATA</div>;

  const techLevels = ['All', 'Business', 'Intermediate', 'Advanced'];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 font-sans selection:bg-green-500/30">
      {/* HEADER / CONTROL BAR */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10 p-4">
        <div className="max-w-[1800px] mx-auto flex flex-col gap-4">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-xl font-bold tracking-tighter text-white uppercase italic">Session Matrix Explorer <span className="text-green-500">2026</span></h1>
              <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">NVIDIA GTC // {data.sessions.length} SESSIONS CAPTURED</p>
            </div>
            
            <div className="flex gap-1 bg-white/5 p-1 rounded-sm border border-white/10">
              {techLevels.map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setTechFilter(lvl)}
                  className={`px-3 py-1 text-[10px] uppercase tracking-wider transition-all rounded-sm ${
                    techFilter === lvl ? 'bg-green-600 text-white font-bold' : 'hover:bg-white/10 text-gray-400'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* RECOMMENDATION BAR */}
          <div className="bg-white/5 border border-white/10 p-3 rounded-sm">
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-gray-500 mb-2">
              <span>What should I attend?</span>
              <div className="flex gap-2">
                {['Generative AI', 'Robotics', 'Omniverse', 'CUDA', 'Networking'].map(t => (
                  <button 
                    key={t}
                    onClick={() => setInterests(prev => prev.includes(t) ? prev.filter(i => i !== t) : [...prev, t])}
                    className={`px-2 py-0.5 border border-white/10 rounded-full transition-colors ${interests.includes(t) ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'hover:bg-white/10'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {interests.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {recommendations.length > 0 ? recommendations.map(s => (
                  <div key={s.sessionCode} className="flex-shrink-0 w-64 bg-green-500/5 border border-green-500/20 p-2 rounded-sm group hover:border-green-500/40 transition-colors">
                    <div className="text-[9px] text-green-500/70 font-bold mb-1 uppercase tracking-tighter">{s.type}</div>
                    <div className="text-xs font-semibold leading-tight line-clamp-2 text-white">{s.title}</div>
                  </div>
                )) : (
                  <div className="text-xs text-gray-600 italic">No direct matches for selected interests...</div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-600 italic">Select interests above to see intelligent recommendations based on your profile.</div>
            )}
          </div>
        </div>
      </header>

      {/* MATRIX */}
      <main className="p-4 max-w-[1800px] mx-auto">
        <div className="relative overflow-x-auto border border-white/10">
          <table className="w-full border-collapse table-fixed min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/20">
                <th className="w-48 bg-black/40 p-4 text-left text-[10px] uppercase tracking-widest text-gray-500 sticky left-0 z-20 backdrop-blur-sm">Topic Matrix</th>
                {days.map((day) => (
                  <th key={day} className="p-4 text-center border-l border-white/10 bg-black/20">
                    <div className="text-xs font-bold text-white uppercase tracking-tighter">{day}</div>
                    <div className="text-[9px] text-gray-500 uppercase font-light">March 2026</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mainTopics.map((topic) => {
                // Calculate max height based on sessions count in this row
                const rowSessionsCount = days.reduce((acc, day) => acc + (matrix[topic]?.[day]?.length || 0), 0);
                if (rowSessionsCount === 0) return null;

                return (
                  <tr key={topic} className="border-b border-white/10 group">
                    <th className="p-4 text-left bg-black/40 sticky left-0 z-20 backdrop-blur-sm border-r border-white/10 align-top">
                      <div className="text-[11px] font-bold text-gray-300 group-hover:text-green-500 transition-colors uppercase leading-tight">{topic}</div>
                      <div className="text-[9px] text-gray-600 mt-2 font-mono uppercase tracking-tighter">{rowSessionsCount} Sessions</div>
                    </th>
                    {days.map((day) => {
                      const sessions = matrix[topic]?.[day] || [];
                      return (
                        <td key={day} className="p-1 border-l border-white/5 align-top bg-white/[0.01]">
                          <div className="flex flex-wrap gap-1 content-start h-full min-h-[100px]">
                            {sessions.map((s) => {
                              const isHighlighted = hoveredSpeaker && s.speakers?.some(sp => sp.name === hoveredSpeaker);
                              const isKeynote = s.type?.toLowerCase().includes('keynote') || s.type?.toLowerCase().includes('featured');
                              const isSponsored = s.type?.toLowerCase().includes('sponsored');

                              return (
                                <div
                                  key={s.sessionCode}
                                  onMouseEnter={() => s.speakers?.[0] && setHoveredSpeaker(s.speakers[0].name)}
                                  onMouseLeave={() => setHoveredSpeaker(null)}
                                  className={`
                                    flex-grow p-1.5 rounded-sm border transition-all cursor-pointer relative
                                    ${isKeynote ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:border-white/30 text-white'}
                                    ${isHighlighted ? 'ring-2 ring-green-500 ring-offset-1 ring-offset-black z-10 scale-[1.02]' : ''}
                                    ${isSponsored ? 'opacity-60 grayscale' : ''}
                                    min-w-[120px] max-w-full
                                  `}
                                  style={{ flexBasis: 'calc(33% - 4px)' }}
                                >
                                  <div className="flex justify-between items-start mb-1">
                                    <span className={`text-[8px] font-bold uppercase tracking-tighter ${isKeynote ? 'text-black' : 'text-green-500'}`}>
                                      {s.schedule?.[0]?.startTime}
                                    </span>
                                    <span className={`text-[7px] opacity-60 font-mono`}>{s.sessionCode}</span>
                                  </div>
                                  <h3 className={`text-[10px] leading-tight line-clamp-2 ${isKeynote ? 'font-black' : isSponsored ? 'font-light' : 'font-semibold'}`}>
                                    {s.title}
                                  </h3>
                                  {s.speakers && s.speakers.length > 0 && (
                                    <div className="mt-1 flex items-center gap-1">
                                      <div className={`w-1 h-1 rounded-full ${isKeynote ? 'bg-black' : 'bg-gray-500'}`}></div>
                                      <span className="text-[8px] opacity-70 truncate">{s.speakers[0].name}</span>
                                    </div>
                                  )}
                                  
                                  {/* Technical Level Indicator */}
                                  <div className={`absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ${
                                    s.technicalLevel?.includes('Beginner') ? 'bg-blue-500' :
                                    s.technicalLevel?.includes('Intermediate') ? 'bg-yellow-500' :
                                    'bg-red-500'
                                  }`} />
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* FOOTER LEGEND */}
      <footer className="p-8 border-t border-white/10 mt-12 bg-black/40 text-[9px] text-gray-500 uppercase tracking-widest">
        <div className="max-w-[1800px] mx-auto flex flex-wrap gap-8 justify-between items-center">
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-white border border-white"></div>
              <span>Featured / Keynote</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-white/10 border border-white/20"></div>
              <span>Regular Talk</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-white/5 border border-white/10 opacity-60"></div>
              <span>Sponsored / Training</span>
            </div>
          </div>

          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span>Business / Beginner</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
              <span>Intermediate</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <span>Advanced</span>
            </div>
          </div>

          <div className="italic">
            Design inspired by Magic Ink // Bret Victor Principles
          </div>
        </div>
      </footer>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
      `}</style>
    </div>
  );
}
