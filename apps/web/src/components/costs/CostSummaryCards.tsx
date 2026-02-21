'use client';

interface CostSummaryCardsProps {
  totalSpend: number;
  sessionCount: number;
  avgCostPerSession: number;
  totalTokens: number;
}

function formatUSD(value: number): string {
  return value < 1
    ? `$${value.toFixed(4)}`
    : `$${value.toFixed(2)}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

const cards = [
  { key: 'totalSpend', label: 'Total Spend', format: formatUSD },
  { key: 'sessionCount', label: 'Sessions Tracked', format: (v: number) => v.toString() },
  { key: 'avgCostPerSession', label: 'Avg Cost / Session', format: formatUSD },
  { key: 'totalTokens', label: 'Total Tokens', format: formatTokens },
] as const;

export default function CostSummaryCards(props: CostSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className="bg-[#111] border border-white/5 rounded-2xl p-6"
        >
          <p className="text-xs text-neutral-500 mb-1">{card.label}</p>
          <p className="text-2xl font-semibold text-white">
            {card.format(props[card.key])}
          </p>
        </div>
      ))}
    </div>
  );
}
