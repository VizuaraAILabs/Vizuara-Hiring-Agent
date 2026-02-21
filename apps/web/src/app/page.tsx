'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import VizuaraLogo from '@/components/VizuaraLogo';

const fadeUp = {
  hidden: { opacity: 0, y: 30 } as const,
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } as const,
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const dimensions = [
  { name: 'Problem Decomposition', desc: 'Breaking complex problems into AI-solvable chunks', icon: '{}' },
  { name: 'First Principles', desc: 'Grounding prompts in fundamental understanding', icon: '>>>' },
  { name: 'Creativity', desc: 'Novel approaches to prompt construction', icon: '***' },
  { name: 'Iteration Quality', desc: 'Refining outputs through intelligent follow-ups', icon: '<=>' },
  { name: 'Debugging', desc: 'Identifying and resolving AI-generated issues', icon: '!?' },
  { name: 'Architecture', desc: 'Structuring code for AI-assisted development', icon: '#[]' },
  { name: 'Communication', desc: 'Clarity and precision in human-AI dialogue', icon: '...' },
  { name: 'Efficiency', desc: 'Minimizing tokens while maximizing output', icon: '->>' },
];

const steps = [
  {
    num: '01',
    title: 'Create a Challenge',
    desc: 'Design a timed coding challenge. Candidates solve it using Claude Code as their AI pair-programmer.',
  },
  {
    num: '02',
    title: 'Candidates Solve',
    desc: 'Candidates work in a sandboxed browser terminal. Every keystroke, prompt, and AI response is captured.',
  },
  {
    num: '03',
    title: 'AI-Powered Analysis',
    desc: 'Gemini analyzes the full session transcript and generates detailed reports scoring 8 collaboration dimensions.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <VizuaraLogo size={30} />
            <span className="text-lg font-semibold text-white">
              Arc<span className="text-[#00a854]">Eval</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-neutral-400 hover:text-white text-sm transition-colors px-4 py-2"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="bg-[#00a854] hover:bg-[#00c96b] text-black font-medium px-5 py-2 rounded-lg text-sm transition-all btn-glow"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[#00a854]/5 blur-[120px] pointer-events-none" />

        <motion.div
          className="max-w-4xl mx-auto text-center relative"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 border border-[#00a854]/20 bg-[#00a854]/5 rounded-full px-4 py-1.5 mb-8"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[#00a854] animate-pulse" />
            <span className="text-[#00a854] text-sm font-medium">AI Collaboration Assessment Platform</span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="text-5xl sm:text-6xl md:text-7xl font-serif italic leading-[1.1] mb-6 tracking-tight"
          >
            Evaluate how engineers{' '}
            <span className="gradient-text glow-text">collaborate with AI</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="text-lg md:text-xl text-neutral-400 mb-12 max-w-2xl mx-auto leading-relaxed"
          >
            Resumes and LeetCode are unreliable in the AI era. Assess what actually matters &mdash;
            how effectively developers work with AI coding assistants, in real time.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/register"
              className="bg-[#00a854] hover:bg-[#00c96b] text-black font-semibold px-8 py-4 rounded-xl text-lg transition-all btn-glow"
            >
              Start Evaluating
            </Link>
            <Link
              href="/login"
              className="border border-white/10 hover:border-white/20 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all hover:bg-white/5"
            >
              Sign In
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* How it works */}
      <section className="relative px-6 py-24">
        <div className="absolute inset-0 bg-dots opacity-30" />
        <div className="max-w-5xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-serif italic mb-4">
              How it <span className="gradient-text">works</span>
            </h2>
            <p className="text-neutral-500 text-lg max-w-xl mx-auto">
              Three steps from challenge to comprehensive AI-collaboration report.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
                className="group relative bg-[#111] border border-white/5 rounded-2xl p-8 hover:border-[#00a854]/20 transition-all duration-300"
              >
                <div className="absolute inset-0 rounded-2xl bg-[#00a854]/0 group-hover:bg-[#00a854]/[0.02] transition-colors duration-300" />
                <div className="relative">
                  <div className="text-5xl font-serif italic text-[#00a854]/20 mb-4">{step.num}</div>
                  <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
                  <p className="text-neutral-500 text-sm leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Preview */}
      <section className="relative px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-serif italic mb-4">
              The complete <span className="gradient-text">assessment pipeline</span>
            </h2>
            <p className="text-neutral-500 text-lg max-w-xl mx-auto">
              Sandboxed terminals, real-time interaction logging, and AI-powered analysis &mdash; all in one platform.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative rounded-2xl border border-white/5 bg-[#111] p-1 glow-green"
          >
            <div className="rounded-xl bg-[#0a0a0a] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <div className="flex-1 text-center text-xs text-neutral-600 font-mono">
                  candidate@sandbox:/workspace
                </div>
              </div>
              <div className="p-6 font-mono text-sm leading-relaxed">
                <div className="text-neutral-600">$ claude &quot;Help me implement a RAG retrieval strategy&quot;</div>
                <div className="mt-2 text-[#00a854]">
                  I&apos;ll help you build a RAG retrieval system. Let me start by analyzing the
                </div>
                <div className="text-[#00a854]">
                  requirements and breaking this into components...
                </div>
                <div className="mt-3 text-neutral-600">$ python test_retrieval.py</div>
                <div className="mt-1 text-neutral-400">Running 12 test cases...</div>
                <div className="text-[#00a854]">All tests passed (12/12)</div>
                <div className="mt-3 text-neutral-700 animate-pulse">_</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 8 Dimensions */}
      <section className="relative px-6 py-24">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="max-w-5xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-serif italic mb-4">
              8 dimensions of{' '}
              <span className="gradient-text">AI collaboration</span>
            </h2>
            <p className="text-neutral-500 text-lg max-w-xl mx-auto">
              Each candidate is scored across 8 dimensions that capture the full picture of effective human-AI collaboration.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {dimensions.map((dim, i) => (
              <motion.div
                key={dim.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
                className="group relative bg-[#111] border border-white/5 rounded-xl p-5 hover:border-[#00a854]/30 transition-all duration-300 cursor-default"
              >
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-b from-[#00a854]/[0.03] to-transparent" />
                <div className="relative">
                  <div className="text-xs font-mono text-[#00a854]/50 mb-3">{dim.icon}</div>
                  <h3 className="text-sm font-semibold text-white mb-1">{dim.name}</h3>
                  <p className="text-xs text-neutral-500 leading-relaxed">{dim.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Built With Section */}
      <section className="px-6 py-24 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-serif italic mb-4">
              Powered by the <span className="gradient-text">best in class</span>
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            {[
              { name: 'Claude Code', desc: 'AI coding assistant in sandbox' },
              { name: 'Docker', desc: 'Isolated candidate environments' },
              { name: 'Gemini', desc: 'Session analysis & scoring' },
              { name: 'Next.js', desc: 'Dashboard & real-time UI' },
            ].map((tech) => (
              <div
                key={tech.name}
                className="bg-[#111] border border-white/5 rounded-xl p-5 text-center"
              >
                <p className="text-white font-semibold text-sm mb-1">{tech.name}</p>
                <p className="text-neutral-600 text-xs">{tech.desc}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative px-6 py-24">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#00a854]/5 blur-[100px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center relative"
        >
          <h2 className="text-4xl md:text-5xl font-serif italic mb-6">
            Ready to hire engineers who{' '}
            <span className="gradient-text">think with AI</span>?
          </h2>
          <p className="text-neutral-500 text-lg mb-10 max-w-xl mx-auto">
            Stop guessing. Start measuring how candidates actually collaborate with AI coding assistants.
          </p>
          <Link
            href="/register"
            className="inline-block bg-[#00a854] hover:bg-[#00c96b] text-black font-semibold px-10 py-4 rounded-xl text-lg transition-all btn-glow"
          >
            Get Started Free
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <VizuaraLogo size={22} />
            <span className="text-sm text-neutral-500">
              Arc<span className="text-neutral-400">Eval</span>
            </span>
          </div>
          <p className="text-xs text-neutral-600">
            Powered by <span className="text-neutral-400">Vizuara AI</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
