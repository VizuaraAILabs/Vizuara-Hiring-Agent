'use client';

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { useInterview, type InterviewMessage } from '@/hooks/useInterview';

interface InterviewWidgetProps {
  token: string;
}

export default function InterviewWidget({ token }: InterviewWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { messages, sending, hasUnread, markRead, markClosed, sendMessage } = useInterview(token);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const open = useCallback(() => {
    setIsOpen(true);
    markRead();
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [markRead]);

  const close = useCallback(() => {
    setIsOpen(false);
    markClosed();
  }, [markClosed]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    await sendMessage(text);
  }, [input, sending, sendMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const lastInterviewerSeq = messages.filter((m) => m.role === 'interviewer').at(-1)?.sequence_num;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* ── Expanded chat panel ── */}
      {isOpen && (
        <div
          className="flex flex-col bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
          style={{ width: 340, height: 480 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-light flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <InterviewerAvatar />
              <div>
                <div className="text-sm font-semibold text-white leading-none">Interviewer</div>
                <div className="text-xs text-neutral-500 mt-0.5">Watching your session</div>
              </div>
            </div>
            <button
              onClick={close}
              className="text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer p-1 rounded-lg hover:bg-border"
              aria-label="Close interviewer"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <InterviewerIcon className="text-primary" size={20} />
                </div>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Your interviewer is watching. They'll ask questions as you work — or you can ask
                  them about the problem.
                </p>
              </div>
            ) : (
              messages.map((msg) => <MessageBubble key={`${msg.id}-${msg.sequence_num}`} message={msg} />)
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 px-3 pb-3 pt-2 border-t border-border">
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the problem…"
                rows={1}
                disabled={sending}
                style={{
                  resize: 'none',
                  border: '2px solid #333333',
                  borderRadius: 10,
                  minHeight: 40,
                  maxHeight: 100,
                  overflowY: 'auto',
                  lineHeight: '1.5',
                  padding: '8px 12px',
                  fontSize: 13,
                }}
                className="flex-1 bg-surface-light text-white placeholder-neutral-600 outline-none focus:border-primary transition-colors disabled:opacity-50 cursor-text"
                onInput={(e) => {
                  const t = e.currentTarget;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 100) + 'px';
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                aria-label="Send message"
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary hover:bg-primary-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center cursor-pointer"
              >
                {sending ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M1 7h12M7 1l6 6-6 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[10px] text-neutral-600 mt-1.5 text-center">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      )}

      {/* ── Collapsed pill trigger ── */}
      {!isOpen && (
        <button
          onClick={open}
          className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-full shadow-lg hover:border-border-light hover:bg-surface-light transition-all cursor-pointer select-none"
          aria-label="Open interviewer"
        >
          <div className="relative flex-shrink-0">
            <InterviewerAvatar size="sm" />
            {hasUnread && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-primary rounded-full border-2 border-surface animate-pulse" />
            )}
          </div>
          <span className="text-sm font-medium text-white">Interviewer</span>
          {messages.length > 0 && (
            <span className="ml-1 text-xs text-neutral-500">
              {messages.length} {messages.length === 1 ? 'exchange' : 'exchanges'}
            </span>
          )}
          {hasUnread && (
            <span className="text-xs font-medium text-primary ml-0.5">●</span>
          )}
        </button>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: InterviewMessage }) {
  const isInterviewer = message.role === 'interviewer';
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex flex-col gap-1 ${isInterviewer ? 'items-start' : 'items-end'}`}>
      {isInterviewer && (
        <div className="flex items-center gap-1.5 ml-1">
          <InterviewerAvatar size="xs" />
          <span className="text-[10px] text-neutral-500 font-medium">Interviewer</span>
        </div>
      )}
      <div
        className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          isInterviewer
            ? 'bg-[#1a2a1f] border border-primary/20 text-neutral-200 rounded-tl-sm'
            : 'bg-[#1a1a2a] border border-border text-neutral-200 rounded-tr-sm'
        }`}
      >
        {isInterviewer ? (
          <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0 [&>p+p]:mt-1">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        ) : (
          <span>{message.content}</span>
        )}
      </div>
      <span className="text-[10px] text-neutral-600 mx-1">{time}</span>
    </div>
  );
}

function InterviewerAvatar({ size = 'md' }: { size?: 'xs' | 'sm' | 'md' }) {
  const dim = size === 'xs' ? 16 : size === 'sm' ? 22 : 30;
  const iconSize = size === 'xs' ? 8 : size === 'sm' ? 11 : 14;
  return (
    <div
      className="rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0"
      style={{ width: dim, height: dim }}
    >
      <InterviewerIcon className="text-primary" size={iconSize} />
    </div>
  );
}

function InterviewerIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M2.5 13.5c0-2.485 2.462-4.5 5.5-4.5s5.5 2.015 5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
