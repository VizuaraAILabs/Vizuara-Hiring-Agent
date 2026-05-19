import { getRecommendationLabel } from '@/lib/utils';
import type { AnalysisResult, Challenge, DimensionDetail, Session } from '@/types';

const scoreLabels: Record<string, string> = {
  problem_decomposition: 'Problem Decomposition',
  first_principles: 'First Principles',
  creativity: 'Creativity',
  iteration_quality: 'Iteration Quality',
  debugging_approach: 'Debugging Approach',
  architecture_thinking: 'Architecture Thinking',
  communication_clarity: 'Communication Clarity',
  efficiency: 'Efficiency',
};

type PrintableReportProps = {
  session: Session;
  analysis: AnalysisResult;
  challenge?: Pick<Challenge, 'title'> | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function PrintableReport({ session, analysis, challenge }: PrintableReportProps) {
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
  const dimensions = Object.entries(analysis.dimension_details ?? {}) as [string, DimensionDetail][];

  return (
    <article className="print-report">
      <header>
        <p className="print-report__eyebrow">ArcEval Candidate Report</p>
        <h1>{session.candidate_name}</h1>
        <p>{session.candidate_email}</p>
        <div className="print-report__meta">
          <span>{challenge?.title ?? 'Assessment'}</span>
          <span>Started: {formatDate(session.started_at)}</span>
          <span>Ended: {formatDate(session.ended_at)}</span>
        </div>
      </header>

      <section className="print-report__summary">
        <div>
          <p className="print-report__label">Overall Score</p>
          <strong>{analysis.overall_score.toFixed(0)} / 100</strong>
        </div>
        <div>
          <p className="print-report__label">Recommendation</p>
          <strong>{getRecommendationLabel(analysis.hiring_recommendation)}</strong>
        </div>
      </section>

      <section>
        <h2>Summary</h2>
        <p>{analysis.summary_narrative || 'No summary narrative recorded.'}</p>
      </section>

      <section>
        <h2>Scores</h2>
        <table>
          <tbody>
            {Object.entries(scores).map(([key, score]) => (
              <tr key={key}>
                <th>{scoreLabels[key] ?? key}</th>
                <td>{score.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Dimension Evidence</h2>
        {dimensions.length > 0 ? (
          dimensions.map(([key, detail]) => (
            <div key={key} className="print-report__evidence-block">
              <h3>{scoreLabels[key] ?? key}</h3>
              {detail.narrative && <p>{detail.narrative}</p>}
              {detail.expected_standard && (
                <p><strong>Expected standard:</strong> {detail.expected_standard}</p>
              )}
              {detail.observed_points?.length ? (
                <ul>
                  {detail.observed_points.slice(0, 3).map((point, index) => (
                    <li key={index}>
                      <strong>{point.observation}</strong>
                      {point.transcript_quote && <span> Evidence: &quot;{point.transcript_quote}&quot;</span>}
                    </li>
                  ))}
                </ul>
              ) : detail.evidence.length ? (
                <ul>
                  {detail.evidence.slice(0, 4).map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>No detailed evidence recorded.</p>
              )}
            </div>
          ))
        ) : (
          <p>No dimension evidence recorded.</p>
        )}
      </section>

      <section>
        <h2>Timeline</h2>
        {analysis.timeline_data.length > 0 ? (
          <table>
            <tbody>
              {analysis.timeline_data.map((entry, index) => (
                <tr key={`${entry.activity}-${index}`}>
                  <th>{entry.activity}</th>
                  <td>{entry.category} - {entry.start_time}-{entry.end_time} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No timeline data recorded.</p>
        )}
      </section>

      <section className="print-report__columns">
        <div>
          <h2>Strengths</h2>
          <ul>
            {(analysis.strengths.length ? analysis.strengths : ['No strengths recorded.']).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2>Areas For Growth</h2>
          <ul>
            {(analysis.areas_for_growth.length ? analysis.areas_for_growth : ['No growth areas recorded.']).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2>Key Moments</h2>
        <ul>
          {(analysis.key_moments.length ? analysis.key_moments : []).map((moment, index) => (
            <li key={`${moment.title}-${index}`}>
              <strong>{moment.title}</strong>
              <span> {moment.description}</span>
            </li>
          ))}
          {analysis.key_moments.length === 0 && <li>No key moments recorded.</li>}
        </ul>
      </section>
    </article>
  );
}
