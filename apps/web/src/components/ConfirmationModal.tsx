'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  confirmationLabel?: string;
  confirmationValue?: string;
  isLoading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  confirmationLabel,
  confirmationValue,
  isLoading = false,
  error,
  onConfirm,
  onClose,
}: ConfirmationModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const confirmationInputRef = useRef<HTMLInputElement | null>(null);
  const [typedValue, setTypedValue] = useState('');
  const requiresTypedConfirmation = Boolean(confirmationValue);
  const canConfirm = useMemo(() => {
    if (!requiresTypedConfirmation) return true;
    return typedValue.trim() === confirmationValue;
  }, [confirmationValue, requiresTypedConfirmation, typedValue]);

  useEffect(() => {
    if (!open) return;

    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    queueMicrotask(() => {
      if (confirmationValue) {
        confirmationInputRef.current?.focus();
      } else {
        primaryActionRef.current?.focus();
      }
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isLoading) {
        setTypedValue('');
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [confirmationValue, isLoading, onClose, open]);

  if (!open) return null;

  const isDanger = variant === 'danger';

  function handleClose() {
    if (isLoading) return;
    setTypedValue('');
    onClose();
  }

  function handleConfirm() {
    if (!canConfirm || isLoading) return;
    setTypedValue('');
    onConfirm();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface shadow-2xl"
      >
        <div className="flex items-start gap-4 px-6 py-5">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border ${
              isDanger
                ? 'border-red-500/20 bg-red-500/10 text-red-300'
                : 'border-primary/20 bg-primary/10 text-primary'
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-white">{title}</h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-neutral-400">{description}</p>
          </div>
        </div>

        {requiresTypedConfirmation && (
          <div className="px-6 pb-5">
            <label htmlFor="confirmationValue" className="block text-xs text-neutral-500 mb-1.5">
              {confirmationLabel ?? `Type "${confirmationValue}" to confirm`}
            </label>
            <input
              ref={confirmationInputRef}
              id="confirmationValue"
              type="text"
              value={typedValue}
              onChange={(event) => setTypedValue(event.target.value)}
              disabled={isLoading}
              className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-primary disabled:opacity-60"
              autoComplete="off"
            />
          </div>
        )}

        {error && (
          <div className="mx-6 mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button
            ref={primaryActionRef}
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="h-9 rounded-lg px-4 text-sm font-medium text-neutral-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || isLoading}
            className={`h-9 rounded-lg px-4 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              isDanger
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'bg-primary text-black hover:bg-primary-light'
            }`}
          >
            {isLoading ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
