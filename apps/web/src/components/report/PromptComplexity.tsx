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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-2">Prompt Complexity Over Time</h3>
      <p className="text-xs text-slate-500 mb-4">
        How the candidate&apos;s prompting sophistication evolved during the session
      </p>

      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="complexityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="sequence"
            tick={{ fill: '#64748b', fontSize: 10 }}
            label={{ value: 'Prompt #', position: 'bottom', fill: '#64748b', fontSize: 11 }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#64748b', fontSize: 10 }}
            label={{ value: 'Complexity', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#e2e8f0',
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
            stroke="#8b5cf6"
            fill="url(#complexityGradient)"
            strokeWidth={2}
            dot={{ fill: '#8b5cf6', r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
