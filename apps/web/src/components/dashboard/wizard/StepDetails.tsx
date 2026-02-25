'use client';

import { useState } from 'react';
import type { RoleType, SeniorityLevel, FocusArea, WizardInputs } from './types';

const techSuggestions: Record<RoleType, string[]> = {
  backend: ['Node.js', 'Python', 'Go', 'Java', 'Express', 'FastAPI', 'Django', 'PostgreSQL', 'MongoDB', 'Redis', 'GraphQL'],
  frontend: ['React', 'Vue', 'Angular', 'Next.js', 'TypeScript', 'Tailwind CSS', 'Redux'],
  'full-stack': ['React', 'Next.js', 'Node.js', 'TypeScript', 'Python', 'PostgreSQL', 'MongoDB', 'Redis', 'Express', 'Tailwind CSS', 'GraphQL'],
  'data-ml': ['Python', 'pandas', 'scikit-learn', 'SQL', 'Spark', 'PyTorch', 'TensorFlow'],
  devops: ['Docker', 'Kubernetes', 'Terraform', 'AWS', 'GCP', 'Bash', 'Ansible'],
};

const seniorityOptions: { value: SeniorityLevel; label: string }[] = [
  { value: 'junior', label: 'Junior (0-2 yrs)' },
  { value: 'mid', label: 'Mid-Level (2-5 yrs)' },
  { value: 'senior', label: 'Senior (5-8 yrs)' },
  { value: 'staff', label: 'Staff / Principal (8+ yrs)' },
];

const focusOptions: { value: FocusArea; label: string }[] = [
  { value: 'debugging', label: 'Debugging' },
  { value: 'system-design', label: 'System Design' },
  { value: 'api-design', label: 'API Design' },
  { value: 'testing', label: 'Testing' },
  { value: 'refactoring', label: 'Refactoring' },
  { value: 'performance', label: 'Performance' },
  { value: 'security', label: 'Security' },
  { value: 'data-modeling', label: 'Data Modeling' },
];

interface StepDetailsProps {
  role: RoleType;
  onBack: () => void;
  onSubmit: (inputs: WizardInputs) => void;
}

export default function StepDetails({ role, onBack, onSubmit }: StepDetailsProps) {
  const [techStack, setTechStack] = useState<string[]>([]);
  const [customTech, setCustomTech] = useState('');
  const [seniority, setSeniority] = useState<SeniorityLevel>('mid');
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [context, setContext] = useState('');

  const suggestions = techSuggestions[role];

  function addTech(tech: string) {
    const trimmed = tech.trim();
    if (trimmed && !techStack.includes(trimmed)) {
      setTechStack([...techStack, trimmed]);
    }
  }

  function removeTech(tech: string) {
    setTechStack(techStack.filter((t) => t !== tech));
  }

  function handleCustomTechKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (customTech.trim()) {
        addTech(customTech);
        setCustomTech('');
      }
    }
  }

  function toggleFocus(area: FocusArea) {
    if (focusAreas.includes(area)) {
      setFocusAreas(focusAreas.filter((a) => a !== area));
    } else if (focusAreas.length < 4) {
      setFocusAreas([...focusAreas, area]);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ role, techStack, seniority, focusAreas, context });
  }

  const canSubmit = techStack.length > 0 && focusAreas.length > 0;

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Configure your challenge</h2>
        <p className="text-neutral-500">Tell us about the role so we can tailor the challenges</p>
      </div>

      {/* Tech Stack */}
      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-3">
          Tech Stack <span className="text-neutral-600">(click to add or type your own)</span>
        </label>

        {/* Selected pills */}
        {techStack.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {techStack.map((tech) => (
              <span
                key={tech}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00a854]/10 border border-[#00a854]/30 text-[#00a854] rounded-full text-sm"
              >
                {tech}
                <button
                  type="button"
                  onClick={() => removeTech(tech)}
                  className="hover:text-white transition-colors"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Suggestion chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {suggestions
            .filter((s) => !techStack.includes(s))
            .map((tech) => (
              <button
                key={tech}
                type="button"
                onClick={() => addTech(tech)}
                className="px-3 py-1.5 bg-[#111] border border-white/10 text-neutral-400 rounded-full text-sm hover:border-[#00a854]/30 hover:text-white transition-all"
              >
                + {tech}
              </button>
            ))}
        </div>

        {/* Custom input */}
        <input
          type="text"
          value={customTech}
          onChange={(e) => setCustomTech(e.target.value)}
          onKeyDown={handleCustomTechKeyDown}
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 focus:border-[#00a854]/50 transition-all text-sm"
          placeholder="Type a technology and press Enter..."
        />
      </div>

      {/* Seniority */}
      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-3">Seniority Level</label>
        <select
          value={seniority}
          onChange={(e) => setSeniority(e.target.value as SeniorityLevel)}
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 focus:border-[#00a854]/50 transition-all"
        >
          {seniorityOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Focus Areas */}
      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-1">
          Focus Areas <span className="text-neutral-600">(select 1-4)</span>
        </label>
        <p className="text-xs text-neutral-600 mb-3">What skills should the challenge emphasize?</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {focusOptions.map((opt) => {
            const selected = focusAreas.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleFocus(opt.value)}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  selected
                    ? 'bg-[#00a854]/10 border-[#00a854]/50 text-[#00a854]'
                    : 'bg-[#111] border-white/10 text-neutral-400 hover:border-white/20 hover:text-neutral-300'
                } ${!selected && focusAreas.length >= 4 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Context */}
      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-2">
          Additional Context <span className="text-neutral-600">(optional)</span>
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={3}
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 focus:border-[#00a854]/50 transition-all text-sm"
          placeholder="Tell us about your team, product, or specific requirements..."
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-3 border border-white/10 text-neutral-400 rounded-xl hover:text-white hover:border-white/20 transition-all"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-[#00a854] hover:bg-[#00c96b] disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold px-6 py-3 rounded-xl transition-all btn-glow"
        >
          Generate Challenges
        </button>
      </div>
    </form>
  );
}
