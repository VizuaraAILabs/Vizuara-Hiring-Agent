'use client';

import { Check, ChevronDown } from 'lucide-react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownProps {
  id?: string;
  value: string;
  options: DropdownOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
}

export default function Dropdown({
  id,
  value,
  options,
  onValueChange,
  placeholder = 'Select...',
  className = '',
  triggerClassName = '',
  menuClassName = '',
  disabled = false,
}: DropdownProps) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typeaheadRef = useRef('');
  const typeaheadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const selectedOption = options.find((option) => option.value === value);
  const enabledOptions = useMemo(
    () => options
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => !option.disabled),
    [options]
  );
  const selectedIndex = options.findIndex((option) => option.value === value);

  const getNextEnabledIndex = useCallback((currentIndex: number, direction: 1 | -1) => {
    if (enabledOptions.length === 0) return -1;

    const enabledIndexes = enabledOptions.map(({ index }) => index);
    const currentEnabledPosition = enabledIndexes.indexOf(currentIndex);
    const startPosition = currentEnabledPosition === -1
      ? direction === 1 ? -1 : 0
      : currentEnabledPosition;
    const nextPosition = (startPosition + direction + enabledIndexes.length) % enabledIndexes.length;

    return enabledIndexes[nextPosition];
  }, [enabledOptions]);

  const setActiveOption = useCallback((index: number) => {
    if (index < 0 || options[index]?.disabled) return;
    setActiveIndex(index);
    queueMicrotask(() => optionRefs.current[index]?.scrollIntoView({ block: 'nearest' }));
  }, [options]);

  const openMenu = useCallback(() => {
    if (disabled) return;
    const fallbackIndex = enabledOptions[0]?.index ?? 0;
    setActiveOption(selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : fallbackIndex);
    setOpen(true);
  }, [disabled, enabledOptions, options, selectedIndex, setActiveOption]);

  const selectOption = useCallback((index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;

    onValueChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }, [onValueChange, options]);

  const handleTypeahead = useCallback((key: string) => {
    if (typeaheadTimeoutRef.current) {
      clearTimeout(typeaheadTimeoutRef.current);
    }

    typeaheadRef.current += key.toLowerCase();
    typeaheadTimeoutRef.current = setTimeout(() => {
      typeaheadRef.current = '';
    }, 700);

    const query = typeaheadRef.current;
    const match = enabledOptions.find(({ option }) => option.label.toLowerCase().startsWith(query));
    if (match) {
      setActiveOption(match.index);
    }
  }, [enabledOptions, setActiveOption]);

  useEffect(() => {
    if (!open) return;

    function positionMenu() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportGap = 12;
      const maxHeight = Math.min(320, window.innerHeight - rect.bottom - viewportGap);

      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(180, maxHeight),
      });
    }

    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);

    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (typeaheadTimeoutRef.current) {
        clearTimeout(typeaheadTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveOption(getNextEnabledIndex(activeIndex, 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveOption(getNextEnabledIndex(activeIndex, -1));
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        setActiveOption(enabledOptions[0]?.index ?? -1);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        setActiveOption(enabledOptions.at(-1)?.index ?? -1);
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectOption(activeIndex);
        return;
      }

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        handleTypeahead(event.key);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeIndex, enabledOptions, getNextEnabledIndex, handleTypeahead, open, selectOption, setActiveOption]);

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu();
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      openMenu();
      handleTypeahead(event.key);
    }
  }

  const menu = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className={`z-[100] overflow-y-auto rounded-md border border-white/10 bg-[#0d0d0d] p-1 text-sm text-white shadow-2xl shadow-black/50 outline-none ${menuClassName}`}
          role="listbox"
          aria-labelledby={triggerId}
          id={`${triggerId}-listbox`}
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;
            return (
              <button
                key={option.value}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                id={`${triggerId}-option-${index}`}
                onMouseEnter={() => setActiveOption(index)}
                onClick={() => selectOption(index)}
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors ${
                  selected
                    ? 'bg-primary text-black'
                    : active
                      ? 'bg-white/8 text-white'
                      : 'text-neutral-200 hover:bg-white/8 hover:text-white'
                } disabled:pointer-events-none disabled:opacity-40`}
              >
                <Check className={`h-3.5 w-3.5 ${selected ? 'opacity-100' : 'opacity-0'}`} />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )
    : null;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${triggerId}-listbox`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 text-left text-sm text-white outline-none transition-colors hover:border-white/20 focus:border-primary disabled:cursor-not-allowed disabled:opacity-40 ${triggerClassName}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selectedOption ? '' : 'text-neutral-500'}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {menu}
    </div>
  );
}
