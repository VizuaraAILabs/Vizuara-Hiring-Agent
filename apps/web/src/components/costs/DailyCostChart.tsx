'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { DailyCostSummary } from '@/types';

interface DailyCostChartProps {
  data: DailyCostSummary[];
}

const providerColors: Record<string, string> = {
  anthropic: '#f97316',
  gemini: '#3b82f6',
  docker: '#a855f7',
  vps: '#6b7280',
};

export default function DailyCostChart({ data }: DailyCostChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
      <h3 className="text-lg font-serif italic text-white mb-1">Daily Costs</h3>
      <p className="text-xs text-neutral-600 mb-4">Stacked cost by provider per day</p>

      <div className="flex gap-4 mb-4 flex-wrap">
        {Object.entries(providerColors).map(([provider, color]) => (
          <div key={provider} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
            <span className="text-xs text-neutral-500 capitalize">{provider}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} />
          <YAxis
            tick={{ fill: '#555', fontSize: 10 }}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '12px',
              color: '#ddd',
            }}
            formatter={(value) => [`$${Number(value ?? 0).toFixed(4)}`, '']}
          />
          <Legend
            formatter={(value: string) => (
              <span style={{ color: '#888', fontSize: '12px', textTransform: 'capitalize' }}>{value}</span>
            )}
          />
          <Area type="monotone" dataKey="anthropic" stackId="1" stroke={providerColors.anthropic} fill={providerColors.anthropic} fillOpacity={0.6} />
          <Area type="monotone" dataKey="gemini" stackId="1" stroke={providerColors.gemini} fill={providerColors.gemini} fillOpacity={0.6} />
          <Area type="monotone" dataKey="docker" stackId="1" stroke={providerColors.docker} fill={providerColors.docker} fillOpacity={0.6} />
          <Area type="monotone" dataKey="vps" stackId="1" stroke={providerColors.vps} fill={providerColors.vps} fillOpacity={0.6} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
