'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import FPLLogo from '@/components/FPLLogo';

const fadeUp = {
  hidden: { opacity: 0, y: 30 } as const,
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } as const,
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const team = [
  {
    name: 'Rajat Dandekar',
    role: 'Co-Founder',
    photo: '/team/rajat.jpg',
    links: { linkedin: 'https://linkedin.com/in/rajatdandekar' },
  },
  {
    name: 'Sreedath Panat',
    role: 'Co-Founder',
    photo: '/team/sreedath.jpg',
    links: { linkedin: 'https://linkedin.com/in/sreedathpanat' },
  },
];

export default function AboutPage() {
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
            <Link href="/#how-it-works" className="hover:text-white transition-colors">How it works</Link>
            <Link href="/#pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/about" className="text-white">About Us</Link>
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

      {/* Hero */}
      <section className="relative pt-36 pb-16 px-6">
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-[#7c5ce0]/5 blur-[120px] pointer-events-none" />

        <motion.div
          className="max-w-4xl mx-auto text-center relative"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="mb-8">
            <FPLLogo size={60} />
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="text-5xl sm:text-6xl font-serif italic leading-[1.1] mb-6 tracking-tight"
          >
            Built by{' '}
            <span className="bg-gradient-to-r from-[#7c5ce0] to-[#a8b4ff] bg-clip-text text-transparent">
              First Principle Labs
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="text-lg md:text-xl text-neutral-400 mb-8 max-w-2xl mx-auto leading-relaxed"
          >
            We build AI-native tools that measure what traditional methods cannot.
            ArcEval is our answer to the broken hiring process in the age of AI.
          </motion.p>
        </motion.div>
      </section>

      {/* Who We Are */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl font-serif italic text-white mb-6 text-center">Who We Are</h2>
            <div className="bg-[#111] border border-white/5 rounded-2xl p-8 md:p-12 max-w-3xl mx-auto">
              <p className="text-neutral-400 leading-relaxed text-lg mb-6">
                The founders of First Principle Labs have designed and delivered courses which are appreciated by
                thousands of industry professionals. They run a popular YouTube channel called{' '}
                <a href="https://youtube.com/@vizuara" target="_blank" rel="noopener noreferrer" className="text-[#7c5ce0] hover:underline">
                  Vizuara
                </a>{' '}
                where they teach complex AI concepts in a way which is accessible to all.
              </p>
              <p className="text-neutral-400 leading-relaxed text-lg">
                The focus is on intuition-building and mastering the fundamentals behind all the concepts.
                This same first-principles approach drives everything we build at First Principle Labs &mdash;
                including ArcEval, our AI collaboration assessment platform.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Mission */}
      <section className="px-6 py-20 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-12"
          >
            <div>
              <h2 className="text-3xl font-serif italic text-white mb-4">Our Mission</h2>
              <p className="text-neutral-400 leading-relaxed mb-4">
                The way software is built has fundamentally changed. AI coding assistants are not a future trend &mdash;
                they are the present reality. 85% of developers use them daily. Yet the hiring industry still evaluates
                candidates as if AI doesn&apos;t exist.
              </p>
              <p className="text-neutral-400 leading-relaxed">
                First Principle Labs exists to bridge this gap. We build tools that evaluate the skills that actually
                matter in modern engineering &mdash; starting with how effectively humans collaborate with AI.
              </p>
            </div>
            <div>
              <h2 className="text-3xl font-serif italic text-white mb-4">Our Approach</h2>
              <p className="text-neutral-400 leading-relaxed mb-4">
                We reason from first principles. Instead of asking &ldquo;how do we make LeetCode better?&rdquo; we asked
                &ldquo;what does a great engineer actually do in 2026?&rdquo; The answer: they collaborate with AI to solve
                real problems. So we built a platform that measures exactly that.
              </p>
              <p className="text-neutral-400 leading-relaxed">
                Every design decision &mdash; from the sandboxed terminal to the 8-dimension scoring framework &mdash;
                was derived from observing how the best engineers actually work with AI tools.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Team */}
      <section className="px-6 py-20 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-serif italic text-white mb-4">The Team</h2>
            <p className="text-neutral-500 text-lg max-w-xl mx-auto">
              A small team obsessed with building the right tools for the AI era.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mx-auto">
            {team.map((member, i) => (
              <motion.div
                key={member.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
                className="bg-[#111] border border-white/5 rounded-2xl p-8 text-center hover:border-[#7c5ce0]/20 transition-all duration-300"
              >
                <div className="w-24 h-24 rounded-full overflow-hidden mx-auto mb-4 border-2 border-white/10">
                  <Image
                    src={member.photo}
                    alt={member.name}
                    width={96}
                    height={96}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-lg font-semibold text-white mb-1">{member.name}</h3>
                <p className="text-[#7c5ce0] text-sm font-medium mb-4">{member.role}</p>
                {member.links.linkedin && (
                  <a
                    href={member.links.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-600 hover:text-[#7c5ce0] text-sm transition-colors"
                  >
                    LinkedIn
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What We Believe */}
      <section className="px-6 py-20 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-serif italic text-white mb-4">What We Believe</h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: 'AI is a collaborator, not a crutch',
                desc: 'The best engineers don\'t just copy-paste AI output. They think with AI — decomposing problems, iterating on solutions, and validating results.',
              },
              {
                title: 'Process reveals more than output',
                desc: 'A correct answer tells you nothing about how a candidate thinks. The journey — every prompt, every edit, every decision — tells you everything.',
              },
              {
                title: 'Hiring should reflect reality',
                desc: 'If engineers use AI daily at work, testing them without AI is testing a fiction. Assessments should mirror the actual engineering environment.',
              },
            ].map((belief, i) => (
              <motion.div
                key={belief.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
                className="bg-[#111] border border-white/5 rounded-2xl p-8"
              >
                <h3 className="text-base font-semibold text-white mb-3">{belief.title}</h3>
                <p className="text-neutral-500 text-sm leading-relaxed">{belief.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative px-6 py-20">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center relative"
        >
          <h2 className="text-3xl font-serif italic text-white mb-4">
            Want to learn more?
          </h2>
          <p className="text-neutral-500 mb-8">
            Visit our website or get in touch.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://firstprinciplelabs.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#7c5ce0] hover:bg-[#8e6ef0] text-white font-semibold px-8 py-3.5 rounded-xl text-sm transition-all"
            >
              First Principle Labs
            </a>
            <a
              href="mailto:raj@firstprinciplelabs.ai"
              className="border border-white/10 hover:border-white/20 text-white font-semibold px-8 py-3.5 rounded-xl text-sm transition-all hover:bg-white/5"
            >
              Get in Touch
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
