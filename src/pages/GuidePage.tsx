import React from 'react';
import { useApp, TabId } from '../context/AppContext.js';
import { LogoMark } from '../components/Logo.js';
import {
  UploadCloud,
  GitBranch,
  ShieldCheck,
  Stethoscope,
  Activity,
  Keyboard,
  LifeBuoy,
  ArrowRight,
  CheckCircle2,
  AtSign,
  ShieldAlert,
  KeyRound,
  FolderOpen,
} from 'lucide-react';

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-white/[0.08] border border-white/10 text-neutral-200">
    {children}
  </kbd>
);

const Section: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  intro: string;
  children: React.ReactNode;
  action?: { label: string; tab: TabId };
}> = ({ icon: Icon, title, intro, children, action }) => {
  const { setActiveTab } = useApp();
  return (
    <section className="surface p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent-500/10 border border-accent-500/20 flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5 text-accent-300" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="text-xs text-neutral-400 leading-relaxed mt-0.5">{intro}</p>
        </div>
      </div>
      <div className="text-xs text-neutral-300 leading-relaxed space-y-3">{children}</div>
      {action && (
        <button
          onClick={() => setActiveTab(action.tab)}
          className="btn-secondary px-3.5 py-2 text-xs font-semibold"
        >
          <span>{action.label}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </section>
  );
};

const Steps: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ol className="space-y-2.5">
    {items.map((item, i) => (
      <li key={i} className="flex gap-3">
        <span className="w-5 h-5 rounded-full bg-white/[0.08] border border-white/10 text-[10px] font-mono text-neutral-200 flex items-center justify-center shrink-0 mt-px">
          {i + 1}
        </span>
        <span className="min-w-0">{item}</span>
      </li>
    ))}
  </ol>
);

const Example: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-2 p-3 rounded-lg bg-[#0A0A0C] border border-white/[0.08] font-mono text-[11px] text-neutral-200">
    <span className="text-accent-400 shrink-0">›</span>
    <span className="min-w-0 break-words">{children}</span>
  </div>
);

export const GuidePage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <header className="surface p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5">
        <LogoMark className="w-14 h-14 shrink-0" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-white">How to use Zip2Repo</h1>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Turn a project ZIP into a GitHub repository in a few clicks. This guide covers pushing projects, managing repositories, and using AI Doctor for everything else on GitHub.
          </p>
        </div>
      </header>

      <nav aria-label="Guide contents" className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {[
          ['#connect', 'Connect GitHub'],
          ['#push', 'Push a ZIP'],
          ['#repos', 'Repositories'],
          ['#doctor', 'AI Doctor'],
          ['#activity', 'Activity'],
          ['#shortcuts', 'Shortcuts'],
          ['#troubleshoot', 'Troubleshooting'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="px-3 py-2 rounded-lg border border-white/10 text-neutral-300 hover:text-white hover:border-white/20 transition-colors">
            {label}
          </a>
        ))}
      </nav>

      <div id="connect">
        <Section
          icon={KeyRound}
          title="1. Connect GitHub"
          intro="Zip2Repo needs a GitHub token to create repositories and push files."
          action={{ label: 'Open Settings', tab: 'settings' }}
        >
          <Steps
            items={[
              <>Click <strong className="text-white">Connect GitHub</strong> at the top right.</>,
              <>Create a Personal Access Token on GitHub. A classic token needs the <strong className="text-white">repo</strong> scope.</>,
              <>Paste the token and click <strong className="text-white">Verify & Connect</strong>. Your avatar appears when it works.</>,
            ]}
          />
          <p className="text-neutral-500">The token stays in this browser. Zip2Repo sends it to GitHub on each request and never writes it to disk.</p>
        </Section>
      </div>

      <div id="push">
        <Section
          icon={UploadCloud}
          title="2. Push a project ZIP"
          intro="Drop a ZIP and choose where the files should go. The dashboard does the rest."
          action={{ label: 'Go to Dashboard', tab: 'dashboard' }}
        >
          <Steps
            items={[
              <>Drop a ZIP on the dashboard, or click <strong className="text-white">Choose a file</strong>. Files up to 200 MB work.</>,
              <>Check the <strong className="text-white">Project check</strong> panel. It flags missing build or start scripts and other common problems.</>,
              <>Pick a destination. <strong className="text-white">New repository</strong> creates one with your name and visibility. <strong className="text-white">Existing repository</strong> adds the files to a repo you can push to.</>,
              <>Click the button to push. The progress bar shows each step.</>,
            ]}
          />
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-white"><ShieldCheck className="w-3.5 h-3.5 text-accent-300" /> Safe overwrites</div>
              <p className="text-neutral-400">Files with the same path are replaced. Files that are not in the ZIP stay as they are.</p>
            </div>
            <div className="p-3.5 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-white"><CheckCircle2 className="w-3.5 h-3.5 text-accent-300" /> .gitignore on push</div>
              <p className="text-neutral-400">If the ZIP has no .gitignore, tick the option and one is added for your project type. This keeps node_modules and local .env files out of Git.</p>
            </div>
          </div>
          <p>After a push, the result panel shows the commit and a clone URL you can copy, with links to open the repository or the commit.</p>
        </Section>
      </div>

      <div id="repos">
        <Section
          icon={GitBranch}
          title="3. Manage repositories"
          intro="Browse your repositories, copy clone URLs, push into any repo you own, or delete one."
          action={{ label: 'Open Repositories', tab: 'repositories' }}
        >
          <ul className="space-y-2 list-none">
            <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-accent-300 shrink-0 mt-0.5" /> <span><strong className="text-white">Push a ZIP here</strong> opens the dashboard with that repository already selected.</span></li>
            <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-accent-300 shrink-0 mt-0.5" /> <span><strong className="text-white">Copy</strong> the clone URL with one click.</span></li>
            <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-accent-300 shrink-0 mt-0.5" /> <span>Search, filter by public or private, and sort by name, stars, or last update.</span></li>
          </ul>
        </Section>
      </div>

      <div id="doctor">
        <Section
          icon={Stethoscope}
          title="4. AI Doctor: GitHub in plain words"
          intro="Describe what you want. AI Doctor picks the GitHub actions, runs them, and reports back with links."
          action={{ label: 'Open AI Doctor', tab: 'doctor' }}
        >
          <p>You can ask for things like these:</p>
          <div className="space-y-2">
            <Example>create a private repo called blog-site</Example>
            <Example>open an issue in blog-site about the login bug</Example>
            <Example>list the open pull requests in my-app</Example>
            <Example>change the description of my-app to "Portfolio site"</Example>
            <Example>add a Node .gitignore to my-app</Example>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-white"><AtSign className="w-3.5 h-3.5 text-accent-300" /> Tag a repository</div>
              <p className="text-neutral-400">Type <Kbd>@</Kbd> in the box and pick a repository. The last one you tag becomes the chat's focus, so "make it private" just works.</p>
            </div>
            <div className="p-3.5 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-white"><ShieldAlert className="w-3.5 h-3.5 text-amber-300" /> Confirm first</div>
              <p className="text-neutral-400">Deleting, renaming, changing visibility, archiving, merging, and deleting branches or files show a card. Nothing runs until you press Confirm.</p>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-2">
            <div className="font-semibold text-white">What AI Doctor can do</div>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-neutral-400">
              <li>Profile: view and update your name, bio, and website</li>
              <li>Repositories: create, inspect, rename, archive, delete, topics</li>
              <li>Branches and commits: list, create, delete, recent history</li>
              <li>Issues and pull requests: open, edit, comment, merge</li>
              <li>Releases: publish tagged versions with notes</li>
              <li>Files: read, write, and delete with a commit</li>
              <li>Ignore rules: add a .gitignore from a GitHub template</li>
            </ul>
          </div>
        </Section>
      </div>

      <div id="activity">
        <Section
          icon={Activity}
          title="5. Activity"
          intro="Every upload, push, repository change, and AI Doctor action is logged with its time and result."
          action={{ label: 'Open Activity', tab: 'activity' }}
        >
          <p>Use the filter tabs to see only uploads, GitHub changes, or AI Doctor actions.</p>
        </Section>
      </div>

      <div id="shortcuts">
        <Section icon={Keyboard} title="Shortcuts and tips" intro="Quick ways to move around.">
          <ul className="space-y-2">
            <li className="flex gap-2"><span className="w-28 shrink-0 text-neutral-400"><Kbd>Ctrl</Kbd> / <Kbd>⌘</Kbd> <Kbd>K</Kbd></span> <span>Open or close AI Doctor</span></li>
            <li className="flex gap-2"><span className="w-28 shrink-0 text-neutral-400"><Kbd>@</Kbd></span> <span>Pick a repository in AI Doctor</span></li>
            <li className="flex gap-2"><span className="w-28 shrink-0 text-neutral-400"><Kbd>Enter</Kbd></span> <span>Send a message. <Kbd>Shift</Kbd> <Kbd>Enter</Kbd> adds a new line.</span></li>
          </ul>
        </Section>
      </div>

      <div id="troubleshoot">
        <Section icon={LifeBuoy} title="Troubleshooting" intro="Common messages and what to do.">
          <ul className="space-y-3">
            <li><strong className="text-white">"Your account does not have write access."</strong> <span className="text-neutral-400">Choose a repository you own or can push to, or use a token with write access.</span></li>
            <li><strong className="text-white">Upload stops with a rate-limit message.</strong> <span className="text-neutral-400">Zip2Repo pauses and retries on its own. If it still fails, wait 10 to 15 minutes.</span></li>
            <li><strong className="text-white">"AI Doctor is off."</strong> <span className="text-neutral-400">The server needs a Gemini key. Ask the person running the server to add one.</span></li>
            <li><strong className="text-white">Sign-in fails.</strong> <span className="text-neutral-400">Check the token is copied in full and not expired. Then use <em>Change token</em> in Settings.</span></li>
          </ul>
        </Section>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-neutral-500 pt-2">
        <FolderOpen className="w-3.5 h-3.5" />
        <span>Still stuck? Ask AI Doctor, or open Activity to see what went wrong.</span>
      </div>
    </div>
  );
};

export default GuidePage;
