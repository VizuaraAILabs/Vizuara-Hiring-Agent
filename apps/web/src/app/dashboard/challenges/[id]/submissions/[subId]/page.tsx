'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { AnalysisResult, Session, Interaction } from '@/types';
import ReportHeader from '@/components/report/ReportHeader';
import ScoreSummary from '@/components/report/ScoreSummary';
import KeyMoments from '@/components/report/KeyMoments';
import TranscriptViewer from '@/components/report/TranscriptViewer';
import InlineFeedback from '@/components/feedback/InlineFeedback';
import NpsPrompt from '@/components/feedback/NpsPrompt';
import CompletionSurvey from '@/components/feedback/CompletionSurvey';

// Dynamic imports for chart components (they use window)
const RadarChart = dynamic(() => import('@/components/report/RadarChart'), { ssr: false });
const TimelineChart = dynamic(() => import('@/components/report/TimelineChart'), { ssr: false });
const PromptComplexity = dynamic(() => import('@/components/report/PromptComplexity'), { ssr: false });
const CategoryBreakdown = dynamic(() => import('@/components/report/CategoryBreakdown'), { ssr: false });

type Tab = 'overview' | 'timeline' | 'analysis' | 'transcript';

export default function ReportPage() {
  const params = useParams();
  const sessionId = params.subId as string;
  const challengeId = params.id as string;

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [highlightIndex, setHighlightIndex] = useState<number | undefined>();

  useEffect(() => {
    async function loadData() {
      try {
        const analysisRes = await fetch(`/api/analysis/${sessionId}`);
        if (analysisRes.ok) {
          const data = await analysisRes.json();
          setAnalysis(data);
        }

        const challengeRes = await fetch(`/api/challenges/${challengeId}`);
        if (challengeRes.ok) {
          const challengeData = await challengeRes.json();
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
  }, [sessionId, challengeId]);

  const handleViewInTranscript = (index: number) => {
    setHighlightIndex(index);
    setActiveTab('transcript');
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-40 bg-[#111] rounded-2xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-80 bg-[#111] rounded-2xl" />
          <div className="h-80 bg-[#111] rounded-2xl" />
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
    { key: 'overview', label: 'Overview' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'analysis', label: 'Analysis' },
    { key: 'transcript', label: 'Transcript' },
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

      {/* Tabs */}
      <div className="flex gap-1 mt-6 mb-6 bg-[#111] rounded-2xl p-1 border border-white/5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white/5 text-white'
                : 'text-neutral-600 hover:text-neutral-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RadarChart scores={scores} />
          <ScoreSummary dimensions={analysis.dimension_details} scores={scores} />
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

      {activeTab === 'transcript' && (
        <TranscriptViewer
          interactions={interactions}
          highlightIndex={highlightIndex}
        />
      )}

      {/* Feedback — shown below all tabs */}
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
    </div>
  );
}
