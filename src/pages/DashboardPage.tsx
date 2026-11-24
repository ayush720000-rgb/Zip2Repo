import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext.js';
import { InspectedZipData, CreatedRepoResult, PushTarget } from '../types.js';
import { PushResult } from '../components/PushResult.js';
import {
  UploadCloud,
  FileArchive,
  AlertTriangle,
  Info,
  GitBranch,
  Lock,
  Globe,
  Loader2,
  RefreshCw,
  Plus,
  X,
} from 'lucide-react';

interface DashboardPageProps {
  onOpenConnectModal: () => void;
}

type Destination = 'new' | 'existing';

const SAMPLES = [
  { type: 'vite-react', title: 'Vite + React', tag: 'SPA', description: 'A Vite and React project with a build script.' },
  { type: 'node-express', title: 'Node.js Express', tag: 'API', description: 'An Express server with a health route.' },
  { type: 'static-html', title: 'Static HTML', tag: 'HTML', description: 'One index.html page with no dependencies.' },
];

const PUSH_TIMEOUT_MS = 5 * 60 * 1000;

const formatSpeed = (bytesPerSecond: number): string =>
  bytesPerSecond > 1024 * 1024
    ? `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
    : `${Math.round(bytesPerSecond / 1024)} KB/s`;

const inputClass = 'field h-10 w-full px-3 text-xs';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1.5">
    <span className="block text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>
    {children}
  </label>
);

const BranchInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="relative">
    <GitBranch className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="main"
      className={`${inputClass} font-mono pl-9`}
    />
  </div>
);

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** A two-option switch with equal-height segments. */
const Segmented = <T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
}) => (
  <div className="space-y-1.5">
    <span className="block text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/[0.08]">
      {options.map((option) => {
        const Icon = option.icon;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`h-10 px-3 rounded-md flex items-center justify-center gap-2 text-xs font-medium transition-all duration-200 ${
              selected ? 'bg-[#222227] text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 shrink-0 ${selected ? 'text-accent-300' : ''}`} />
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);

