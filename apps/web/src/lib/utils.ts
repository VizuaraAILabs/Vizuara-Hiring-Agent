import { type ClassValue, clsx } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-primary';
  if (score >= 60) return 'text-accent';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-400';
}

export function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-primary';
  if (score >= 60) return 'bg-accent';
  if (score >= 40) return 'bg-amber-400';
  return 'bg-red-400';
}

export function getRecommendationLabel(rec: string): string {
  const labels: Record<string, string> = {
    strong_yes: 'Strong Yes',
    yes: 'Yes',
    neutral: 'Neutral',
    no: 'No',
    strong_no: 'Strong No',
  };
  return labels[rec] || rec;
}

export function getRecommendationColor(rec: string): string {
  const colors: Record<string, string> = {
    strong_yes: 'bg-primary text-black',
    yes: 'bg-primary/80 text-black',
    neutral: 'bg-amber-400 text-black',
    no: 'bg-red-400 text-white',
    strong_no: 'bg-red-600 text-white',
  };
  return colors[rec] || 'bg-gray-400 text-white';
}

export function getDecisionLabel(decision: string | null | undefined): string {
  const labels: Record<string, string> = {
    shortlisted: 'Shortlisted',
    hold: 'Hold',
    reject: 'Reject',
    hired: 'Hired',
  };
  return decision ? labels[decision] || decision : 'No decision';
}

export function getDecisionColor(decision: string | null | undefined): string {
  const colors: Record<string, string> = {
    shortlisted: 'bg-primary/10 text-primary border-primary/20',
    hold: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    reject: 'bg-red-500/10 text-red-300 border-red-500/20',
    hired: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  };
  return decision
    ? colors[decision] || 'bg-neutral-800 text-neutral-400 border-white/10'
    : 'bg-neutral-900 text-neutral-500 border-white/10';
}
