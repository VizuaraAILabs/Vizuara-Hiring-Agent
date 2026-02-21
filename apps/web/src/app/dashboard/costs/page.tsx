'use client';

import { useEffect, useState } from 'react';
import CostSummaryCards from '@/components/costs/CostSummaryCards';
import DailyCostChart from '@/components/costs/DailyCostChart';
import ProviderBreakdownChart from '@/components/costs/ProviderBreakdownChart';
import CumulativeSpendChart from '@/components/costs/CumulativeSpendChart';
import SessionCostTable from '@/components/costs/SessionCostTable';
import CostSettingsPanel from '@/components/costs/CostSettingsPanel';
import type { DailyCostSummary, ProviderBreakdown, SessionCostSummary, CostSettings } from '@/types';

interface CostData {
  dailyCosts: DailyCostSummary[];
  providerBreakdown: ProviderBreakdown[];
  sessionCosts: SessionCostSummary[];
  totals: {
    total_spend: number;
    total_input_tokens: number;
    total_output_tokens: number;
    session_count: number;
  };
  settings: CostSettings | null;
}

const timeRanges = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

export default function CostsPage() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  async function fetchData(d: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/costs?days=${d}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch cost data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData(days);
  }, [days]);

  async function handleSaveSettings(settings: Partial<CostSettings>) {
    const res = await fetch('/api/costs/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      fetchData(days);
    }
  }

  const totalSpend = Number(data?.totals?.total_spend ?? 0);
  const sessionCount = Number(data?.totals?.session_count ?? 0);
  const totalTokens = Number(data?.totals?.total_input_tokens ?? 0) + Number(data?.totals?.total_output_tokens ?? 0);
  const avgCost = sessionCount > 0 ? totalSpend / sessionCount : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-serif italic text-white">Cost Monitoring</h1>
          <p className="text-neutral-500 mt-1">Track API and infrastructure spend</p>
        </div>
        <div className="flex gap-1 bg-[#111] border border-white/5 rounded-xl p-1">
          {timeRanges.map((range) => (
            <button
              key={range.days}
              onClick={() => setDays(range.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                days === range.days
                  ? 'bg-[#00a854]/10 text-[#00a854]'
                  : 'text-neutral-500 hover:text-white'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-[#111] border border-white/5 rounded-2xl p-6 animate-pulse">
                <div className="h-3 bg-white/5 rounded w-1/2 mb-3" />
                <div className="h-7 bg-white/5 rounded w-2/3" />
              </div>
            ))}
          </div>
          <div className="bg-[#111] border border-white/5 rounded-2xl p-6 animate-pulse h-80" />
        </div>
      ) : (
        <div className="space-y-6">
          <CostSummaryCards
            totalSpend={totalSpend}
            sessionCount={sessionCount}
            avgCostPerSession={avgCost}
            totalTokens={totalTokens}
          />

          <DailyCostChart data={data?.dailyCosts ?? []} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProviderBreakdownChart data={data?.providerBreakdown ?? []} />
            <CumulativeSpendChart data={data?.dailyCosts ?? []} />
          </div>

          <SessionCostTable data={data?.sessionCosts ?? []} />

          <CostSettingsPanel
            settings={data?.settings ?? null}
            onSave={handleSaveSettings}
          />
        </div>
      )}
    </div>
  );
}
