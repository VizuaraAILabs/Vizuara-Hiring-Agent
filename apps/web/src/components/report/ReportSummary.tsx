import type { AnalysisResult } from '@/types';

interface ReportSummaryProps {
  analysis: AnalysisResult;
}

export default function ReportSummary({ analysis }: ReportSummaryProps) {
  return (
    <div className="bg-surface border border-white/5 rounded-2xl p-8">
      {analysis.summary_narrative ? (
        <p className="text-neutral-400 text-sm leading-relaxed">{analysis.summary_narrative}</p>
      ) : (
        <p className="text-neutral-600 text-sm">No summary narrative available.</p>
      )}

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
        {analysis.strengths.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-primary mb-3">Strengths</h4>
            <ul className="space-y-2">
              {analysis.strengths.map((strength, index) => (
                <li key={index} className="text-sm text-neutral-400 flex gap-3 leading-relaxed">
                  <span className="text-primary mt-0.5">+</span>
                  <span>{strength}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis.areas_for_growth.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-amber-400 mb-3">Areas for Growth</h4>
            <ul className="space-y-2">
              {analysis.areas_for_growth.map((area, index) => (
                <li key={index} className="text-sm text-neutral-400 flex gap-3 leading-relaxed">
                  <span className="text-amber-500 mt-0.5">-</span>
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
