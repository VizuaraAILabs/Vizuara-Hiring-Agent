'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface CategoryBreakdownProps {
  data: Record<string, number>;
}

const categoryColors: Record<string, string> = {
  planning: '#a78bfa',
  coding: '#22d3ee',
  debugging: '#f87171',
  prompting: '#4ade80',
  reviewing: '#fbbf24',
  other: '#64748b',
};

export default function CategoryBreakdown({ data }: CategoryBreakdownProps) {
  const chartData = Object.entries(data).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: Math.round(value * 10) / 10,
    color: categoryColors[name.toLowerCase()] || categoryColors.other,
  }));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-2">Activity Distribution</h3>
      <p className="text-xs text-slate-500 mb-4">Time spent across activity categories</p>

      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#e2e8f0',
            }}
            formatter={(value) => [`${value}%`, 'Percentage']}
          />
          <Legend
            formatter={(value: string) => (
              <span style={{ color: '#94a3b8', fontSize: '12px' }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
