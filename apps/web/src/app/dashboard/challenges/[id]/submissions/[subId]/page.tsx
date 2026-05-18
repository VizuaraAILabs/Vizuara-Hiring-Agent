'use client';

import IntegrityPanel from '@/components/report/IntegrityPanel';
import KeyMoments from '@/components/report/KeyMoments';
import RecruiterReviewPanel from '@/components/report/RecruiterReviewPanel';
import ReportHeader from '@/components/report/ReportHeader';
import ReportSummary from '@/components/report/ReportSummary';
import ScoreSummary from '@/components/report/ScoreSummary';
import TranscriptViewer from '@/components/report/TranscriptViewer';
import WorkspaceViewer from '@/components/report/WorkspaceViewer';
import type { AnalysisResult, Challenge, IntegritySummary, Interaction, Session, WorkspaceSnapshot } from '@/types';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
// import InlineFeedback from '@/components/feedback/InlineFeedback';
// import NpsPrompt from '@/components/feedback/NpsPrompt';
// import CompletionSurvey from '@/components/feedback/CompletionSurvey';

// Dynamic imports for chart components (they use window)
const RadarChart = dynamic(() => import('@/components/report/RadarChart'), { ssr: false });
const TimelineChart = dynamic(() => import('@/components/report/TimelineChart'), { ssr: false });
const PromptComplexity = dynamic(() => import('@/components/report/PromptComplexity'), { ssr: false });
const CategoryBreakdown = dynamic(() => import('@/components/report/CategoryBreakdown'), { ssr: false });

type Tab = 'summary' | 'overview' | 'timeline' | 'analysis' | 'ownership' | 'transcript' | 'files';

