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
  coding: '#00a854',
  debugging: '#f87171',
  prompting: '#0099b8',
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
    <div className="bg-surface border border-white/5 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-2">Session Timeline</h3>
      <p className="text-xs text-neutral-600 mb-4">Activity progression over time (minutes)</p>

      <div className="flex gap-4 mb-4 flex-wrap">
        {Object.entries(categoryColors).map(([cat, color]) => (
          <div key={cat} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
            <span className="text-xs text-neutral-500 capitalize">{cat}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} layout="vertical" barSize={20}>
          <XAxis type="number" tick={{ fill: '#555', fontSize: 10 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fill: '#888', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '12px',
              color: '#ddd',
            }}
            formatter={(value) => [`${typeof value === 'number' ? value.toFixed(1) : value} min`, 'Duration']}
          />
          <Bar dataKey="duration" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={categoryColors[entry.category] || '#555'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
