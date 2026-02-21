import CreateChallengeForm from '@/components/dashboard/CreateChallengeForm';

export default function NewChallengePage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">New Challenge</h1>
        <p className="text-slate-400 mt-1">Create an AI-collaboration assessment for candidates</p>
      </div>
      <CreateChallengeForm />
    </div>
  );
}
