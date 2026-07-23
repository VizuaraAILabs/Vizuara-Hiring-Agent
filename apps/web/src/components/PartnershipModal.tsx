'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'arceval-partnership-modal-close-count';
const MAX_CLOSES = 2;
// End of Sunday, July 26, 2026 in India Standard Time.
const EXPIRES_AT = Date.parse('2026-07-26T23:59:59.999+05:30');

function getCloseCount() {
  try {
    const storedCount = Number.parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10);
    return Number.isFinite(storedCount) && storedCount > 0 ? storedCount : 0;
  } catch {
    return 0;
  }
}

export default function PartnershipModal() {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const closeModal = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.min(getCloseCount() + 1, MAX_CLOSES)));
    } catch {
      // The modal can still be dismissed when storage is unavailable.
    }
    setIsOpen(false);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const showIfEligible = (now: number) => {
      if (!isCancelled && now <= EXPIRES_AT && getCloseCount() < MAX_CLOSES) {
        setIsOpen(true);
      }
    };

    fetch('/api/time', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load server time');
        return response.json() as Promise<{ now: string }>;
      })
      .then(({ now }) => showIfEligible(Date.parse(now)))
      .catch(() => showIfEligible(Date.now()));

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeModal, isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-100 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md sm:p-7"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
          role="presentation"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="partnership-modal-title"
            aria-describedby="partnership-modal-description"
            className="relative my-auto w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/12 bg-[#0d0f0e] shadow-[0_32px_120px_rgba(0,0,0,0.75),0_0_80px_rgba(0,168,84,0.12)]"
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(0,168,84,0.14),transparent_32%)]" />

            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeModal}
              aria-label="Close partnership announcement"
              className="absolute top-4 right-4 z-20 grid size-10 place-items-center rounded-full border border-white/12 bg-black/55 text-neutral-300 backdrop-blur-md transition hover:rotate-3 hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none sm:top-5 sm:right-5"
            >
              <X size={18} strokeWidth={1.8} />
            </button>

            <div className="relative grid lg:grid-cols-[0.9fr_1.1fr]">
              <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
                <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3.5 py-1.5">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-50" />
                    <span className="relative inline-flex size-2 rounded-full bg-primary" />
                  </span>
                  <span className="font-mono text-[10px] font-semibold tracking-[0.18em] text-primary uppercase sm:text-[11px]">
                    A landmark partnership
                  </span>
                </div>

                <p className="mb-3 text-xs font-medium tracking-[0.2em] text-neutral-500 uppercase">
                  Vizuara × Anthropic
                </p>
                <h2
                  id="partnership-modal-title"
                  className="mb-5 max-w-xl text-4xl leading-[1.03] font-serif italic tracking-tight text-white sm:text-5xl"
                >
                  Building the future of{' '}
                  <span className="gradient-text">AI-native hiring</span>
                </h2>
                <p
                  id="partnership-modal-description"
                  className="max-w-lg text-base leading-relaxed text-neutral-400 sm:text-lg"
                >
                  Vizuara, the creator of ArcEval, is proud to partner with Anthropic.
                  Together, we&apos;re helping companies identify engineers who can reason,
                  build, and collaborate effectively with AI.
                </p>

                <div className="mt-8 flex items-center gap-3 text-xs text-neutral-500">
                  <span className="h-px w-10 bg-linear-to-r from-primary to-transparent" />
                  The next chapter of technical assessment
                </div>
              </div>

              <div className="relative aspect-video min-h-65 overflow-hidden border-t border-white/10 bg-black lg:aspect-auto lg:min-h-135 lg:border-t-0 lg:border-l">
                <video
                  className="absolute inset-0 h-full w-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls
                  preload="metadata"
                  aria-label="ArcEval and Anthropic partnership animation"
                >
                  <source src="/anthropic-partnership-animation.mp4" type="video/mp4" />
                  Your browser does not support embedded video.
                </video>
                <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/30 via-transparent to-black/10" />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
