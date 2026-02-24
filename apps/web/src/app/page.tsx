'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import FPLLogo from '@/components/FPLLogo';
import { useState } from 'react';

const fadeUp = {
  hidden: { opacity: 0, y: 30 } as const,
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } as const,
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const dimensions = [
  { name: 'Problem Decomposition', desc: 'Can the candidate break complex problems into AI-solvable chunks?', icon: '{}' },
  { name: 'First-Principles Thinking', desc: 'Do they ground their prompts in fundamental understanding?', icon: '>>>' },
  { name: 'Creative Problem Solving', desc: 'Do they find novel approaches to prompt construction?', icon: '***' },
  { name: 'Iteration Quality', desc: 'Can they refine AI outputs through intelligent follow-ups?', icon: '<=>' },
  { name: 'Debugging with AI', desc: 'How effectively do they identify and resolve AI-generated issues?', icon: '!?' },
  { name: 'Architecture Decisions', desc: 'Do they structure code well for AI-assisted development?', icon: '#[]' },
  { name: 'Communication Clarity', desc: 'How precise and effective is their human-AI dialogue?', icon: '...' },
  { name: 'Token Efficiency', desc: 'Do they minimize tokens while maximizing output quality?', icon: '->>' },
];

const steps = [
  {
    num: '01',
    title: 'Create a Challenge',
    desc: 'Design timed coding challenges in minutes. Choose from templates or create custom assessments tailored to your role.',
  },
  {
    num: '02',
    title: 'Share One Link',
    desc: 'Send a single assessment link to all candidates. They enter their details and begin immediately — no account setup required.',
  },
  {
    num: '03',
    title: 'Get AI-Scored Reports',
    desc: 'Every interaction is captured and analyzed. Receive detailed scoring across 8 dimensions with side-by-side candidate comparisons.',
  },
];

