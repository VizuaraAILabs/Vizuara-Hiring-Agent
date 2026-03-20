'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface InterviewMessage {
  id: number;
  sequence_num: number;
  timestamp: string;
  role: 'interviewer' | 'candidate';
  content: string;
}

export function useInterview(token: string) {
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const lastSeqRef = useRef<number>(0);
  const isOpenRef = useRef<boolean>(false);

  // Poll for new interview interactions every 5 seconds
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/sessions/${token}/interview/questions?after=${lastSeqRef.current}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const incoming = data.interactions ?? [];
        if (incoming.length === 0) return;

        const newMessages: InterviewMessage[] = incoming.map((i: {
          id: number;
          sequence_num: number;
          timestamp: string;
          content_type: string;
          content: string;
        }) => ({
          id: i.id,
          sequence_num: i.sequence_num,
          timestamp: i.timestamp,
          role: i.content_type === 'interview_question' ? 'interviewer' : 'candidate',
          content: i.content,
        }));

        lastSeqRef.current = incoming[incoming.length - 1].sequence_num;

        setMessages((prev) => {
          // Avoid duplicates (poll might race with optimistic update)
          const existingSeqs = new Set(prev.map((m) => m.sequence_num));
          const deduped = newMessages.filter((m) => !existingSeqs.has(m.sequence_num));
          return deduped.length > 0 ? [...prev, ...deduped] : prev;
        });

        // Flag unread if widget is collapsed
        const hasNewFromInterviewer = newMessages.some((m) => m.role === 'interviewer');
        if (hasNewFromInterviewer && !isOpenRef.current) {
          setHasUnread(true);
        }
      } catch {
        // Network errors are non-fatal — just wait for next poll
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  const markRead = useCallback(() => {
    setHasUnread(false);
    isOpenRef.current = true;
  }, []);

  const markClosed = useCallback(() => {
    isOpenRef.current = false;
  }, []);

  const sendMessage = useCallback(
    async (content: string, replyToSeq?: number): Promise<boolean> => {
      if (!content.trim() || sending) return false;
      setSending(true);

      // Optimistic update for candidate message
      const tempSeq = Date.now(); // temp unique key
      const optimisticMsg: InterviewMessage = {
        id: -tempSeq,
        sequence_num: tempSeq,
        timestamp: new Date().toISOString(),
        role: 'candidate',
        content: content.trim(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        const res = await fetch(`/api/sessions/${token}/interview/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content.trim(), replyToSeq }),
        });

        if (!res.ok) {
          // Roll back optimistic update
          setMessages((prev) => prev.filter((m) => m.id !== -tempSeq));
          return false;
        }

        const { reply, sequence_num, candidate_sequence_num } = await res.json();

        // Replace optimistic with confirmed candidate message + AI reply
        setMessages((prev) => {
          const withoutOptimistic = prev.filter((m) => m.id !== -tempSeq);
          const confirmedCandidate: InterviewMessage = {
            id: -(candidate_sequence_num as number),
            sequence_num: candidate_sequence_num as number,
            timestamp: new Date().toISOString(),
            role: 'candidate',
            content: content.trim(),
          };
          const aiMsg: InterviewMessage = {
            id: -(sequence_num as number),
            sequence_num: sequence_num as number,
            timestamp: new Date().toISOString(),
            role: 'interviewer',
            content: reply as string,
          };
          // Advance lastSeq past both messages so poll doesn't re-fetch them
          lastSeqRef.current = Math.max(lastSeqRef.current, sequence_num as number);
          return [...withoutOptimistic, confirmedCandidate, aiMsg];
        });

        return true;
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== -tempSeq));
        return false;
      } finally {
        setSending(false);
      }
    },
    [token, sending]
  );

  return { messages, sending, hasUnread, markRead, markClosed, sendMessage };
}
