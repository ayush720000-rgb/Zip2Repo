import React, { useEffect, useState } from 'react';
import { Check, CheckCircle2, Copy, ExternalLink, RotateCcw, Stethoscope } from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { CreatedRepoResult } from '../types.js';

interface PushResultProps {
  result: CreatedRepoResult;
  onPushAnother: () => void;
}

/** Counts from 0 to the target once, for a small "it worked" moment. */
const useCountUp = (target: number, duration = 700) => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target === 0) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
};

/** Shown after a successful push: where the code is now, and what to do next on GitHub. */
export const PushResult: React.FC<PushResultProps> = ({ result, onPushAnother }) => {
  const { openDoctorWithPrompt } = useApp();
  const [copied, setCopied] = useState(false);
  const repo = result.repository;
  const cloneUrl = `${repo.html_url}.git`;
  const files = useCountUp(result.totalFiles);

  const copyCloneUrl = async () => {
    try {
      await navigator.clipboard.writeText(cloneUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; the URL stays visible for manual copy
    }
  };

  const actionBase = 'h-10 px-4 text-xs font-semibold w-full';

  return (
    <div className="surface p-5 sm:p-7 space-y-6 animate-pop-in">
      <div className="flex items-start gap-4">
        <div className="relative w-11 h-11 rounded-full bg-accent-500/15 border border-accent-500/30 flex items-center justify-center shrink-0 animate-ring">
          <CheckCircle2 className="w-5 h-5 text-accent-300 animate-pop-in" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-accent-300">
            {result.mode === 'existing' ? 'Files added to your repository' : 'Repository created and pushed'}
          </p>
          <h3 className="text-lg font-semibold text-white break-all">{repo.full_name}</h3>
          <p className="text-xs text-neutral-400">
            <span className="font-mono text-neutral-200 tabular-nums">{files}</span> files on{' '}
            <span className="font-mono text-neutral-200">{result.branch}</span> · commit{' '}
            <span className="font-mono text-neutral-200">{result.commitSha.slice(0, 7)}</span> ·{' '}
            {repo.private ? 'Private' : 'Public'}
          </p>
          {result.gitignoreAdded && (
            <p className="text-xs text-neutral-500">A .gitignore was added because the ZIP did not include one.</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-neutral-500">Clone URL</span>
        <div className="flex items-stretch gap-2">
          <code className="flex-1 min-w-0 h-10 flex items-center px-3 rounded-lg bg-[#0A0A0C] border border-white/10 text-xs font-mono text-neutral-200 truncate">
            {cloneUrl}
          </code>
          <button type="button" onClick={copyCloneUrl} className="btn-secondary h-10 px-4 text-xs font-semibold w-28 shrink-0">
            {copied ? (
              <Check key="ok" className="w-3.5 h-3.5 text-accent-300 animate-pop-in" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a href={repo.html_url} target="_blank" rel="noreferrer" className={`btn-primary ${actionBase} sm:col-span-2`}>
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Open repository</span>
        </a>
        <a href={result.commitUrl} target="_blank" rel="noreferrer" className={`btn-secondary ${actionBase}`}>
          <ExternalLink className="w-3.5 h-3.5" />
          <span>View commit</span>
        </a>
        <button
          type="button"
          onClick={() =>
            openDoctorWithPrompt(`Check ${repo.full_name} for missing files or configuration problems, then summarize what you find.`)
          }
          className={`btn-secondary ${actionBase}`}
        >
          <Stethoscope className="w-3.5 h-3.5" />
          <span>Review in AI Doctor</span>
        </button>
        <button type="button" onClick={onPushAnother} className={`btn-secondary ${actionBase} sm:col-span-2`}>
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Push another ZIP</span>
        </button>
      </div>
    </div>
  );
};