export const DashboardPage: React.FC<DashboardPageProps> = ({ onOpenConnectModal }) => {
  const {
    isAuthenticated,
    token,
    currentZip,
    setCurrentZip,
    pushTarget,
    setPushTarget,
    refreshActivities,
  } = useApp();

  // A repository picked on the Repositories page. Read once when this page opens, then cleared.
  const [initialTarget] = useState<string | null>(pushTarget);
  useEffect(() => {
    if (pushTarget) setPushTarget(null);
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDetails, setUploadDetails] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [destination, setDestination] = useState<Destination>(initialTarget ? 'existing' : 'new');
  const [existingRepo, setExistingRepo] = useState(initialTarget ?? '');
  const [pushTargets, setPushTargets] = useState<PushTarget[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);

  const [repoName, setRepoName] = useState('');
  const [repoDescription, setRepoDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [branch, setBranch] = useState('main');
  const [commitMessage, setCommitMessage] = useState('');
  const [addGitignore, setAddGitignore] = useState(true);

  const [isPushing, setIsPushing] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState('');
  const [pushProgressPct, setPushProgressPct] = useState(0);
  const [pushResult, setPushResult] = useState<CreatedRepoResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Repositories that accept pushes, for the "existing repository" picker.
  useEffect(() => {
    if (!token) {
      setPushTargets([]);
      return;
    }
    let active = true;
    setLoadingTargets(true);
    fetch('/api/repos/push-targets', { headers: { 'x-github-token': token } })
      .then((res) => res.json())
      .then((data) => {
        if (active) setPushTargets(data.repositories || []);
      })
      .catch(() => {
        if (active) setPushTargets([]);
      })
      .finally(() => {
        if (active) setLoadingTargets(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  // Choosing an existing repository starts from its default branch.
  useEffect(() => {
    if (destination !== 'existing') return;
    const target = pushTargets.find((t) => t.full_name === existingRepo);
    if (target) setBranch(target.default_branch);
  }, [destination, existingRepo, pushTargets]);

  const chooseDestination = (next: Destination) => {
    setDestination(next);
    if (next === 'new') setBranch('main');
  };

  const acceptInspection = (data: any) => {
    const zipData: InspectedZipData = {
      uploadId: data.uploadId,
      filename: data.filename,
      analysis: data.analysis,
      filesPreview: data.filesPreview,
    };
    setCurrentZip(zipData);
    setRepoName(data.analysis.suggestedRepoName);
    setRepoDescription(data.analysis.suggestedDescription);
    setIsPrivate(true);
    setAddGitignore(true);
    setCommitMessage('');
  };

  const processZipFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setErrorMessage('Please choose a ZIP archive (.zip).');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadDetails(`Uploading ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`);
    setErrorMessage(null);
    setPushResult(null);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.timeout = PUSH_TIMEOUT_MS;
    const startedAt = Date.now();

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
      const loadedMB = (event.loaded / (1024 * 1024)).toFixed(1);
      const totalMB = (event.total / (1024 * 1024)).toFixed(1);
      const seconds = (Date.now() - startedAt) / 1000;
      const speed = seconds > 1 && event.loaded > 0 ? ` · ${formatSpeed(event.loaded / seconds)}` : '';
      setUploadProgress(percent);
      setUploadDetails(`${loadedMB} MB of ${totalMB} MB${speed}`);
    };

    xhr.upload.onload = () => {
      setUploadProgress(100);
      setUploadDetails('Upload complete. Checking the archive...');
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          acceptInspection(data);
        } else {
          setErrorMessage(data.error || 'Failed to inspect the ZIP file.');
        }
      } catch {
        setErrorMessage('The server sent an unexpected response. Try the upload again.');
      } finally {
        setIsUploading(false);
        setUploadDetails(null);
      }
    };

    xhr.onerror = () => {
      setErrorMessage('The connection dropped during the upload. Check your network and try again.');
      setIsUploading(false);
      setUploadDetails(null);
    };

    xhr.ontimeout = () => {
      setErrorMessage('The upload timed out after 5 minutes. Try again on a faster connection.');
      setIsUploading(false);
      setUploadDetails(null);
    };

    xhr.open('POST', '/api/zip/inspect');
    xhr.send(formData);
  };

  const handleLoadSample = async (sampleType: string) => {
    setIsUploading(true);
    setUploadProgress(40);
    setUploadDetails('Generating sample project...');
    setErrorMessage(null);
    setPushResult(null);

    try {
      const res = await fetch(`/api/sample-zip/${sampleType}`, {
        method: 'POST',
        signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate the sample project.');
      }
      acceptInspection(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate the sample project.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadDetails(null);
    }
  };

  const handleCreateAndPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentZip) return;

    if (!isAuthenticated) {
      onOpenConnectModal();
      return;
    }
    if (destination === 'new' && !repoName.trim()) {
      setErrorMessage('Enter a name for the new repository.');
      return;
    }
    if (destination === 'existing' && !existingRepo) {
      setErrorMessage('Choose the repository to push to.');
      return;
    }

    setIsPushing(true);
    setPushProgressPct(5);
    setPushStatusMessage('Connecting to GitHub...');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/zip/push-to-github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson, application/json',
          'x-github-token': token,
        },
        signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
        body: JSON.stringify({
          uploadId: currentZip.uploadId,
          mode: destination,
          repoName: repoName.trim(),
          description: repoDescription.trim(),
          isPrivate,
          existingRepo,
          branch: branch.trim(),
          commitMessage: commitMessage.trim(),
          addGitignore: addGitignore && !currentZip.analysis.hasGitIgnore,
        }),
      });

      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/x-ndjson') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let completed: CreatedRepoResult | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === 'progress') {
              setPushProgressPct(event.percent);
              setPushStatusMessage(event.message);
            } else if (event.type === 'complete') {
              completed = event;
            } else if (event.type === 'error') {
              throw new Error(event.error || 'The push failed.');
            }
          }
        }

        if (!completed) {
          throw new Error('The push ended before GitHub confirmed the commit. Check the repository on GitHub.');
        }
        setPushProgressPct(100);
        setPushStatusMessage('Pushed to GitHub.');
        setPushResult(completed);
      } else {
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to push the project to GitHub.');
        }
        setPushResult(data);
      }
      await refreshActivities();
    } catch (err: any) {
      if (err.name === 'TimeoutError') {
        setErrorMessage('The push took longer than 5 minutes. Check the repository on GitHub before trying again.');
      } else {
        setErrorMessage(err.message || 'The push failed.');
      }
    } finally {
      setIsPushing(false);
    }
  };

  const resetToUpload = () => {
    setCurrentZip(null);
    setPushResult(null);
    setErrorMessage(null);
  };

  const analysis = currentZip?.analysis;
  const expectedFiles = analysis ? analysis.fileCount + (addGitignore && !analysis.hasGitIgnore ? 1 : 0) : 0;
  const defaultCommit = `${expectedFiles} files deployed via Zip2Repo`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="max-w-2xl mx-auto text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Push a project ZIP to GitHub</h1>
        <p className="text-sm text-neutral-400">
          Upload a ZIP, choose a new or existing repository, and Zip2Repo commits every file to it.
        </p>
      </header>

      {errorMessage && (
        <div role="alert" className="flex items-start gap-3 p-4 rounded-xl bg-red-950/40 border border-red-900/50 text-red-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-200" aria-label="Dismiss error">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!currentZip || !analysis ? (
        <div className="space-y-6">
          {initialTarget && (
            <p className="text-xs text-neutral-400 text-center">
              The next ZIP you choose will be pushed to <span className="font-mono text-neutral-200">{initialTarget}</span>.
            </p>
          )}

          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file && !isUploading) processZipFile(file);
            }}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`surface p-8 sm:p-12 text-center border-2 border-dashed transition-colors ${
              isDragging ? 'border-accent-400 bg-accent-500/5' : 'border-white/15 hover:border-white/25'
            } ${isUploading ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processZipFile(file);
                e.target.value = '';
              }}
            />

            <div className="max-w-md mx-auto space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center mx-auto text-neutral-200">
                {isUploading ? <RefreshCw className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}
              </div>

              <div className="space-y-1">
                <h2 className="text-base font-semibold text-white">
                  {isUploading ? 'Checking the archive' : 'Drop a ZIP file here'}
                </h2>
                <p className="text-xs text-neutral-500">
                  Supports React, Vite, Next.js, Node.js, Python, and static HTML projects. Up to 200 MB.
                </p>
              </div>

              {isUploading ? (
                <div className="space-y-2">
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-accent-400 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  {uploadDetails && <p className="text-[11px] font-mono text-neutral-500">{uploadDetails}</p>}
                </div>
              ) : (
                <span className="btn-primary px-5 py-2.5 text-xs inline-flex">Choose a file</span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-neutral-500">No ZIP handy? Start from a sample project.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SAMPLES.map((sample) => (
                <button
                  key={sample.type}
                  type="button"
                  disabled={isUploading}
                  onClick={() => handleLoadSample(sample.type)}
                  className="surface p-4 text-left hover:border-white/20 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">{sample.title}</span>
                    <span className="text-[10px] font-mono text-neutral-500">{sample.tag}</span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1.5">{sample.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="surface p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
                  <FileArchive className="w-5 h-5 text-neutral-200" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-white truncate">{currentZip.filename}</h3>
                  <p className="text-xs text-neutral-500">
                    <span className="text-neutral-300">{analysis.frameworkName}</span>
                    {' · '}{analysis.fileCount} files{' · '}{analysis.formattedSize}
                  </p>
                </div>
              </div>

              <button onClick={resetToUpload} className="btn-secondary px-3 py-1.5 text-xs font-semibold self-start sm:self-auto">
                Choose another ZIP
              </button>
            </div>

            {analysis.potentialIssues.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-neutral-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  <span>Project check</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {analysis.potentialIssues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs space-y-1 ${
                        issue.type === 'critical'
                          ? 'bg-red-950/30 border-red-900/40 text-red-300'
                          : issue.type === 'warning'
                          ? 'bg-amber-950/30 border-amber-900/40 text-amber-300'
                          : 'bg-neutral-800/40 border-neutral-800 text-neutral-300'
                      }`}
                    >
                      <div className="font-semibold flex items-center gap-1.5">
                        {issue.type === 'info' ? (
                          <Info className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{issue.title}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">{issue.description}</p>
                      {issue.recommendation && (
                        <p className="text-[11px] pt-0.5 opacity-80">Fix: {issue.recommendation}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {pushResult ? (
            <PushResult result={pushResult} onPushAnother={resetToUpload} />
          ) : (
            <div className="surface p-5 sm:p-7">
              <form
                onSubmit={handleCreateAndPush}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
                }}
                className="space-y-7"
              >
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white">Where should the files go?</h3>
                  <p className="text-xs text-neutral-500">Create a repository for this project, or add to one you already have.</p>
                </div>

                <Segmented
                  label="Destination"
                  value={destination}
                  onChange={chooseDestination}
                  options={[
                    { value: 'new', label: 'New repository', icon: Plus },
                    { value: 'existing', label: 'Existing repository', icon: GitBranch },
                  ]}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
                  {destination === 'new' ? (
                    <>
                      <Field label="Repository name">
                        <input
                          type="text"
                          required
                          value={repoName}
                          onChange={(e) => setRepoName(e.target.value)}
                          placeholder="my-new-project"
                          className={`${inputClass} font-mono`}
                        />
                      </Field>
                      <Field label="Branch">
                        <BranchInput value={branch} onChange={setBranch} />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Description (optional)">
                          <input
                            type="text"
                            value={repoDescription}
                            onChange={(e) => setRepoDescription(e.target.value)}
                            placeholder="What this project is"
                            className={inputClass}
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Segmented
                          label="Visibility"
                          value={isPrivate ? 'private' : 'public'}
                          onChange={(v) => setIsPrivate(v === 'private')}
                          options={[
                            { value: 'private', label: 'Private', hint: 'Only you can see it', icon: Lock },
                            { value: 'public', label: 'Public', hint: 'Anyone can see it', icon: Globe },
                          ]}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <Field label="Repository">
                        <select
                          required
                          value={existingRepo}
                          onChange={(e) => setExistingRepo(e.target.value)}
                          className={`${inputClass} font-mono`}
                        >
                          <option value="">{loadingTargets ? 'Loading repositories...' : 'Choose a repository'}</option>
                          {pushTargets.map((target) => (
                            <option key={target.full_name} value={target.full_name}>
                              {target.full_name}{target.private ? ' (private)' : ''}
                            </option>
                          ))}
                        </select>
                        {!loadingTargets && pushTargets.length === 0 && (
                          <p className="text-[11px] text-neutral-500">No repositories with write access. Choose New repository instead.</p>
                        )}
                      </Field>
                      <Field label="Branch">
                        <BranchInput value={branch} onChange={setBranch} />
                      </Field>
                      <p className="sm:col-span-2 text-[11px] text-neutral-500">
                        Files with the same path are replaced. Files not in the ZIP stay as they are.
                      </p>
                    </>
                  )}

                  <div className="sm:col-span-2">
                    <Field label="Commit message">
                      <input
                        type="text"
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        placeholder={defaultCommit}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </div>

                {isPushing && (
                  <div className="p-4 rounded-lg bg-white/[0.04] border border-white/10 space-y-2.5">
                    <div className="flex justify-between items-center gap-3 text-xs font-medium text-neutral-200">
                      <span className="truncate">{pushStatusMessage}</span>
                      <span className="font-mono shrink-0">{pushProgressPct}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-accent-400 h-full transition-all duration-300" style={{ width: `${pushProgressPct}%` }} />
                    </div>
                  </div>
                )}

                <div className="pt-5 border-t border-white/[0.08] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4">
                  {!analysis.hasGitIgnore ? (
                    <label className="flex items-center gap-2.5 text-xs text-neutral-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={addGitignore}
                        onChange={(e) => setAddGitignore(e.target.checked)}
                        className="w-4 h-4 rounded accent-[#55A67F]"
                      />
                      <span>Add a .gitignore (the ZIP has none)</span>
                    </label>
                  ) : (
                    <span className="text-xs text-neutral-500">Includes a .gitignore</span>
                  )}

                  <button
                    type="submit"
                    disabled={isPushing || isUploading}
                    className="btn-primary h-10 px-6 text-xs w-full sm:w-auto sm:min-w-[210px]"
                  >
                    {isPushing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Pushing...</span>
                      </>
                    ) : destination === 'new' ? (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>Create and push</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4" />
                        <span>Push files</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
