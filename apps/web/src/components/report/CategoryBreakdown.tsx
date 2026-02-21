'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface CategoryBreakdownProps {
  data: Record<string, number>;
}

const categoryColors: Record<string, string> = {
  planning: '#a78bfa',
  coding: '#00a854',
  debugging: '#f87171',
  prompting: '#0099b8',
  reviewing: '#fbbf24',
  other: '#555',
};

export default function CategoryBreakdown({ data }: CategoryBreakdownProps) {
  const chartData = Object.entries(data).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: Math.round(value * 10) / 10,
    color: categoryColors[name.toLowerCase()] || categoryColors.other,
  }));

  return (
    <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-2">Activity Distribution</h3>
      <p className="text-xs text-neutral-600 mb-4">Time spent across activity categories</p>

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
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '12px',
              color: '#ddd',
            }}
            formatter={(value) => [`${value}%`, 'Percentage']}
          />
          <Legend
            formatter={(value: string) => (
              <span style={{ color: '#888', fontSize: '12px' }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
