'use client';

import { useEffect, useState } from 'react';
import { X, Quote, CheckCircle2, FileText, Scale } from 'lucide-react';
import { getScoreColor, getScoreBgColor } from '@/lib/utils';
import type { DimensionDetail } from '@/types';

interface DimensionEvidenceModalProps {
  dimensionKey: string;
  label: string;
  score: number;
  detail: DimensionDetail;
  onClose: () => void;
  challengeTitle?: string | null;
  challengeRole?: string | null;
  challengeTechStack?: string | null;
  challengeSeniority?: string | null;
  challengeFocusAreas?: string | null;
  challengeContext?: string | null;
}

export default function DimensionEvidenceModal({
  label,
  score,
  detail,
  onClose,
  challengeTitle,
  challengeRole,
  challengeTechStack,
  challengeSeniority,
  challengeFocusAreas,
  challengeContext,
}: DimensionEvidenceModalProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'standard' | 'evidence'>('summary');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const hasPoints = detail.observed_points && detail.observed_points.length > 0;
  const hasChallengeContext = Boolean(
    challengeTitle || challengeRole || challengeTechStack || challengeSeniority || challengeFocusAreas || challengeContext
  );
  const tabs = [
    { id: 'summary' as const, label: 'Summary', icon: FileText },
    { id: 'standard' as const, label: 'Standard', icon: CheckCircle2 },
    { id: 'evidence' as const, label: 'Evidence', icon: Scale, badge: detail.observed_points?.length ?? 0 },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface border border-white/10 rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-white font-semibold text-base">{label}</span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getScoreBgColor(score)} text-white`}>
              {score.toFixed(0)} / 100
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white cursor-pointer transition-colors p-1 rounded-lg hover:bg-white/5"
          >
            <X size={18} />
          </button>
        </div>

        <div className="shrink-0 border-b border-white/5 px-6">
          <div className="flex min-w-max gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-primary text-white'
                      : 'border-transparent text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{tab.label}</span>
                  {typeof tab.badge === 'number' && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${isActive ? 'bg-primary/15 text-primary' : 'bg-white/5 text-neutral-500'}`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {activeTab === 'summary' && (
            <div className="space-y-5">
              {hasChallengeContext && (
                <div className="flex items-center gap-3 flex-wrap">
                  {challengeTitle && <span className="text-xs text-neutral-500">{challengeTitle}</span>}
                  {challengeRole && (
                    <>
                      {challengeTitle && <span className="text-neutral-700">&middot;</span>}
                      <span className="text-xs text-neutral-500"><span className="text-neutral-600">Role:</span> {challengeRole}</span>
                    </>
                  )}
                  {challengeSeniority && (
                    <>
                      <span className="text-neutral-700">&middot;</span>
                      <span className="text-xs text-neutral-500"><span className="text-neutral-600">Seniority:</span> {challengeSeniority}</span>
                    </>
                  )}
                  {challengeTechStack && (
                    <>
                      <span className="text-neutral-700">&middot;</span>
                      <span className="text-xs text-neutral-500"><span className="text-neutral-600">Stack:</span> {challengeTechStack}</span>
                    </>
                  )}
                  {challengeFocusAreas && (
                    <>
                      <span className="text-neutral-700">&middot;</span>
                      <span className="text-xs text-neutral-500"><span className="text-neutral-600">Focus:</span> {challengeFocusAreas}</span>
                    </>
                  )}
                  {challengeContext && (
                    <span className="text-xs text-neutral-500 w-full">
                      <span className="text-neutral-600">Context:</span> {challengeContext}
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  Assessment Summary
                </h4>
                {detail.narrative ? (
                  <p className="text-sm text-neutral-300 leading-relaxed">{detail.narrative}</p>
                ) : (
                  <p className="text-sm text-neutral-600">No narrative summary is available.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'standard' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                  Expected Standard
                </span>
              </div>
              {detail.expected_standard ? (
                <p className="text-sm text-neutral-300 leading-relaxed">{detail.expected_standard}</p>
              ) : (
                <p className="text-sm text-neutral-600">No expected standard is available for this dimension.</p>
              )}
            </div>
          )}

          {activeTab === 'evidence' && (
            <div>
              <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
                Evidence Breakdown
              </h4>

              {!hasPoints ? (
                <div className="rounded-xl border border-white/5 bg-white/2 p-5 text-center">
                  <p className="text-sm text-neutral-600">
                    Detailed evidence is not available for this analysis.
                    Re-run analysis to generate transcript-grounded evidence.
                  </p>
                </div>
              ) : (
                <div className="max-h-[50vh] overflow-auto rounded-xl border border-white/5">
                  <div className="grid grid-cols-2 border-b border-white/5 bg-white/3">
                    <div className="px-4 py-2.5 text-xs font-semibold text-neutral-400 uppercase tracking-wide border-r border-white/5">
                      Observed
                    </div>
                    <div className="px-4 py-2.5 text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                      Expected
                    </div>
                  </div>

                  {detail.observed_points!.map((point, i) => (
                    <div
                      key={i}
                      className={`grid grid-cols-2 ${i < detail.observed_points!.length - 1 ? 'border-b border-white/5' : ''}`}
                    >
                      <div className="px-4 py-4 border-r border-white/5 space-y-2.5">
                        <div className="flex items-start gap-2">
                          <Quote size={12} className="text-neutral-600 mt-0.5 shrink-0" />
                          <span className="text-xs font-mono text-neutral-300 leading-relaxed bg-white/4 px-2.5 py-1.5 rounded-lg border border-white/5 block w-full">
                            {point.transcript_quote}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-500 leading-relaxed pl-5">
                          {point.observation}
                        </p>
                      </div>

                      <div className="px-4 py-4">
                        <p className={`text-sm leading-relaxed ${getScoreColor(score)}`}>
                          {point.comparison}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
