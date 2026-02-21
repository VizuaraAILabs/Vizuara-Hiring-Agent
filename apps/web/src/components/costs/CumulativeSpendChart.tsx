'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { DailyCostSummary } from '@/types';

interface CumulativeSpendChartProps {
  data: DailyCostSummary[];
}

export default function CumulativeSpendChart({ data }: CumulativeSpendChartProps) {
  let running = 0;
  const chartData = data.map((d) => {
    running += Number(d.total);
    return {
      date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      cumulative: Math.round(running * 10000) / 10000,
    };
  });

  return (
    <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
      <h3 className="text-lg font-serif italic text-white mb-1">Cumulative Spend</h3>
      <p className="text-xs text-neutral-600 mb-4">Running total over time</p>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
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
            formatter={(value) => [`$${Number(value ?? 0).toFixed(4)}`, 'Total']}
          />
          <Line
            type="monotone"
            dataKey="cumulative"
            stroke="#00a854"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
