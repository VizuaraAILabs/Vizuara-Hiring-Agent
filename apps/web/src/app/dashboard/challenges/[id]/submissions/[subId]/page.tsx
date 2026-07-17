'use client';

import IntegrityPanel from '@/components/report/IntegrityPanel';
import KeyMoments from '@/components/report/KeyMoments';
import PrintableReport from '@/components/report/PrintableReport';
import RecruiterReviewPanel from '@/components/report/RecruiterReviewPanel';
import ReportExportActions from '@/components/report/ReportExportActions';
import ReportHeader from '@/components/report/ReportHeader';
import ReportSummary from '@/components/report/ReportSummary';
import ScoreSummary from '@/components/report/ScoreSummary';
import TranscriptViewer from '@/components/report/TranscriptViewer';
import WorkspaceViewer from '@/components/report/WorkspaceViewer';
import { useAuth } from '@/context/AuthContext';
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
  const { user } = useAuth();
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
  const [retryingAnalysis, setRetryingAnalysis] = useState(false);
  const [retryAnalysisError, setRetryAnalysisError] = useState<string | null>(null);

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

  const loadReportData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
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
      if (showLoading) setLoading(false);
    }
  }, [sessionId, challengeId, handleEnrichDimensions]);

  useEffect(() => {
    void loadReportData();
  }, [loadReportData]);

  // While analysis is queued/running, poll quietly so the page updates without a manual refresh.
  useEffect(() => {
    if (session?.status !== 'queued' && session?.status !== 'analyzing') return;
    const interval = setInterval(() => {
      void loadReportData(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [session?.status, loadReportData]);

  async function handleRetryAnalysis() {
    if (retryingAnalysis) return;
    setRetryingAnalysis(true);
    setRetryAnalysisError(null);
    try {
      const res = await fetch(`/api/analysis/${sessionId}`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to start analysis.');
      }
      await loadReportData(false);
    } catch (err) {
      setRetryAnalysisError(err instanceof Error ? err.message : 'Failed to start analysis.');
    } finally {
      setRetryingAnalysis(false);
    }
  }

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
      setNarrativeError(err instanceof Error ? err.message : 'Transcript narrative could not be generated. Please try again.');
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
    if (!session) {
      return (
        <ReportUnavailable
          title="Report Not Available"
          message="This session could not be found."
          challengeId={challengeId}
        />
      );
    }

    if (session.status === 'pending' || session.status === 'active') {
      return (
        <ReportUnavailable
          title="Not Submitted Yet"
          message="This candidate hasn't completed the assessment yet, so there's nothing to analyze."
          challengeId={challengeId}
        />
      );
    }

    if (session.status === 'queued' || session.status === 'analyzing') {
      return (
        <ReportUnavailable
          title="Analysis In Progress"
          message={
            session.status === 'queued'
              ? "This submission is queued for analysis. This page updates automatically once it's ready."
              : "Analysis is running now. This page updates automatically once it's ready."
          }
          challengeId={challengeId}
        />
      );
    }

    if (session.status === 'analysis failed') {
      return (
        <ReportUnavailable
          title="Analysis Failed"
          message="The last analysis attempt for this submission didn't complete."
          challengeId={challengeId}
          retryLabel="Retry analysis"
          retrying={retryingAnalysis}
          retryError={retryAnalysisError}
          onRetry={() => void handleRetryAnalysis()}
        />
      );
    }

    if (interactions.length === 0) {
      return (
        <ReportUnavailable
          title="No Activity Recorded"
          message="This session ended with no recorded activity, so there's nothing to analyze."
          challengeId={challengeId}
        />
      );
    }

    if (session.status === 'completed') {
      return (
        <ReportUnavailable
          title="Analysis Not Started"
          message="Analysis hasn't been triggered yet for this submission."
          challengeId={challengeId}
          retryLabel="Run analysis"
          retrying={retryingAnalysis}
          retryError={retryAnalysisError}
          onRetry={() => void handleRetryAnalysis()}
        />
      );
    }

    return (
      <ReportUnavailable
        title="Report Not Available"
        message="The analysis may still be in progress or hasn't been triggered yet."
        challengeId={challengeId}
      />
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
  const canEditReview = user?.role === 'owner' || user?.role === 'recruiter';

  return (
    <div className="max-w-6xl mx-auto">
      <div className="print-only">
        <PrintableReport session={session} analysis={analysis} challenge={challenge} />
      </div>

      <div className="screen-only">
        <div className="mb-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Link
            href={`/dashboard/challenges/${challengeId}`}
            className="text-neutral-600 hover:text-neutral-300 text-sm transition-colors"
          >
            &larr; Back to challenge
          </Link>
          <ReportExportActions sessionId={sessionId} />
        </div>

        {/* Header */}
        <ReportHeader session={session} analysis={analysis} />
        <RecruiterReviewPanel
          session={session}
          onSessionUpdated={handleSessionUpdated}
          canEditReview={canEditReview}
        />
      </div>

      {/* Tabs */}
      <div className="screen-only sticky top-0 z-20 -mx-1 mb-6 mt-6 bg-[#0a0a0a] px-1 pt-3">
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
      <div className="screen-only">
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
          {analysis.timeline_data.length === 0
            && analysis.prompt_complexity.length === 0
            && Object.keys(analysis.category_breakdown).length === 0 ? (
            <div className="text-center py-16">
              <p className="text-neutral-400 text-sm">No timeline activity detected for this session.</p>
            </div>
          ) : (
            <>
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
            </>
          )}
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
      </div>

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

function ReportUnavailable({
  title,
  message,
  challengeId,
  retryLabel,
  retrying,
  retryError,
  onRetry,
}: {
  title: string;
  message: string;
  challengeId: string;
  retryLabel?: string;
  retrying?: boolean;
  retryError?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="text-center py-20">
      <h2 className="text-xl font-serif italic text-white mb-2">{title}</h2>
      <p className="text-neutral-500 mb-4">{message}</p>
      {retryError && (
        <p className="text-red-400 text-sm mb-4">{retryError}</p>
      )}
      {onRetry && retryLabel && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-primary-light disabled:opacity-60 disabled:cursor-not-allowed mb-4"
        >
          {retrying ? 'Working...' : retryLabel}
        </button>
      )}
      <div>
        <Link
          href={`/dashboard/challenges/${challengeId}`}
          className="text-primary hover:text-primary-light text-sm"
        >
          Back to challenge
        </Link>
      </div>
    </div>
  );
}
