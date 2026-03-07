'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const PRESET_TITLES = [
  'Founder',
  'Co-Founder',
  'CEO',
  'CTO',
  'Engineering Manager',
  'Engineering Lead',
  'Hiring Manager',
  'HR Manager',
  'Recruiter',
  'Technical Recruiter',
  'People Operations',
];

interface ProfileData {
  name: string;
  contactName: string;
  contactTitle: string;
}

function resolveSelectValue(title: string): string {
  if (title === '') return '';
  return PRESET_TITLES.includes(title) ? title : '__other__';
}

export default function ProfilePage() {
  const { refreshUser } = useAuth();
  const [form, setForm] = useState<ProfileData>({ name: '', contactName: '', contactTitle: '' });
  const [selectValue, setSelectValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d) => {
        const title = d.contactTitle ?? '';
        setForm({ name: d.name ?? '', contactName: d.contactName ?? '', contactTitle: title });
        setSelectValue(resolveSelectValue(title));
      })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectChange = (val: string) => {
    setSelectValue(val);
    if (val !== '__other__') {
      setForm((f) => ({ ...f, contactTitle: val }));
    } else {
      setForm((f) => ({ ...f, contactTitle: '' }));
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Company name is required.'); return; }
    setSaving(true);
    setError('');
    setSaved(false);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      await refreshUser();
      setTimeout(() => setSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? 'Failed to save.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto space-y-4 mt-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-[#111] border border-white/5 rounded-2xl p-5 animate-pulse h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-serif italic text-white">Profile</h1>
        <p className="text-neutral-500 mt-1">Manage your company and account details</p>
      </div>

      <div className="bg-[#111] border border-white/5 rounded-2xl p-6 space-y-6">

        {/* Company name */}
        <div className="space-y-1.5">
          <label className="text-xs text-neutral-400 uppercase tracking-wider font-medium">
            Company Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Acme Corp"
            className="w-full bg-[#0a0a0a] border-2 border-[#c0c0c0] rounded-[10px] px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-primary transition-colors cursor-text"
          />
        </div>

        <div className="border-t border-white/5" />

        {/* Contact name */}
        <div className="space-y-1.5">
          <label className="text-xs text-neutral-400 uppercase tracking-wider font-medium">
            Your Name
          </label>
          <input
            type="text"
            value={form.contactName}
            onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
            placeholder="Jane Smith"
            className="w-full bg-[#0a0a0a] border-2 border-[#c0c0c0] rounded-[10px] px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-primary transition-colors cursor-text"
          />
          <p className="text-xs text-neutral-600">The person managing this account on behalf of the company.</p>
        </div>

        {/* Contact title */}
        <div className="space-y-1.5">
          <label className="text-xs text-neutral-400 uppercase tracking-wider font-medium">
            Your Title
          </label>
          <select
            value={selectValue}
            onChange={(e) => handleSelectChange(e.target.value)}
            className="w-full bg-[#0a0a0a] border-2 border-[#c0c0c0] rounded-[10px] px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary transition-colors cursor-pointer"
          >
            <option value="">Select a title…</option>
            {PRESET_TITLES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
            <option value="__other__">Other…</option>
          </select>
          {selectValue === '__other__' && (
            <input
              type="text"
              value={form.contactTitle}
              onChange={(e) => setForm((f) => ({ ...f, contactTitle: e.target.value }))}
              placeholder="Enter your title"
              autoFocus
              className="w-full bg-[#0a0a0a] border-2 border-[#c0c0c0] rounded-[10px] px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-primary transition-colors cursor-text"
            />
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold py-2.5 rounded-xl text-sm transition-colors cursor-pointer"
        >
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
