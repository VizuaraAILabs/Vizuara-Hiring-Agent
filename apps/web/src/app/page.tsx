import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Navigation */}
      <nav className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-xl font-bold text-white">
            Hiring<span className="text-cyan-400">Agent</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-slate-400 hover:text-white text-sm transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-24 pb-16">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block bg-cyan-500/10 border border-cyan-500/20 rounded-full px-4 py-1.5 mb-8">
            <span className="text-cyan-400 text-sm font-medium">AI-Native Hiring Platform</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Evaluate how candidates{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400">
              collaborate with AI
            </span>
          </h1>

          <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
            Resumes and coding tests are unreliable signals in the AI era.
            Assess what actually matters: how effectively developers work with AI coding assistants.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link
              href="/register"
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-colors"
            >
              Start Evaluating
            </Link>
            <Link
              href="/login"
              className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-colors border border-slate-700"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-20 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-16">How it works</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Create a Challenge',
                description:
                  'Design a timed coding challenge that candidates will solve using Claude Code as their AI assistant.',
              },
              {
                step: '02',
                title: 'Candidates Solve',
                description:
                  'Candidates work in a browser terminal with Claude Code. Every interaction is logged and analyzed.',
              },
              {
                step: '03',
                title: 'Get Rich Reports',
                description:
                  'AI-powered analysis generates detailed reports scoring 8 collaboration dimensions with visual breakdowns.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="text-6xl font-bold text-slate-800 mb-4">{item.step}</div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dimensions */}
      <section className="px-6 py-20 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-4">8 Dimensions of AI Collaboration</h2>
          <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
            Each candidate is scored across 8 dimensions that capture the full picture of effective AI collaboration.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Problem Decomposition', color: 'from-cyan-500 to-blue-500' },
              { name: 'First Principles', color: 'from-blue-500 to-violet-500' },
              { name: 'Creativity', color: 'from-violet-500 to-purple-500' },
              { name: 'Iteration Quality', color: 'from-purple-500 to-pink-500' },
              { name: 'Debugging', color: 'from-pink-500 to-red-500' },
              { name: 'Architecture', color: 'from-red-500 to-orange-500' },
              { name: 'Communication', color: 'from-orange-500 to-amber-500' },
              { name: 'Efficiency', color: 'from-amber-500 to-emerald-500' },
            ].map((dim) => (
              <div
                key={dim.name}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center hover:border-slate-700 transition-colors"
              >
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${dim.color} mx-auto mb-3 opacity-80`} />
                <p className="text-sm font-medium text-white">{dim.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-8">
        <div className="max-w-5xl mx-auto text-center text-sm text-slate-600">
          HiringAgent &mdash; AI-Native Assessment Platform
        </div>
      </footer>
    </div>
  );
}