const pricingPlans = [
  {
    name: 'Starter',
    price: 149,
    period: '/month',
    assessments: '50 assessments/month',
    desc: 'For teams starting to evaluate AI collaboration skills.',
    features: [
      'Up to 50 candidate assessments',
      '8-dimension AI scoring reports',
      'Shareable assessment links',
      'Candidate comparison dashboard',
      'Email support',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Growth',
    price: 499,
    period: '/month',
    assessments: '250 assessments/month',
    desc: 'For scaling engineering teams with high-volume hiring.',
    features: [
      'Up to 250 candidate assessments',
      'Everything in Starter, plus:',
      'Custom challenge templates',
      'Team collaboration & notes',
      'Priority support',
      'CSV & API data export',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: null,
    period: '',
    assessments: 'Unlimited assessments',
    desc: 'For organizations with custom security, compliance, and volume needs.',
    features: [
      'Unlimited candidate assessments',
      'Everything in Growth, plus:',
      'SSO / SAML integration',
      'Custom branding',
      'Dedicated account manager',
      'SLA & uptime guarantee',
      'On-premise deployment option',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
];

const stats = [
  { value: '8', label: 'Scoring Dimensions' },
  { value: '< 2 min', label: 'Report Generation' },
  { value: '90%+', label: 'Completion Rate' },
  { value: '67%', label: 'Faster Time-to-Hire' },
];

const faqs = [
  {
    q: 'How is this different from HackerRank or Codility?',
    a: 'Traditional platforms test if a candidate can solve algorithm puzzles alone. ArcEval tests how effectively they collaborate with AI — which is how modern engineering actually works. Candidates get a real AI coding assistant and solve real-world challenges, not contrived puzzles.',
  },
  {
    q: 'What does the candidate experience look like?',
    a: 'Candidates click a link, enter their details, and land in a browser-based terminal with an AI coding assistant. They solve a timed challenge using natural conversation with AI — no downloads, no IDE setup, no friction.',
  },
  {
    q: 'How is the assessment scored?',
    a: 'Our AI analysis engine reviews the complete session transcript — every prompt, response, edit, and command. It scores candidates across 8 dimensions of AI collaboration, from problem decomposition to token efficiency, producing a detailed report with evidence citations.',
  },
  {
    q: 'Can I create custom challenges?',
    a: 'Yes. You can create challenges tailored to your tech stack, difficulty level, and time constraints. Include starter files, test suites, and specific requirements. We also offer pre-built challenge templates.',
  },
  {
    q: 'How long does a typical assessment take?',
    a: 'Most challenges are designed for 30-60 minutes. You set the time limit when creating the challenge. Reports are generated automatically within 2 minutes of completion.',
  },
  {
    q: 'Is candidate data secure?',
    a: 'Each candidate works in an isolated, sandboxed container that is destroyed after the session. No candidate has access to another candidate\'s work. Session data is encrypted at rest and in transit.',
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <FPLLogo size={30} />
            <span className="text-lg font-semibold text-white">
              Arc<span className="text-[#00a854]">Eval</span>
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-neutral-400">
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
            <Link href="/about" className="hover:text-white transition-colors">About Us</Link>
          </div>
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
      <section className="relative pt-36 pb-20 px-6">
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
            <span className="text-[#00a854] text-sm font-medium">The AI Collaboration Assessment Platform</span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="text-5xl sm:text-6xl md:text-7xl font-serif italic leading-[1.1] mb-6 tracking-tight"
          >
            Hire engineers who{' '}
            <span className="gradient-text glow-text">think with AI</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="text-lg md:text-xl text-neutral-400 mb-12 max-w-2xl mx-auto leading-relaxed"
          >
            Resumes and LeetCode can&apos;t measure what matters most in 2026 &mdash;
            how effectively engineers collaborate with AI. ArcEval gives candidates a real
            AI coding assistant and scores exactly how they use it.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/register"
              className="bg-[#00a854] hover:bg-[#00c96b] text-black font-semibold px-8 py-4 rounded-xl text-lg transition-all btn-glow"
            >
              Start Free Trial
            </Link>
            <a
              href="#how-it-works"
              className="border border-white/10 hover:border-white/20 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all hover:bg-white/5"
            >
              See How It Works
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* Stats Bar */}
      <section className="px-6 py-12 border-t border-b border-white/5">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="text-center"
            >
              <div className="text-3xl md:text-4xl font-serif italic text-white mb-1">{stat.value}</div>
              <div className="text-sm text-neutral-500">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Problem Statement */}
      <section className="px-6 py-24">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-serif italic mb-6">
              Traditional assessments are{' '}
              <span className="gradient-text">broken</span>
            </h2>
            <p className="text-neutral-400 text-lg max-w-2xl mx-auto leading-relaxed">
              85% of developers now use AI coding assistants daily. Yet every major hiring platform
              still tests candidates in isolation — banning the very tools they&apos;ll use on the job.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="bg-[#111] border border-red-500/10 rounded-2xl p-8"
            >
              <div className="text-red-400/60 text-sm font-mono mb-4">LEGACY APPROACH</div>
              <ul className="space-y-3 text-neutral-400 text-sm">
                <li className="flex items-start gap-3">
                  <span className="text-red-400/60 mt-0.5">x</span>
                  <span>Algorithmic puzzles that don&apos;t reflect real work</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400/60 mt-0.5">x</span>
                  <span>AI tools banned — testing a reality that no longer exists</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400/60 mt-0.5">x</span>
                  <span>Pass/fail scoring with no insight into problem-solving process</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400/60 mt-0.5">x</span>
                  <span>Candidates memorize solutions — high false positive rates</span>
                </li>
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="bg-[#111] border border-[#00a854]/20 rounded-2xl p-8"
            >
              <div className="text-[#00a854] text-sm font-mono mb-4">ARCEVAL APPROACH</div>
              <ul className="space-y-3 text-neutral-400 text-sm">
                <li className="flex items-start gap-3">
                  <span className="text-[#00a854] mt-0.5">+</span>
                  <span>Real-world challenges that mirror actual engineering tasks</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[#00a854] mt-0.5">+</span>
                  <span>AI assistant included — test the skill that actually matters</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[#00a854] mt-0.5">+</span>
                  <span>8-dimension analysis of problem-solving and AI collaboration</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[#00a854] mt-0.5">+</span>
                  <span>Every prompt, edit, and decision captured — impossible to fake</span>
                </li>
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative px-6 py-24">
        <div className="absolute inset-0 bg-dots opacity-30" />
        <div className="max-w-5xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
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
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
                className="group relative bg-[#111] border border-white/5 rounded-2xl p-8 hover:border-[#00a854]/20 transition-all duration-300"
              >
                <div className="absolute inset-0 rounded-2xl bg-[#00a854]/0 group-hover:bg-[#00a854]/[0.02] transition-colors duration-300" />
                <div className="relative">
                  <div className="text-5xl font-serif italic text-[#00a854]/40 mb-4">{step.num}</div>
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
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-serif italic mb-4">
              A real <span className="gradient-text">engineering environment</span>
            </h2>
            <p className="text-neutral-500 text-lg max-w-xl mx-auto">
              Candidates work in a sandboxed terminal with a real AI coding assistant.
              No multiple choice. No contrived puzzles. Real engineering.
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
                <div className="text-neutral-600">$ claude &quot;Help me implement a rate limiter using a sliding window algorithm&quot;</div>
                <div className="mt-2 text-[#00a854]">
                  I&apos;ll implement a sliding window rate limiter. Let me start by designing the
                </div>
                <div className="text-[#00a854]">
                  data structure and then build the middleware...
                </div>
                <div className="mt-3 text-neutral-600">$ npm test</div>
                <div className="mt-1 text-neutral-400">Running 18 test cases...</div>
                <div className="text-[#00a854]">All tests passed (18/18)</div>
                <div className="mt-3 text-neutral-700 animate-pulse">_</div>
              </div>
            </div>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-center text-neutral-600 text-sm mt-6"
          >
            Every prompt, response, and command is recorded and analyzed by our AI scoring engine.
          </motion.p>
        </div>
      </section>

      {/* 8 Dimensions */}
      <section className="relative px-6 py-24">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="max-w-5xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-serif italic mb-4">
              8 dimensions of{' '}
              <span className="gradient-text">AI collaboration</span>
            </h2>
            <p className="text-neutral-500 text-lg max-w-xl mx-auto">
              Go beyond pass/fail. Understand exactly how each candidate thinks, communicates, and collaborates with AI.
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

      {/* Pricing */}
      <section id="pricing" className="relative px-6 py-24 border-t border-white/5">
        <div className="absolute inset-0 bg-dots opacity-20" />
        <div className="max-w-5xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-serif italic mb-4">
              Simple, transparent{' '}
              <span className="gradient-text">pricing</span>
            </h2>
            <p className="text-neutral-500 text-lg max-w-xl mx-auto">
              Start with a 14-day free trial. No credit card required. Scale as your hiring grows.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pricingPlans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
                className={`relative bg-[#111] rounded-2xl p-8 flex flex-col ${
                  plan.popular
                    ? 'border-2 border-[#00a854]/40 ring-1 ring-[#00a854]/20'
                    : 'border border-white/5'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-[#00a854] text-black text-xs font-bold px-4 py-1.5 rounded-full">
                      MOST POPULAR
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                  <p className="text-neutral-500 text-sm">{plan.desc}</p>
                </div>

                <div className="mb-6">
                  {plan.price !== null ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-serif italic text-white">${plan.price}</span>
                      <span className="text-neutral-500 text-sm">{plan.period}</span>
                    </div>
                  ) : (
                    <div className="text-4xl font-serif italic text-white">Custom</div>
                  )}
                  <div className="text-[#00a854] text-sm font-medium mt-2">{plan.assessments}</div>
                </div>

                <ul className="space-y-3 mb-8 flex-grow">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <span className="text-[#00a854] mt-0.5 flex-shrink-0">+</span>
                      <span className="text-neutral-400">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.price !== null ? '/register' : 'mailto:raj@firstprinciplelabs.ai'}
                  className={`block text-center font-semibold py-3.5 rounded-xl text-sm transition-all ${
                    plan.popular
                      ? 'bg-[#00a854] hover:bg-[#00c96b] text-black btn-glow'
                      : 'border border-white/10 hover:border-white/20 text-white hover:bg-white/5'
                  }`}
                >
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-center text-neutral-600 text-sm mt-8"
          >
            All plans include a 14-day free trial. Billed annually for 20% savings.
            Need a custom volume? <a href="mailto:raj@firstprinciplelabs.ai" className="text-[#00a854] hover:underline">Talk to us</a>.
          </motion.p>
        </div>
      </section>

      {/* Social Proof / Why Companies Choose ArcEval */}
      <section className="px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-serif italic mb-4">
              Why teams choose{' '}
              <span className="gradient-text">ArcEval</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: '10x More Signal',
                desc: 'Traditional assessments capture a final answer. ArcEval captures the entire problem-solving journey — every prompt, every iteration, every decision.',
              },
              {
                title: 'Zero Candidate Friction',
                desc: 'No downloads, no IDE setup, no account creation. Candidates click a link and start coding in their browser within seconds.',
              },
              {
                title: 'Unfakeable Results',
                desc: 'When every interaction is recorded and analyzed, there\'s no way to memorize solutions or game the system. You see real collaboration skills.',
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
                className="bg-[#111] border border-white/5 rounded-2xl p-8"
              >
                <h3 className="text-lg font-semibold text-white mb-3">{item.title}</h3>
                <p className="text-neutral-500 text-sm leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-6 py-24 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-serif italic mb-4">
              Frequently asked{' '}
              <span className="gradient-text">questions</span>
            </h2>
          </motion.div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
                className="bg-[#111] border border-white/5 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left"
                >
                  <span className="text-sm font-medium text-white pr-4">{faq.q}</span>
                  <span className={`text-neutral-500 text-lg flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-45' : ''}`}>
                    +
                  </span>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 -mt-1">
                    <p className="text-neutral-500 text-sm leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
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
            Ready to hire for the{' '}
            <span className="gradient-text">AI era</span>?
          </h2>
          <p className="text-neutral-500 text-lg mb-10 max-w-xl mx-auto">
            Join engineering teams that evaluate what actually matters. Start your free trial today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-block bg-[#00a854] hover:bg-[#00c96b] text-black font-semibold px-10 py-4 rounded-xl text-lg transition-all btn-glow"
            >
              Start Free Trial
            </Link>
            <a
              href="mailto:raj@firstprinciplelabs.ai"
              className="inline-block border border-white/10 hover:border-white/20 text-white font-semibold px-10 py-4 rounded-xl text-lg transition-all hover:bg-white/5"
            >
              Talk to Sales
            </a>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <FPLLogo size={22} />
            <span className="text-sm text-neutral-500">
              Arc<span className="text-neutral-400">Eval</span>
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-neutral-600">
            <Link href="/about" className="hover:text-neutral-400 transition-colors">About Us</Link>
            <a href="mailto:raj@firstprinciplelabs.ai" className="hover:text-neutral-400 transition-colors">Contact</a>
            <span>Built by <span className="text-neutral-400">First Principle Labs</span></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
