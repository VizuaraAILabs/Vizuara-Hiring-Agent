import MarkdownViewer from '@/components/MarkdownViewer';
import type { AnalysisResult } from '@/types';

interface ReportSummaryProps {
  analysis: AnalysisResult;
}

export default function ReportSummary({ analysis }: ReportSummaryProps) {
  const strengthsMarkdown = analysis.strengths.map((strength) => `- ${strength}`).join('\n');
  const growthMarkdown = analysis.areas_for_growth.map((area) => `- ${area}`).join('\n');

  return (
    <section className="space-y-8">
      {analysis.summary_narrative ? (
        <MarkdownViewer content={analysis.summary_narrative} />
      ) : (
        <p className="text-neutral-600 text-sm">No summary narrative available.</p>
      )}

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
        {analysis.strengths.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-primary mb-3">Strengths</h4>
            <MarkdownViewer content={strengthsMarkdown} />
          </div>
        )}

        {analysis.areas_for_growth.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-amber-400 mb-3">Areas for Growth</h4>
            <MarkdownViewer content={growthMarkdown} />
          </div>
        )}
      </div>
    </section>
  );
}
