'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminCompany {
  id: string;
  name: string;
  email: string;
  plan: string;
  trial_ends_at: string | null;
  created_at: string;
  contact_name: string | null;
  contact_title: string | null;
  challenge_count: number;
  total_sessions: number;
  pending_sessions: number;
}

interface AdminChallenge {
  id: string;
  company_id: string;
  title: string;
  description: string;
  time_limit_min: number;
  is_active: number;
  created_at: string;
  company_name: string;
  candidate_count: number;
}

interface AdminCompanyCost {
  company_id: string;
  company_name: string;
  plan: string;
  total_spend: number;
  session_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  anthropic_cost: number;
  gemini_cost: number;
  docker_cost: number;
  vps_cost: number;
}

interface AdminCostTotals {
  total_spend: number;
  total_sessions: number;
  total_input_tokens: number;
  total_output_tokens: number;
  anthropic_cost: number;
  gemini_cost: number;
  docker_cost: number;
  vps_cost: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const PLAN_COLORS: Record<string, string> = {
  trial: 'text-neutral-400 bg-white/5 border-white/10',
  starter: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  growth: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  enterprise: 'text-primary bg-primary/10 border-primary/20',
};

function PlanBadge({ plan }: { plan: string }) {
  const cls = PLAN_COLORS[plan] ?? PLAN_COLORS.trial;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border capitalize ${cls}`}>
      {plan}
    </span>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#111] border border-white/5 rounded-2xl p-5">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-neutral-600 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Tab: Companies ───────────────────────────────────────────────────────────

function CompaniesTab({
  onSelectCompany,
}: {
  onSelectCompany: (id: string) => void;
}) {
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/companies')
      .then((r) => r.json())
      .then((d) => setCompanies(d.companies ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-[#111] border border-white/5 rounded-2xl p-5 animate-pulse h-16" />
        ))}
      </div>
    );
  }

  const totalPending = companies.reduce((a, c) => a + c.pending_sessions, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Companies" value={String(companies.length)} />
        <SummaryCard label="Pending assessments" value={String(totalPending)} sub="pending + active" />
        <SummaryCard label="Total sessions" value={String(companies.reduce((a, c) => a + c.total_sessions, 0))} />
        <SummaryCard label="Total challenges" value={String(companies.reduce((a, c) => a + c.challenge_count, 0))} />
      </div>

      <div className="bg-[#111] border border-white/5 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left">
              <th className="px-5 py-3 text-xs font-medium text-neutral-500">Company</th>
              <th className="px-5 py-3 text-xs font-medium text-neutral-500">Contact</th>
              <th className="px-5 py-3 text-xs font-medium text-neutral-500">Plan</th>
              <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Challenges</th>
              <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Total sessions</th>
              <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Pending</th>
              <th className="px-5 py-3 text-xs font-medium text-neutral-500">Joined</th>
              <th className="px-5 py-3 text-xs font-medium text-neutral-500"></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id} className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                <td className="px-5 py-3.5">
                  <p className="font-medium text-white">{company.name}</p>
                  <p className="text-xs text-neutral-500">{company.email}</p>
                </td>
                <td className="px-5 py-3.5">
                  {company.contact_name ? (
                    <>
                      <p className="text-neutral-200 text-sm">{company.contact_name}</p>
                      {company.contact_title && (
                        <p className="text-xs text-neutral-500">{company.contact_title}</p>
                      )}
                    </>
                  ) : (
                    <span className="text-neutral-600">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <PlanBadge plan={company.plan} />
                </td>
                <td className="px-5 py-3.5 text-right text-neutral-300">{company.challenge_count}</td>
                <td className="px-5 py-3.5 text-right text-neutral-300">{company.total_sessions}</td>
                <td className="px-5 py-3.5 text-right">
                  {company.pending_sessions > 0 ? (
                    <span className="text-amber-400 font-medium">{company.pending_sessions}</span>
                  ) : (
                    <span className="text-neutral-600">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-neutral-500">{fmtDate(company.created_at)}</td>
                <td className="px-5 py-3.5">
                  <button
                    onClick={() => onSelectCompany(company.id)}
                    className="text-xs text-primary hover:text-primary-light transition-colors cursor-pointer"
                  >
                    View challenges
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {companies.length === 0 && (
          <p className="text-center text-neutral-600 py-12">No companies found</p>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Challenges ──────────────────────────────────────────────────────────

function ChallengesTab({ initialCompanyId }: { initialCompanyId?: string }) {
  const [challenges, setChallenges] = useState<AdminChallenge[]>([]);
  const [adminCompanyId, setAdminCompanyId] = useState<string>('');
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [filterOwner, setFilterOwner] = useState<'all' | 'admin' | string>(
    initialCompanyId ?? 'all'
  );
  const [loading, setLoading] = useState(true);

  // Fetch company list for dropdown
  useEffect(() => {
    fetch('/api/admin/companies')
      .then((r) => r.json())
      .then((d) => setCompanies((d.companies ?? []).map((c: AdminCompany) => ({ id: c.id, name: c.name }))))
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    let url = '/api/admin/challenges';
    if (filterOwner === 'admin') url += '?owner=admin';
    else if (filterOwner !== 'all') url += `?company_id=${filterOwner}`;

    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setChallenges(d.challenges ?? []);
        setAdminCompanyId(d.adminCompanyId ?? '');
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filterOwner]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        {/* Filter controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'admin'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterOwner(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                filterOwner === f
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-neutral-500 bg-white/5 border border-white/5 hover:text-white'
              }`}
            >
              {f === 'all' ? 'All companies' : 'Platform (Admin)'}
            </button>
          ))}
          <select
            value={filterOwner !== 'all' && filterOwner !== 'admin' ? filterOwner : ''}
            onChange={(e) => setFilterOwner(e.target.value || 'all')}
            className="px-3 py-1.5 rounded-lg text-xs text-neutral-300 bg-[#111] border-2 border-white/10 focus:border-primary/50 outline-none cursor-pointer"
          >
            <option value="">Filter by company…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <Link
          href="/dashboard/challenges/new"
          className="bg-primary hover:bg-primary-light text-black px-4 py-2 rounded-xl text-xs font-semibold transition-all btn-glow whitespace-nowrap cursor-pointer"
        >
          + New Challenge
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#111] border border-white/5 rounded-2xl p-5 animate-pulse h-16" />
          ))}
        </div>
      ) : (
        <div className="bg-[#111] border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                <th className="px-5 py-3 text-xs font-medium text-neutral-500">Challenge</th>
                <th className="px-5 py-3 text-xs font-medium text-neutral-500">Company</th>
                <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Assessments</th>
                <th className="px-5 py-3 text-xs font-medium text-neutral-500">Duration</th>
                <th className="px-5 py-3 text-xs font-medium text-neutral-500">Created</th>
                <th className="px-5 py-3 text-xs font-medium text-neutral-500"></th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((ch) => (
                <tr key={ch.id} className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-white">{ch.title}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    {ch.company_id === adminCompanyId ? (
                      <span className="inline-flex items-center gap-1 text-xs text-primary">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                        Platform
                      </span>
                    ) : (
                      <span className="text-neutral-400">{ch.company_name}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-neutral-200 font-medium">{ch.candidate_count}</span>
                  </td>
                  <td className="px-5 py-3.5 text-neutral-500">{ch.time_limit_min} min</td>
                  <td className="px-5 py-3.5 text-neutral-500">{fmtDate(ch.created_at)}</td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/dashboard/challenges/${ch.id}`}
                      className="text-xs text-primary hover:text-primary-light transition-colors cursor-pointer"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {challenges.length === 0 && (
            <p className="text-center text-neutral-600 py-12">No challenges found</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Costs ───────────────────────────────────────────────────────────────

function CostsTab() {
  const [companyCosts, setCompanyCosts] = useState<AdminCompanyCost[]>([]);
  const [totals, setTotals] = useState<AdminCostTotals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/costs')
      .then((r) => r.json())
      .then((d) => {
        setCompanyCosts(d.companyCosts ?? []);
        setTotals(d.totals ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-[#111] border border-white/5 rounded-2xl p-5 animate-pulse h-20" />
          ))}
        </div>
        <div className="bg-[#111] border border-white/5 rounded-2xl p-5 animate-pulse h-48" />
      </div>
    );
  }

  const totalTokens = totals
    ? Number(totals.total_input_tokens) + Number(totals.total_output_tokens)
    : 0;

  return (
    <div className="space-y-5">
      {/* Platform totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Total platform spend" value={fmt(Number(totals?.total_spend ?? 0))} />
        <SummaryCard label="Total sessions" value={String(totals?.total_sessions ?? 0)} />
        <SummaryCard label="Total tokens" value={fmtTokens(totalTokens)} sub="input + output" />
        <SummaryCard
          label="Avg cost / session"
          value={
            totals && Number(totals.total_sessions) > 0
              ? fmt(Number(totals.total_spend) / Number(totals.total_sessions))
              : '$0.00'
          }
        />
      </div>

      {/* Provider breakdown summary */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(
            [
              { key: 'anthropic_cost', label: 'Anthropic' },
              { key: 'gemini_cost', label: 'Gemini' },
              { key: 'docker_cost', label: 'Docker' },
              { key: 'vps_cost', label: 'VPS' },
            ] as { key: keyof AdminCostTotals; label: string }[]
          ).map(({ key, label }) => (
            <div key={key} className="bg-[#111] border border-white/5 rounded-2xl p-4">
              <p className="text-xs text-neutral-500 mb-1">{label}</p>
              <p className="text-lg font-semibold text-white">{fmt(Number(totals[key]))}</p>
            </div>
          ))}
        </div>
      )}

      {/* Per-company table */}
      <div className="bg-[#111] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-medium text-white">Per-company breakdown</h3>
          <p className="text-xs text-neutral-500 mt-0.5">Sorted by total spend. Includes all-time usage.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                <th className="px-5 py-3 text-xs font-medium text-neutral-500">Company</th>
                <th className="px-5 py-3 text-xs font-medium text-neutral-500">Plan</th>
                <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Sessions</th>
                <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Tokens</th>
                <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Anthropic</th>
                <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Gemini</th>
                <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Docker</th>
                <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">VPS</th>
                <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {companyCosts.map((row) => {
                const tokens =
                  Number(row.total_input_tokens) + Number(row.total_output_tokens);
                return (
                  <tr
                    key={row.company_id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-white">{row.company_name}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <PlanBadge plan={row.plan} />
                    </td>
                    <td className="px-5 py-3.5 text-right text-neutral-300">{row.session_count}</td>
                    <td className="px-5 py-3.5 text-right text-neutral-500">{fmtTokens(tokens)}</td>
                    <td className="px-5 py-3.5 text-right text-neutral-400">{fmt(Number(row.anthropic_cost))}</td>
                    <td className="px-5 py-3.5 text-right text-neutral-400">{fmt(Number(row.gemini_cost))}</td>
                    <td className="px-5 py-3.5 text-right text-neutral-400">{fmt(Number(row.docker_cost))}</td>
                    <td className="px-5 py-3.5 text-right text-neutral-400">{fmt(Number(row.vps_cost))}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-white">
                      {fmt(Number(row.total_spend))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {companyCosts.length === 0 && (
            <p className="text-center text-neutral-600 py-12">No usage data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'companies' | 'challenges' | 'costs';

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('companies');
  const [jumpCompanyId, setJumpCompanyId] = useState<string | undefined>();

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  if (authLoading || !user?.isAdmin) return null;

  function handleSelectCompany(id: string) {
    setJumpCompanyId(id);
    setActiveTab('challenges');
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'companies', label: 'Companies' },
    { key: 'challenges', label: 'Challenges' },
    { key: 'costs', label: 'Usage & Costs' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-serif italic text-white">Admin</h1>
        <p className="text-neutral-500 mt-1">Platform-wide management</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[#111] border border-white/5 rounded-xl p-1 mb-6 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === tab.key
                ? 'bg-primary/10 text-primary'
                : 'text-neutral-500 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <Link
          href="/dashboard/admin/feedback"
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer text-neutral-500 hover:text-white"
        >
          Feedback
        </Link>
      </div>

      {activeTab === 'companies' && (
        <CompaniesTab onSelectCompany={handleSelectCompany} />
      )}
      {activeTab === 'challenges' && (
        <ChallengesTab initialCompanyId={jumpCompanyId} />
      )}
      {activeTab === 'costs' && <CostsTab />}
    </div>
  );
}
