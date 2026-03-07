'use client';

import { useState, useCallback } from 'react';
import type { FeedbackSubmission, FeedbackRecord } from '@/types/feedback';

export function useFeedback() {
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<FeedbackRecord | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // POST /api/feedback — creates or updates a feedback record
  const submit = useCallback(async (data: FeedbackSubmission) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to submit feedback');
      }
      setSubmitted(true);
      return await res.json();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  // GET /api/feedback — checks if the current user already submitted this feedback type
  // Returns the existing record or null. Used on mount by emoji/nps/thumbs/survey components.
  const checkExisting = useCallback(async (params: {
    type: string;
    courseSlug?: string;
    podSlug?: string;
    contentType?: string;
    notebookOrder?: number;
  }) => {
    try {
      const query = new URLSearchParams();
      query.set('type', params.type);
      if (params.courseSlug) query.set('courseSlug', params.courseSlug);
      if (params.podSlug) query.set('podSlug', params.podSlug);
      if (params.contentType) query.set('contentType', params.contentType);
      if (params.notebookOrder !== undefined) query.set('notebookOrder', String(params.notebookOrder));

      const res = await fetch(`/api/feedback?${query}`);
      if (res.ok) {
        const body = await res.json();
        if (body.feedback) {
          setExisting(body.feedback);
          return body.feedback as FeedbackRecord;
        }
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setSubmitted(false);
    setError(null);
    setExisting(null);
  }, []);

  return { submit, checkExisting, submitting, existing, submitted, error, reset };
}
