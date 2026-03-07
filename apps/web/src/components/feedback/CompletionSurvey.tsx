'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/hooks/useFeedback';
import type { ContentType } from '@/types/feedback';

const QUESTIONS = [
  {
    key: 'clarity',
    text: 'How clear were the explanations?',
    options: ['Very clear', 'Mostly clear', 'Somewhat unclear', 'Very confusing'],
  },
  {
    key: 'notebooks',
    text: 'How were the practice notebooks?',
    options: ['Excellent', 'Good', 'Could be better', 'Not helpful'],
  },
  {
    key: 'pace',
    text: 'How was the pace of the content?',
    options: ['Too fast', 'Just right', 'Too slow'],
  },
];

interface CompletionSurveyProps {
  courseSlug?: string;
  podSlug?: string;
  contentType: 'pod' | 'course';
}

export default function CompletionSurvey({ courseSlug, podSlug, contentType }: CompletionSurveyProps) {
  const { user } = useAuth();
  const { submit, checkExisting } = useFeedback();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user) return;
    checkExisting({ type: 'survey', courseSlug, podSlug, contentType }).then((rec) => {
      if (rec?.surveyData) {
        setAnswers(rec.surveyData as Record<string, string>);
        setDone(true);
      }
    });
  }, [user, courseSlug, podSlug, contentType, checkExisting]);

  if (!user) return null;

  const allAnswered = QUESTIONS.every((q) => answers[q.key]);

  const handleSelect = (key: string, value: string) => {
    if (done) return;
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!allAnswered) return;
    await submit({
      type: 'survey',
      courseSlug,
      podSlug,
      contentType: contentType as ContentType,
      surveyData: answers,
    });
    setDone(true);
  };

  return (
    <div className="border border-border rounded-xl p-5 bg-surface">
      <h3 className="text-sm font-medium text-neutral-200 mb-4">Quick Survey</h3>

      <div className="flex flex-col gap-5">
        {QUESTIONS.map((q) => (
          <div key={q.key}>
            <p className="text-sm text-neutral-300 mb-2">{q.text}</p>
            <div className="flex flex-wrap gap-2">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleSelect(q.key, opt)}
                  disabled={done}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer disabled:cursor-default ${
                    answers[q.key] === opt
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'border-border text-neutral-400 hover:border-border-light hover:text-neutral-200'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        {done ? (
          <p className="text-xs text-primary">Thanks for completing the survey!</p>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!allAnswered}
            className="bg-primary hover:bg-primary-light disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors duration-150 cursor-pointer"
          >
            Submit Survey
          </button>
        )}
      </div>
    </div>
  );
}
