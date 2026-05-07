'use client';

import { useState } from 'react';
import type { RoleType, WizardInputs, GeneratedChallenge } from './types';
import StepRoleSelect from './StepRoleSelect';
import StepDetails from './StepDetails';
import StepLoading from './StepLoading';
import StepResults from './StepResults';

const stepLabels = ['Role', 'Details', 'Generating', 'Results'];

export default function WizardContainer() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<RoleType | null>(null);
  const [wizardInputs, setWizardInputs] = useState<WizardInputs | null>(null);
  const [challenges, setChallenges] = useState<GeneratedChallenge[]>([]);
  const [error, setError] = useState('');

  function handleRoleSelect(selectedRole: RoleType) {
    setRole(selectedRole);
    setStep(2);
  }

  async function handleDetailsSubmit(inputs: WizardInputs) {
    setWizardInputs(inputs);
    setError('');
    setStep(3);

    try {
      const res = await fetch('/api/challenges/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: inputs.role,
          tech_stack: inputs.techStack,
          seniority: inputs.seniority,
          focus_areas: inputs.focusAreas,
          context: inputs.context || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to generate challenges. Please try again.');
        setStep(2);
        return;
      }

      const data = await res.json();
      setChallenges(data.challenges);
      setStep(4);
    } catch {
      setError('Network error. Please check your connection and try again.');
      setStep(2);
    }
  }

  function handleRegenerate() {
    if (wizardInputs) {
      handleDetailsSubmit(wizardInputs);
    }
  }

  function handleBackToDetails() {
    setStep(2);
  }

  // Determine the furthest completed step for the progress indicator
  const activeStep = step;

  return (
    <div>
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-0 mb-10">
        {stepLabels.map((label, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === activeStep;
          const isCompleted = stepNum < activeStep;

          return (
            <div key={label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary text-black'
                      : isCompleted
                        ? 'bg-primary/20 text-primary border border-primary/40'
                        : 'bg-surface text-neutral-600 border border-white/10'
                  }`}
                >
                  {isCompleted ? '\u2713' : stepNum}
                </div>
                <span
                  className={`text-xs mt-1.5 ${
                    isActive ? 'text-primary' : isCompleted ? 'text-neutral-500' : 'text-neutral-600'
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < stepLabels.length - 1 && (
                <div
                  className={`w-12 sm:w-20 h-px mx-2 mb-5 ${
                    stepNum < activeStep ? 'bg-primary/40' : 'bg-white/10'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Error banner */}
      {error && step !== 3 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      {/* Steps */}
      {step === 1 && <StepRoleSelect onSelect={handleRoleSelect} />}

      {step === 2 && role && (
        <StepDetails
          role={role}
          onBack={() => setStep(1)}
          onSubmit={handleDetailsSubmit}
        />
      )}

      {step === 3 && <StepLoading />}

      {step === 4 && (
        <StepResults
          challenges={challenges}
          timeLimitMin={wizardInputs?.time_limit_min ?? 30}
          role={wizardInputs?.role ?? null}
          techStack={wizardInputs?.techStack ?? []}
          seniority={wizardInputs?.seniority ?? null}
          focusAreas={wizardInputs?.focusAreas ?? []}
          context={wizardInputs?.context ?? null}
          onRegenerate={handleRegenerate}
          onBack={handleBackToDetails}
        />
      )}
    </div>
  );
}
