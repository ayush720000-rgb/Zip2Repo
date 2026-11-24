import React, { useEffect, useState } from 'react';
import { LogoMark } from './Logo.js';

const TEXT = 'Welcome to Zip2Repo';
const TYPE_MS = 45;
const HOLD_MS = 450;
const LEAVE_MS = 320;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A short intro on page load. Any tap or key press skips it. */
export const Splash: React.FC = () => {
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<'typing' | 'leaving' | 'done'>('typing');

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(TEXT.length);
      const t = setTimeout(() => setPhase('leaving'), 300);
      return () => clearTimeout(t);
    }
    if (shown < TEXT.length) {
      const t = setTimeout(() => setShown((n) => n + 1), TYPE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPhase('leaving'), HOLD_MS);
    return () => clearTimeout(t);
  }, [shown]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const t = setTimeout(() => setPhase('done'), LEAVE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const skip = () => setPhase((p) => (p === 'typing' ? 'leaving' : p));

  useEffect(() => {
    if (phase === 'done') return;
    const onKey = () => skip();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div
      onClick={skip}
      onTouchStart={skip}
      aria-hidden="true"
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-[#0C0C0E] cursor-pointer transition-opacity duration-300 ${
        phase === 'leaving' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="animate-pop-in">
        <LogoMark className="w-16 h-16" />
      </div>
      <p className="font-mono text-base sm:text-lg text-neutral-200 tracking-tight h-7">
        {TEXT.slice(0, shown)}
        <span className="splash-caret text-accent-400">|</span>
      </p>
      <p className="text-[11px] text-neutral-600">Tap to skip</p>
    </div>
  );
};
