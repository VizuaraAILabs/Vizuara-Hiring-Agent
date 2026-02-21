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
    <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Skill Dimensions</h3>
      <ResponsiveContainer width="100%" height={400}>
        <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="#222" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: '#888', fontSize: 11 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: '#555', fontSize: 10 }}
            tickCount={5}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '12px',
              color: '#ddd',
            }}
            formatter={(value) => [`${typeof value === 'number' ? value.toFixed(0) : value}`, 'Score']}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#00a854"
            fill="#00a854"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
