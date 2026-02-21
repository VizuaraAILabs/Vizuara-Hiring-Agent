'use client';

import { useState } from 'react';
import type { CostSettings } from '@/types';

interface CostSettingsPanelProps {
  settings: CostSettings | null;
  onSave: (settings: Partial<CostSettings>) => Promise<void>;
}

export default function CostSettingsPanel({ settings, onSave }: CostSettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [vpsCost, setVpsCost] = useState(settings?.vps_monthly_cost_usd ?? 0);
  const [anthropicIn, setAnthropicIn] = useState(settings?.anthropic_input_rate ?? 3.0);
  const [anthropicOut, setAnthropicOut] = useState(settings?.anthropic_output_rate ?? 15.0);
  const [geminiIn, setGeminiIn] = useState(settings?.gemini_input_rate ?? 0.15);
  const [geminiOut, setGeminiOut] = useState(settings?.gemini_output_rate ?? 0.60);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        vps_monthly_cost_usd: vpsCost,
        anthropic_input_rate: anthropicIn,
        anthropic_output_rate: anthropicOut,
        gemini_input_rate: geminiIn,
        gemini_output_rate: geminiOut,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-[#111] border border-white/5 rounded-2xl">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-6 text-left"
      >
        <div>
          <h3 className="text-lg font-serif italic text-white">Cost Settings</h3>
          <p className="text-xs text-neutral-600 mt-0.5">Configure VPS costs and token rates</p>
        </div>
        <span className="text-neutral-500 text-lg">{open ? '-' : '+'}</span>
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-4">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">VPS Monthly Cost (USD)</label>
            <input
              type="number"
              step="0.01"
              value={vpsCost}
              onChange={(e) => setVpsCost(parseFloat(e.target.value) || 0)}
              className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00a854]/50 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Anthropic Input ($/M tokens)</label>
              <input
                type="number"
                step="0.01"
                value={anthropicIn}
                onChange={(e) => setAnthropicIn(parseFloat(e.target.value) || 0)}
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00a854]/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Anthropic Output ($/M tokens)</label>
              <input
                type="number"
                step="0.01"
                value={anthropicOut}
                onChange={(e) => setAnthropicOut(parseFloat(e.target.value) || 0)}
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00a854]/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Gemini Input ($/M tokens)</label>
              <input
                type="number"
                step="0.01"
                value={geminiIn}
                onChange={(e) => setGeminiIn(parseFloat(e.target.value) || 0)}
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00a854]/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Gemini Output ($/M tokens)</label>
              <input
                type="number"
                step="0.01"
                value={geminiOut}
                onChange={(e) => setGeminiOut(parseFloat(e.target.value) || 0)}
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#00a854]/50 focus:outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#00a854] hover:bg-[#00c96b] text-black px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
}
