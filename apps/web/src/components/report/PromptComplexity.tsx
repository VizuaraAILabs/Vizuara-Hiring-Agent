'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { PromptComplexityEntry } from '@/types';

interface PromptComplexityProps {
  data: PromptComplexityEntry[];
}

export default function PromptComplexity({ data }: PromptComplexityProps) {
  return (
    <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-2">Prompt Complexity Over Time</h3>
      <p className="text-xs text-neutral-600 mb-4">
        How the candidate&apos;s prompting sophistication evolved during the session
      </p>

      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="complexityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00a854" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#00a854" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
          <XAxis
            dataKey="sequence"
            tick={{ fill: '#555', fontSize: 10 }}
            label={{ value: 'Prompt #', position: 'bottom', fill: '#555', fontSize: 11 }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#555', fontSize: 10 }}
            label={{ value: 'Complexity', angle: -90, position: 'insideLeft', fill: '#555', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '12px',
              color: '#ddd',
            }}
            labelFormatter={(val) => `Prompt #${val}`}
            formatter={(value, _name, props) => {
              const v = typeof value === 'number' ? value : 0;
              const label = (props as { payload?: PromptComplexityEntry })?.payload?.label || '';
              return [`${v.toFixed(0)} — ${label}`, 'Complexity'];
            }}
          />
          <Area
            type="monotone"
            dataKey="complexity"
            stroke="#00a854"
            fill="url(#complexityGradient)"
            strokeWidth={2}
            dot={{ fill: '#00a854', r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