export default function ReportPage() {
  const params = useParams();
  const sessionId = params.subId as string;
  const challengeId = params.id as string;

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [highlightIndex, setHighlightIndex] = useState<number | undefined>();
  const [transcriptNarrative, setTranscriptNarrative] = useState<string | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [enrichingDimensions, setEnrichingDimensions] = useState(false);
  const [enrichmentError, setEnrichmentError] = useState<string | null>(null);
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [integritySummary, setIntegritySummary] = useState<IntegritySummary | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityError, setIntegrityError] = useState<string | null>(null);

  const handleEnrichDimensions = useCallback(async () => {
    setEnrichingDimensions(true);
    setEnrichmentError(null);
    try {
      const res = await fetch(`/api/analysis/${sessionId}/enrich-dimensions`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Detailed evidence could not be generated.');
      }
      const enriched = await res.json();
      if (enriched?.dimension_details) {
        setAnalysis((prev) =>
          prev ? { ...prev, dimension_details: enriched.dimension_details } : prev,
        );
      }
    } catch (err) {
      console.error('Failed to enrich dimension evidence:', err);
      setEnrichmentError('Detailed evidence could not be generated. Scores remain available, but some supporting observations may be missing.');
    } finally {
      setEnrichingDimensions(false);
    }
  }, [sessionId]);

  useEffect(() => {
    async function loadData() {
      try {
        const analysisRes = await fetch(`/api/analysis/${sessionId}`);
        if (analysisRes.ok) {
          const data = await analysisRes.json();
          setAnalysis(data);
          if (data.transcript_narrative) {
            setTranscriptNarrative(data.transcript_narrative);
          }

          // If any dimension is missing observed_points, enrich in the background
          const details: Record<string, { observed_points?: unknown[] }> =
            data.dimension_details ?? {};
          const needsEnrichment = Object.values(details).some(
            (d) => !d?.observed_points?.length,
          );
          if (needsEnrichment) {
            void handleEnrichDimensions();
          }
        }

        const challengeRes = await fetch(`/api/challenges/${challengeId}`);
        if (challengeRes.ok) {
          const challengeData = await challengeRes.json();
          setChallenge(challengeData);
          const sess = challengeData.sessions?.find((s: Session) => s.id === sessionId);
          if (sess) setSession(sess);

          if (sess?.token) {
            const interactionsRes = await fetch(`/api/sessions/${sess.token}/interactions`);
            if (interactionsRes.ok) {
              setInteractions(await interactionsRes.json());
            }
          }
        }
      } catch (err) {
        console.error('Failed to load report data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [sessionId, challengeId, handleEnrichDimensions]);

  const handleViewInTranscript = (index: number) => {
    setHighlightIndex(index);
    setActiveTab('transcript');
  };

  const handleSessionUpdated = (updatedSession: Session) => {
    setSession(updatedSession);
  };

  const handleGenerateNarrative = async () => {
    if (transcriptNarrative || narrativeLoading) return;

    setNarrativeLoading(true);
    setNarrativeError(null);
    try {
      const res = await fetch(`/api/analysis/${sessionId}/transcript-narrative`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to generate transcript narrative.');
      }
      const data = await res.json();
      setTranscriptNarrative(data.transcript_narrative ?? null);
    } catch (err) {
      console.error('Failed to generate transcript narrative:', err);
      setNarrativeError('Transcript narrative could not be generated. Please try again.');
    } finally {
      setNarrativeLoading(false);
    }
  };

  const loadIntegritySummary = useCallback(async () => {
    if (integritySummary || integrityLoading) return;
    setIntegrityLoading(true);
    setIntegrityError(null);
    try {
      const res = await fetch(`/api/analysis/${sessionId}/integrity`);
      if (res.ok) {
        setIntegritySummary(await res.json());
      } else {
        setIntegrityError('Ownership signals could not be generated for this session.');
      }
    } catch {
      setIntegrityError('Ownership signals could not be generated for this session.');
    } finally {
      setIntegrityLoading(false);
    }
  }, [integrityLoading, integritySummary, sessionId]);

  const handleTabChange = async (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'ownership') {
      void loadIntegritySummary();
    }
    if (tab === 'files' && !workspaceSnapshot && !workspaceLoading) {
      setWorkspaceLoading(true);
      setWorkspaceError(null);
      try {
        const res = await fetch(`/api/analysis/${sessionId}/workspace`);
        if (res.ok) {
          setWorkspaceSnapshot(await res.json());
        } else if (res.status === 409) {
          setWorkspaceError('This session is still in progress.');
        } else if (res.status === 404) {
          setWorkspaceError('No workspace files were captured for this session.');
        } else {
          setWorkspaceError('Failed to load workspace files.');
        }
      } catch {
        setWorkspaceError('Failed to load workspace files.');
      } finally {
        setWorkspaceLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-40 bg-surface rounded-2xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-80 bg-surface rounded-2xl" />
          <div className="h-80 bg-surface rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!analysis || !session) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-serif italic text-white mb-2">Report Not Available</h2>
        <p className="text-neutral-500 mb-4">
          The analysis may still be in progress or hasn&apos;t been triggered yet.
        </p>
        <Link
          href={`/dashboard/challenges/${challengeId}`}
          className="text-primary hover:text-primary-light text-sm"
        >
          Back to challenge
        </Link>
      </div>
    );
  }

  const scores = {
    problem_decomposition: analysis.problem_decomposition,
    first_principles: analysis.first_principles,
    creativity: analysis.creativity,
    iteration_quality: analysis.iteration_quality,
    debugging_approach: analysis.debugging_approach,
    architecture_thinking: analysis.architecture_thinking,
    communication_clarity: analysis.communication_clarity,
    efficiency: analysis.efficiency,
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'overview', label: 'Overview' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'analysis', label: 'Analysis' },
    { key: 'ownership', label: 'Ownership' },
    { key: 'transcript', label: 'Narrative' },
    { key: 'files', label: 'Files' },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back link */}
      <Link
        href={`/dashboard/challenges/${challengeId}`}
        className="text-neutral-600 hover:text-neutral-300 text-sm mb-6 block transition-colors"
      >
        &larr; Back to challenge
      </Link>

      {/* Header */}
      <ReportHeader session={session} analysis={analysis} />
      <RecruiterReviewPanel session={session} onSessionUpdated={handleSessionUpdated} />

      {/* Tabs */}
      <div className="sticky top-0 z-20 -mx-1 mb-6 mt-6 bg-[#0a0a0a] px-1 pt-3">
        <div className="overflow-x-auto border-b border-white/10" role="tablist" aria-label="Submission report sections">
          <div className="flex min-w-max gap-6 sm:gap-8">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleTabChange(tab.key)}
                  className={`cursor-pointer border-b-2 px-3 py-3 text-sm font-semibold transition-colors sm:px-4 ${
                    isActive
                      ? 'border-primary text-white'
                      : 'border-transparent text-neutral-600 hover:text-neutral-300'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'summary' && <ReportSummary analysis={analysis} />}

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RadarChart scores={scores} />
          <ScoreSummary
            dimensions={analysis.dimension_details}
            scores={scores}
            enriching={enrichingDimensions}
            enrichmentError={enrichmentError}
            onRetryEnrichment={handleEnrichDimensions}
            challengeTitle={challenge?.title ?? null}
            challengeRole={challenge?.role ?? null}
            challengeTechStack={challenge?.tech_stack ?? null}
            challengeSeniority={challenge?.seniority ?? null}
            challengeFocusAreas={challenge?.focus_areas ?? null}
            challengeContext={challenge?.context ?? null}
          />
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="space-y-6">
          {analysis.timeline_data.length > 0 && (
            <TimelineChart data={analysis.timeline_data} />
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {analysis.prompt_complexity.length > 0 && (
              <PromptComplexity data={analysis.prompt_complexity} />
            )}
            {Object.keys(analysis.category_breakdown).length > 0 && (
              <CategoryBreakdown data={analysis.category_breakdown} />
            )}
          </div>
        </div>
      )}

      {activeTab === 'analysis' && (
        <div className="space-y-6">
          <KeyMoments
            moments={analysis.key_moments}
            onViewInTranscript={handleViewInTranscript}
          />
        </div>
      )}

      {activeTab === 'ownership' && (
        <IntegrityPanel
          summary={integritySummary}
          loading={integrityLoading}
          error={integrityError}
        />
      )}

      {activeTab === 'transcript' && (
        <TranscriptViewer
          interactions={interactions}
          highlightIndex={highlightIndex}
          narrative={transcriptNarrative}
          narrativeLoading={narrativeLoading}
          narrativeError={narrativeError}
          onGenerateNarrative={handleGenerateNarrative}
          candidateName={session.candidate_name}
        />
      )}

      {activeTab === 'files' && (
        <WorkspaceViewer
          snapshot={workspaceSnapshot}
          loading={workspaceLoading}
          error={workspaceError}
          sessionId={sessionId}
        />
      )}

      {/* Feedback — shown below all tabs */}
      {/*
        Feedback sections temporarily hidden.
        <div className="mt-10 space-y-4">
          <InlineFeedback
            courseSlug={challengeId}
            podSlug={sessionId}
            contentType="article"
          />
          <NpsPrompt
            courseSlug={challengeId}
            podSlug={sessionId}
            contentType="course"
          />
          <CompletionSurvey
            courseSlug={challengeId}
            podSlug={sessionId}
            contentType="course"
          />
        </div>
      */}
    </div>
  );
}
