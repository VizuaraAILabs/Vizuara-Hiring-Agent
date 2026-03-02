'use client';

import type { SessionCostSummary } from '@/types';

interface SessionCostTableProps {
  data: SessionCostSummary[];
}

function formatCost(value: number): string {
  const num = Number(value);
  return num < 0.01 ? `$${num.toFixed(4)}` : `$${num.toFixed(2)}`;
}

export default function SessionCostTable({ data }: SessionCostTableProps) {
  if (data.length === 0) {
    return (
      <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
        <h3 className="text-lg font-serif italic text-white mb-1">Session Costs</h3>
        <p className="text-xs text-neutral-600 mb-4">Per-session cost breakdown</p>
        <p className="text-neutral-600 text-sm text-center py-8">No sessions tracked yet</p>
      </div>
    );
  }

  return (
    <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
      <h3 className="text-lg font-serif italic text-white mb-1">Session Costs</h3>
      <p className="text-xs text-neutral-600 mb-4">Per-session cost breakdown</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-neutral-500 font-medium py-2 pr-4">Candidate</th>
              <th className="text-left text-neutral-500 font-medium py-2 pr-4">Challenge</th>
              <th className="text-right text-neutral-500 font-medium py-2 pr-4">Anthropic</th>
              <th className="text-right text-neutral-500 font-medium py-2 pr-4">Gemini</th>
              <th className="text-right text-neutral-500 font-medium py-2 pr-4">Docker</th>
              <th className="text-right text-neutral-500 font-medium py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.session_id} className="border-b border-white/5 last:border-0">
                <td className="py-3 pr-4">
                  <div className="text-white">{row.candidate_name}</div>
                  <div className="text-neutral-600 text-xs">{row.candidate_email}</div>
                </td>
                <td className="text-neutral-400 py-3 pr-4">{row.challenge_title}</td>
                <td className="text-right text-orange-400 py-3 pr-4">
                  {formatCost(row.anthropic_cost)}
                  {row.estimated && <span className="text-yellow-500 text-[10px] ml-1" title="Token count was estimated, not parsed from Claude Code output">~</span>}
                </td>
                <td className="text-right text-blue-400 py-3 pr-4">{formatCost(row.gemini_cost)}</td>
                <td className="text-right text-purple-400 py-3 pr-4">{formatCost(row.docker_cost)}</td>
                <td className="text-right text-white font-medium py-3">{formatCost(row.total_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
