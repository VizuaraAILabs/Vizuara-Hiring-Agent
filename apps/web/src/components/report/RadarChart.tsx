'use client';

import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface RadarChartProps {
  scores: {
    problem_decomposition: number;
    first_principles: number;
    creativity: number;
    iteration_quality: number;
    debugging_approach: number;
    architecture_thinking: number;
    communication_clarity: number;
    efficiency: number;
  };
}

const dimensionLabels: Record<string, string> = {
  problem_decomposition: 'Problem Decomposition',
  first_principles: 'First Principles',
  creativity: 'Creativity',
  iteration_quality: 'Iteration Quality',
  debugging_approach: 'Debugging',
  architecture_thinking: 'Architecture',
  communication_clarity: 'Communication',
  efficiency: 'Efficiency',
};

export default function RadarChart({ scores }: RadarChartProps) {
  const data = Object.entries(scores).map(([key, value]) => ({
    dimension: dimensionLabels[key] || key,
    score: value,
    fullMark: 100,
  }));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Skill Dimensions</h3>
      <ResponsiveContainer width="100%" height={400}>
        <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickCount={5}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#e2e8f0',
            }}
            formatter={(value) => [`${typeof value === 'number' ? value.toFixed(0) : value}`, 'Score']}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#22d3ee"
            fill="#22d3ee"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
