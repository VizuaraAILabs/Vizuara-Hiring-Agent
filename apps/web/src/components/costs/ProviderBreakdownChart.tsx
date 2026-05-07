'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ProviderBreakdown } from '@/types';

interface ProviderBreakdownChartProps {
  data: ProviderBreakdown[];
}

const providerColors: Record<string, string> = {
  anthropic: '#f97316',
  gemini: '#3b82f6',
  docker: '#a855f7',
  vps: '#6b7280',
};

export default function ProviderBreakdownChart({ data }: ProviderBreakdownChartProps) {
  const chartData = data
    .filter((d) => Number(d.total_cost) > 0)
    .map((d) => ({
      name: d.provider.charAt(0).toUpperCase() + d.provider.slice(1),
      value: Math.round(Number(d.total_cost) * 10000) / 10000,
      color: providerColors[d.provider] || '#555',
    }));

  if (chartData.length === 0) {
    return (
      <div className="bg-surface border border-white/5 rounded-2xl p-6">
        <h3 className="text-lg font-serif italic text-white mb-1">Provider Breakdown</h3>
        <p className="text-xs text-neutral-600 mb-4">Cost share per provider</p>
        <p className="text-neutral-600 text-sm text-center py-12">No cost data yet</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-white/5 rounded-2xl p-6">
      <h3 className="text-lg font-serif italic text-white mb-1">Provider Breakdown</h3>
      <p className="text-xs text-neutral-600 mb-4">Cost share per provider</p>

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
            formatter={(value) => [`$${Number(value ?? 0).toFixed(4)}`, 'Cost']}
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
