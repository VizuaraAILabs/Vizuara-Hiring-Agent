'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ArcSpinner from '@/components/ArcSpinner';

const messages = [
  'Analyzing role requirements...',
  'Designing challenge scenarios...',
  'Crafting evaluation criteria...',
  'Finalizing challenge briefs...',
];

export default function StepLoading() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % messages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-8">
      <ArcSpinner label={messages[messageIndex]} sizeClassName="h-16 w-16" />

      {/* Rotating messages */}
      <div className="h-8 relative">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="text-neutral-400 text-lg"
          >
            {messages[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
