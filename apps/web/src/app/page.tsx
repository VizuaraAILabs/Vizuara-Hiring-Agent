'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import FPLLogo from '@/components/FPLLogo';
import { useState } from 'react';

const VIZUARA_URL = process.env.NEXT_PUBLIC_VIZUARA_URL || 'https://vizuara.ai';
const APP_CALLBACK_URL = process.env.NEXT_PUBLIC_APP_CALLBACK_URL || 'https://hire.vizuara.ai/api/auth/session';
const SIGNUP_URL = `${VIZUARA_URL}/auth/signup?redirect=${encodeURIComponent(APP_CALLBACK_URL)}`;

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

const roleCategories = [
  {
    id: 'fullstack',
    name: 'Full-Stack',
    description: 'End-to-end engineers who work across the entire stack.',
    challenges: [
      {
        title: 'Fix the Broken Checkout Flow',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'An e-commerce checkout has 5 interrelated bugs across frontend validation, API error handling, database transactions, and Stripe integration. Fixing one bug reveals the next — requiring systematic debugging across React, Node.js, and PostgreSQL.',
        tags: ['React', 'Node.js', 'PostgreSQL', 'Stripe'],
      },
      {
        title: 'Add Real-Time Collaboration to a Doc Editor',
        difficulty: 'Expert',
        duration: '75 min',
        description: 'A working collaborative document editor has no live presence. Add WebSocket-based cursor tracking, user avatars, and operational-transform conflict resolution to an existing Slate.js + Express codebase without breaking the save pipeline.',
        tags: ['WebSockets', 'Slate.js', 'Express', 'OT/CRDT'],
      },
      {
        title: 'Debug the Performance Crisis',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'A full-stack dashboard loads in 14 seconds. The candidate must identify and fix N+1 queries in the API, excessive React re-renders, a missing database index, an uncompressed 3MB bundle, and a memory-leaking useEffect — each fix depends on profiling the previous one.',
        tags: ['React', 'SQL', 'Webpack', 'Profiling'],
      },
      {
        title: 'Implement Multi-Tenant Data Isolation',
        difficulty: 'Expert',
        duration: '75 min',
        description: 'An existing SaaS app is leaking data between tenants. The candidate must audit the codebase, implement row-level security in PostgreSQL, scope API middleware, fix the frontend context provider, and verify isolation with existing test suites — all without breaking current functionality.',
        tags: ['PostgreSQL RLS', 'Express', 'React Context', 'Auth'],
      },
      {
        title: 'Migrate REST Endpoints to GraphQL',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'Convert 6 REST endpoints to a GraphQL API while keeping the existing REST routes working for backward compatibility. Requires understanding the data model, designing the schema, implementing resolvers with DataLoader for batching, and updating the React frontend to use Apollo Client.',
        tags: ['GraphQL', 'Apollo', 'DataLoader', 'REST'],
      },
    ],
  },
  {
    id: 'backend',
    name: 'Backend',
    description: 'Server-side engineers building APIs, services, and infrastructure.',
    challenges: [
      {
        title: 'Design a Retrieval Strategy for RAG',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'A Retrieval-Augmented Generation system returns irrelevant results. Implement hybrid search combining BM25 and semantic embeddings, add Reciprocal Rank Fusion, tune chunking strategies, and build an evaluation harness — each component must be validated before integrating with the next.',
        tags: ['Python', 'Embeddings', 'BM25', 'RAG'],
      },
      {
        title: 'Refactor the Monolith Into Services',
        difficulty: 'Expert',
        duration: '75 min',
        description: 'Extract the notification system from a tightly-coupled Django monolith into a standalone service. Requires tracing dependencies through 12 files, designing an async message contract, implementing a Celery-based bridge for backward compatibility, and ensuring zero downtime during the migration.',
        tags: ['Django', 'Celery', 'Message Queues', 'API Design'],
      },
      {
        title: 'Build a Distributed Rate Limiter',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'Implement a production-grade rate limiter using Redis sliding windows. Handle edge cases: burst allowance, per-user vs per-IP limits, race conditions under concurrent requests, graceful degradation when Redis is down, and proper HTTP 429 responses with Retry-After headers.',
        tags: ['Redis', 'Lua Scripts', 'Node.js', 'Concurrency'],
      },
      {
        title: 'Debug the Silent Data Corruption',
        difficulty: 'Expert',
        duration: '75 min',
        description: 'A data processing pipeline produces incorrect totals intermittently. The candidate must trace the issue through a Kafka consumer, a timezone conversion bug, a floating-point accumulation error, and a race condition in the batch writer — each layer hiding the next.',
        tags: ['Kafka', 'Python', 'PostgreSQL', 'Debugging'],
      },
      {
        title: 'Implement Event Sourcing for Order System',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'Convert a CRUD-based order management system to event sourcing. Design the event schema, implement the event store, build projections for read models, handle schema evolution for existing orders, and ensure idempotent event replay — the existing 200+ test suite must continue to pass.',
        tags: ['Event Sourcing', 'Node.js', 'PostgreSQL', 'CQRS'],
      },
    ],
  },
  {
    id: 'frontend',
    name: 'Frontend',
    description: 'UI/UX engineers building responsive, accessible interfaces.',
    challenges: [
      {
        title: 'Fix the Accessibility Audit Failures',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'A component library is failing 15+ WCAG 2.1 AA violations. Fix keyboard navigation traps in modals, missing ARIA labels on dynamic content, color contrast issues in the theme system, broken screen reader announcements for live regions, and focus management in the dropdown menu — each fix requires understanding how assistive technologies parse the DOM.',
        tags: ['ARIA', 'WCAG 2.1', 'React', 'Screen Readers'],
      },
      {
        title: 'Build a Complex Multi-Step Form Wizard',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'Implement a 5-step application form with conditional step logic (Step 3 varies based on Step 1 answers), cross-field validation, autosave to localStorage, resume-from-draft, animated transitions, and graceful error recovery. The form schema is provided but the validation rules have interdependencies.',
        tags: ['React Hook Form', 'Zod', 'Framer Motion', 'TypeScript'],
      },
      {
        title: 'Optimize the Rendering Nightmare',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'A React dashboard re-renders 400+ components on every keystroke in the search bar. Identify and fix: missing memo boundaries, an incorrectly structured context provider causing cascade re-renders, an expensive filter running on every render, virtualization needed for a 10K-row table, and a bundle with 800KB of unused lodash.',
        tags: ['React.memo', 'useMemo', 'Virtualization', 'Bundle Analysis'],
      },
      {
        title: 'Implement Offline-First Data Sync',
        difficulty: 'Expert',
        duration: '75 min',
        description: 'Add offline support to an existing task management app. Implement IndexedDB storage, a sync queue for pending mutations, conflict resolution when the server state diverges, optimistic UI updates, and a connection status banner — the tricky part is handling merge conflicts when two offline users edit the same task.',
        tags: ['IndexedDB', 'Service Workers', 'Conflict Resolution', 'React'],
      },
      {
        title: 'Debug the State Management Chaos',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'A React app has tangled global state causing 6 distinct UI bugs: stale closures in event handlers, a race condition between two useEffect hooks, zombie child component subscriptions, incorrect optimistic update rollbacks, localStorage hydration mismatch, and a context value that triggers infinite re-renders.',
        tags: ['React', 'Zustand', 'useEffect', 'Debugging'],
      },
    ],
  },
  {
    id: 'data',
    name: 'Data / ML',
    description: 'Engineers building data pipelines, ML systems, and analytics.',
    challenges: [
      {
        title: 'Debug the Training Pipeline',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'A model training pipeline produces a model with 95% training accuracy but 52% test accuracy. The candidate must find and fix: data leakage in the preprocessing step, a label encoding bug that maps two classes to the same value, an incorrect train/test split that leaks temporal data, and a learning rate schedule that causes catastrophic forgetting.',
        tags: ['PyTorch', 'scikit-learn', 'Pandas', 'Debugging'],
      },
      {
        title: 'Build a Feature Store with Point-in-Time Correctness',
        difficulty: 'Expert',
        duration: '75 min',
        description: 'Design and implement a feature store that serves both training (batch) and inference (real-time) workloads. Must handle point-in-time correctness to prevent data leakage, entity key lookups, feature versioning, and a backfill pipeline — the offline and online stores must stay consistent.',
        tags: ['Python', 'Redis', 'PostgreSQL', 'Parquet'],
      },
      {
        title: 'Fix the Recommendation System',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'A collaborative-filtering recommender has three compounding issues: cold-start users get empty results, popular items dominate all recommendations (popularity bias), and embeddings go stale after 24 hours. Fix the fallback strategy, implement popularity dampening, add incremental embedding updates, and validate with the provided A/B test harness.',
        tags: ['Python', 'Embeddings', 'A/B Testing', 'Redis'],
      },
      {
        title: 'Optimize Model Inference Latency',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'A model serving system has p99 latency of 2.3 seconds (target: 200ms). The candidate must profile and fix: an unoptimized preprocessing step doing redundant tokenization, no request batching, a model loaded in FP32 instead of FP16, synchronous I/O in the prediction loop, and missing caching for repeated inputs.',
        tags: ['FastAPI', 'ONNX', 'Profiling', 'Caching'],
      },
      {
        title: 'Design a Data Quality Monitoring System',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'Build a monitoring framework for a data pipeline that processes 10M rows/day. Implement schema validation, statistical drift detection (comparing distributions against a baseline), anomaly detection for numeric columns, automated alerting with configurable thresholds, and a dashboard endpoint — each check must handle the previous day\'s edge cases (nulls, type changes, volume spikes).',
        tags: ['Python', 'Great Expectations', 'Statistics', 'FastAPI'],
      },
    ],
  },
  {
    id: 'devops',
    name: 'DevOps / Platform',
    description: 'Infrastructure engineers managing deployments, CI/CD, and reliability.',
    challenges: [
      {
        title: 'Fix the Broken Kubernetes Deployment',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'A 3-service Kubernetes deployment has pods in CrashLoopBackOff. The candidate must diagnose and fix: misconfigured resource limits causing OOMKills, a liveness probe hitting the wrong path, a missing ConfigMap mount, network policies blocking inter-service communication, and an incorrect rolling update strategy that causes downtime.',
        tags: ['Kubernetes', 'YAML', 'Networking', 'Debugging'],
      },
      {
        title: 'Build a CI/CD Pipeline from Scratch',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'Design and implement a complete GitHub Actions pipeline for a monorepo: parallel test jobs with matrix strategy, Docker image building with layer caching, security scanning with Trivy, staging deployment with smoke tests, production deployment with manual approval gates, and automatic rollback on health check failure.',
        tags: ['GitHub Actions', 'Docker', 'Trivy', 'Bash'],
      },
      {
        title: 'Debug the Monitoring Blind Spots',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'A production system had a 45-minute outage that nobody was alerted about. The candidate must audit and fix: Prometheus scrape configs missing a critical service, Grafana dashboards using wrong PromQL aggregations, AlertManager routes silencing valid alerts, missing log correlation IDs across services, and no SLO-based alerting for the payments service.',
        tags: ['Prometheus', 'Grafana', 'AlertManager', 'PromQL'],
      },
      {
        title: 'Implement Zero-Downtime Database Migration',
        difficulty: 'Expert',
        duration: '75 min',
        description: 'Migrate a PostgreSQL schema (rename columns, change types, split a table) on a live production database with zero downtime. Implement the expand-contract pattern: add new columns, dual-write migration, backfill script with batching, switch reads, drop old columns — with rollback scripts at each stage and a validation harness.',
        tags: ['PostgreSQL', 'Migration Scripts', 'Bash', 'Python'],
      },
      {
        title: 'Harden the Infrastructure Security',
        difficulty: 'Hard',
        duration: '60 min',
        description: 'A security audit flagged 8 critical issues in a Docker Compose + Nginx infrastructure: secrets in environment variables, containers running as root, exposed debug ports, missing TLS between services, overly-permissive IAM policies, no network segmentation, unencrypted database backups, and missing rate limiting on public endpoints.',
        tags: ['Docker', 'Nginx', 'TLS', 'Security'],
      },
    ],
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeRole, setActiveRole] = useState('fullstack');

  return (
    <div className="min-h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Navigation is rendered by the global Header component in layout.tsx */}

      {/* Hero Section */}
      <section className="relative pt-36 pb-20 px-6">
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

        <motion.div
          className="max-w-4xl mx-auto text-center relative"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 border border-primary/20 bg-primary/5 rounded-full px-4 py-1.5 mb-8"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-primary text-sm font-medium">The AI Collaboration Assessment Platform</span>
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
            className="text-lg md:text-xl text-neutral-400 mb-6 max-w-2xl mx-auto leading-relaxed"
          >
            Resumes and LeetCode can&apos;t measure what matters most in 2026 &mdash;
            how effectively engineers collaborate with AI. ArcEval gives candidates a real
            AI coding assistant and scores exactly how they use it.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="flex flex-wrap items-center justify-center gap-2 mb-12"
          >
            {['Full-Stack', 'Backend', 'Frontend', 'Data / ML', 'DevOps'].map((role) => (
              <span
                key={role}
                className="border border-white/10 rounded-full px-3.5 py-1 text-xs text-neutral-400 font-medium"
              >
                {role}
              </span>
            ))}
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <a
              href={SIGNUP_URL}
              className="bg-primary hover:bg-primary-light text-black font-semibold px-8 py-4 rounded-xl text-lg transition-all btn-glow"
            >
              Start Free Trial
            </a>
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
              className="bg-[#111] border border-primary/20 rounded-2xl p-8"
            >
              <div className="text-primary text-sm font-mono mb-4">ARCEVAL APPROACH</div>
              <ul className="space-y-3 text-neutral-400 text-sm">
                <li className="flex items-start gap-3">
                  <span className="text-primary mt-0.5">+</span>
                  <span>Real-world challenges that mirror actual engineering tasks</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary mt-0.5">+</span>
                  <span>AI assistant included — test the skill that actually matters</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary mt-0.5">+</span>
                  <span>8-dimension analysis of problem-solving and AI collaboration</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary mt-0.5">+</span>
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
                className="group relative bg-[#111] border border-white/5 rounded-2xl p-8 hover:border-primary/20 transition-all duration-300"
              >
                <div className="absolute inset-0 rounded-2xl bg-primary/0 group-hover:bg-primary/2 transition-colors duration-300" />
                <div className="relative">
                  <div className="text-5xl font-serif italic text-primary/40 mb-4">{step.num}</div>
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
                <div className="mt-2 text-primary">
                  I&apos;ll implement a sliding window rate limiter. Let me start by designing the
                </div>
                <div className="text-primary">
                  data structure and then build the middleware...
                </div>
                <div className="mt-3 text-neutral-600">$ npm test</div>
                <div className="mt-1 text-neutral-400">Running 18 test cases...</div>
                <div className="text-primary">All tests passed (18/18)</div>
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
                className="group relative bg-[#111] border border-white/5 rounded-xl p-5 hover:border-primary/30 transition-all duration-300 cursor-default"
              >
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-b from-primary/3 to-transparent" />
                <div className="relative">
                  <div className="text-xs font-mono text-primary/50 mb-3">{dim.icon}</div>
                  <h3 className="text-sm font-semibold text-white mb-1">{dim.name}</h3>
                  <p className="text-xs text-neutral-500 leading-relaxed">{dim.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles We Assess */}
      <section className="px-6 py-24 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-serif italic mb-4">
              Built for every{' '}
              <span className="gradient-text">engineering role</span>
            </h2>
            <p className="text-neutral-500 text-lg max-w-2xl mx-auto">
              Whether you&apos;re hiring full-stack developers, backend specialists, frontend experts,
              data engineers, or DevOps teams &mdash; ArcEval has purpose-built challenges for each discipline.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {roleCategories.map((role, i) => (
              <motion.div
                key={role.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                className="bg-[#111] border border-white/5 rounded-xl p-6 text-center hover:border-primary/30 transition-all duration-300"
              >
                <h3 className="text-base font-semibold text-white mb-2">{role.name}</h3>
                <p className="text-xs text-neutral-500 leading-relaxed">{role.description}</p>
                <div className="mt-3 text-primary text-sm font-medium">{role.challenges.length} templates</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Challenge Templates */}
      <section id="templates" className="relative px-6 py-24 border-t border-white/5">
        <div className="absolute inset-0 bg-dots opacity-20" />
        <div className="max-w-6xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-serif italic mb-4">
              Sample challenge{' '}
              <span className="gradient-text">templates</span>
            </h2>
            <p className="text-neutral-500 text-lg max-w-2xl mx-auto">
              Every challenge is designed to require iterative problem-solving with AI &mdash;
              they cannot be solved with a single prompt. Candidates must debug, reason, and adapt.
            </p>
          </motion.div>

          {/* Role Tabs */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
            {roleCategories.map((role) => (
              <button
                key={role.id}
                onClick={() => setActiveRole(role.id)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeRole === role.id
                    ? 'bg-primary text-black'
                    : 'bg-[#111] border border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
                }`}
              >
                {role.name}
              </button>
            ))}
          </div>

          {/* Challenge Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {roleCategories
              .find((r) => r.id === activeRole)
              ?.challenges.map((challenge, i) => (
                <motion.div
                  key={challenge.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className="bg-[#111] border border-white/5 rounded-2xl p-6 hover:border-primary/20 transition-all duration-300 flex flex-col"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                      challenge.difficulty === 'Expert'
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {challenge.difficulty}
                    </span>
                    <span className="text-xs text-neutral-600">{challenge.duration}</span>
                  </div>

                  <h3 className="text-base font-semibold text-white mb-2 leading-snug">{challenge.title}</h3>
                  <p className="text-xs text-neutral-500 leading-relaxed mb-4 flex-grow">{challenge.description}</p>

                  <div className="flex flex-wrap gap-1.5">
                    {challenge.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-medium text-neutral-500 bg-white/5 border border-white/5 rounded px-2 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </motion.div>
              ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-center mt-10"
          >
            <p className="text-neutral-600 text-sm mb-4">
              All templates are fully customizable. Create your own challenges or modify any template to match your tech stack.
            </p>
            <a
              href={SIGNUP_URL}
              className="inline-block bg-primary hover:bg-primary-light text-black font-semibold px-8 py-3.5 rounded-xl text-sm transition-all btn-glow"
            >
              Try These Challenges Free
            </a>
          </motion.div>
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
                    ? 'border-2 border-primary/40 ring-1 ring-primary/20'
                    : 'border border-white/5'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-black text-xs font-bold px-4 py-1.5 rounded-full">
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
                  <div className="text-primary text-sm font-medium mt-2">{plan.assessments}</div>
                </div>

                <ul className="space-y-3 mb-8 flex-grow">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <span className="text-primary mt-0.5 flex-shrink-0">+</span>
                      <span className="text-neutral-400">{feature}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href={plan.price !== null ? SIGNUP_URL : 'mailto:raj@firstprinciplelabs.ai'}
                  className={`block text-center font-semibold py-3.5 rounded-xl text-sm transition-all ${
                    plan.popular
                      ? 'bg-primary hover:bg-primary-light text-black btn-glow'
                      : 'border border-white/10 hover:border-white/20 text-white hover:bg-white/5'
                  }`}
                >
                  {plan.cta}
                </a>
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
            Need a custom volume? <a href="mailto:raj@firstprinciplelabs.ai" className="text-primary hover:underline">Talk to us</a>.
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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

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
            <a
              href={SIGNUP_URL}
              className="inline-block bg-primary hover:bg-primary-light text-black font-semibold px-10 py-4 rounded-xl text-lg transition-all btn-glow"
            >
              Start Free Trial
            </a>
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
