'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { TimelineEntry } from '@/types';

interface TimelineChartProps {
  data: TimelineEntry[];
}

const categoryColors: Record<string, string> = {
  planning: '#a78bfa',
  coding: '#22d3ee',
  debugging: '#f87171',
  prompting: '#4ade80',
  reviewing: '#fbbf24',
};

export default function TimelineChart({ data }: TimelineChartProps) {
  const chartData = data.map((entry, i) => ({
    name: entry.activity,
    start: entry.start_time,
    duration: entry.end_time - entry.start_time,
    category: entry.category,
    index: i,
  }));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-2">Session Timeline</h3>
      <p className="text-xs text-slate-500 mb-4">Activity progression over time (minutes)</p>

      <div className="flex gap-4 mb-4 flex-wrap">
        {Object.entries(categoryColors).map(([cat, color]) => (
          <div key={cat} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
            <span className="text-xs text-slate-400 capitalize">{cat}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} layout="vertical" barSize={20}>
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#e2e8f0',
            }}
            formatter={(value) => [`${typeof value === 'number' ? value.toFixed(1) : value} min`, 'Duration']}
          />
          <Bar dataKey="duration" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={categoryColors[entry.category] || '#64748b'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
