'use client';

import type { RoleType } from './types';

const roles: { id: RoleType; icon: string; name: string; description: string }[] = [
  { id: 'full-stack', icon: '<>', name: 'Full-Stack', description: 'End-to-end web applications with frontend and backend' },
  { id: 'backend', icon: '{}', name: 'Backend', description: 'APIs, services, databases, and server-side logic' },
  { id: 'frontend', icon: '[]', name: 'Frontend', description: 'User interfaces, components, and client-side apps' },
  { id: 'data-ml', icon: 'f(x)', name: 'Data & ML', description: 'Data pipelines, analysis, and machine learning' },
  { id: 'devops', icon: '>/>', name: 'DevOps', description: 'Infrastructure, CI/CD, containers, and cloud' },
];

interface StepRoleSelectProps {
  onSelect: (role: RoleType) => void;
}

export default function StepRoleSelect({ onSelect }: StepRoleSelectProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-2">What role are you hiring for?</h2>
      <p className="text-neutral-500 mb-8">Select the role type to tailor challenge suggestions</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {roles.map((role) => (
          <button
            key={role.id}
            onClick={() => onSelect(role.id)}
            className="group flex flex-col items-center gap-3 p-6 bg-[#111] border border-white/10 rounded-xl hover:border-[#00a854]/50 hover:bg-[#00a854]/5 transition-all text-left cursor-pointer"
          >
            <span className="text-2xl font-mono text-[#00a854] group-hover:scale-110 transition-transform">
              {role.icon}
            </span>
            <span className="text-white font-medium">{role.name}</span>
            <span className="text-neutral-500 text-sm text-center">{role.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
