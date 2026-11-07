/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext.js';
import { 
  ProjectAnalysis, 
  InspectedZipData, 
  CreatedRepoResult, 
  DeploymentRecord 
} from '../types.js';
import { DeploymentOptions } from '../components/DeploymentOptions.js';
import { 
  UploadCloud, 
  FileArchive, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  FolderTree, 
  GitBranch, 
  Lock, 
  Globe, 
  ArrowRight, 
  Sparkles, 
  Layers, 
  FileCheck, 
  Loader2,
  RefreshCw,
  Zap,
  Terminal,
  ExternalLink
} from 'lucide-react';

interface DashboardPageProps {
  onOpenConnectModal: () => void;
  onViewDeployment: (dep: DeploymentRecord) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onOpenConnectModal,
  onViewDeployment,
}) => {
  const { 
    isAuthenticated, 
    token, 
    currentZip, 
    setCurrentZip, 
    openDoctorWithPrompt, 
    refreshActivities 
  } = useApp();

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadDetails, setUploadDetails] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Repository form state
  const [repoName, setRepoName] = useState('');
  const [repoDescription, setRepoDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [branch, setBranch] = useState('main');

  // Push state
  const [isPushing, setIsPushing] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState<string>('');
  const [pushProgressPct, setPushProgressPct] = useState<number>(0);
  const [createdRepoResult, setCreatedRepoResult] = useState<CreatedRepoResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle uploaded file inspection with realistic byte-level progress and 5-min timeout
  const processZipFile = (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setErrorMessage('Please upload a valid ZIP archive (.zip)');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    const initialMB = (file.size / (1024 * 1024)).toFixed(1);
    setUploadDetails(`Starting upload of ${file.name} (${initialMB} MB)...`);
    setErrorMessage(null);
    setCreatedRepoResult(null);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    // 5 minutes (300,000ms) timeout for slow network connections
    xhr.timeout = 5 * 60 * 1000;
    const uploadStartTime = Date.now();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
        const loadedMB = (event.loaded / (1024 * 1024)).toFixed(1);
        const totalMB = (event.total / (1024 * 1024)).toFixed(1);

        const elapsedSec = (Date.now() - uploadStartTime) / 1000;
        let speedStr = '';
        if (elapsedSec > 1 && event.loaded > 0) {
          const bytesPerSec = event.loaded / elapsedSec;
          if (bytesPerSec > 1024 * 1024) {
            speedStr = ` • ${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
          } else {
            speedStr = ` • ${(bytesPerSec / 1024).toFixed(0)} KB/s`;
          }
        }

        setUploadProgress(percent);
        setUploadDetails(`${loadedMB} MB of ${totalMB} MB (${percent}%)${speedStr}`);
      }
    };

    xhr.upload.onload = () => {
      setUploadProgress(100);
      setUploadDetails('Upload complete (100%). Analyzing package structure & security...');
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
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
          setBranch('main');
          setUploadDetails(null);
        } else {
          setErrorMessage(data.error || 'Failed to inspect ZIP file');
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Inspection failed: invalid server response');
      } finally {
        setIsUploading(false);
      }
    };

    xhr.onerror = () => {
      setErrorMessage('Network connection lost during file upload. Please check your internet connection.');
      setIsUploading(false);
      setUploadDetails(null);
    };

    xhr.ontimeout = () => {
      setErrorMessage('Upload timed out after 5 minutes. The network connection is too slow; please try again.');
      setIsUploading(false);
      setUploadDetails(null);
    };

    xhr.open('POST', '/api/zip/inspect');
    xhr.send(formData);
  };

  // Generate sample starter template with 5-minute timeout
  const handleLoadSample = async (sampleType: 'vite-react' | 'node-express' | 'static-html') => {
    setIsUploading(true);
    setUploadProgress(30);
    setUploadDetails('Generating sample repository template...');
    setErrorMessage(null);
    setCreatedRepoResult(null);

    try {
      setUploadProgress(60);
      const res = await fetch(`/api/sample-zip/${sampleType}`, {
        method: 'POST',
        signal: AbortSignal.timeout ? AbortSignal.timeout(5 * 60 * 1000) : undefined,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate sample');
      }

      setUploadProgress(100);
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
      setBranch('main');
    } catch (err: any) {
      setErrorMessage(err.message || 'Sample generation failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadDetails(null);
    }
  };

  // Create repository & push files with live progress streaming and 5-min timeout
  const handleCreateAndPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentZip) return;

    if (!isAuthenticated) {
      onOpenConnectModal();
      return;
    }

    if (!repoName.trim()) {
      setErrorMessage('Please enter a valid repository name');
      return;
    }

    setIsPushing(true);
    setPushProgressPct(10);
    setPushStatusMessage('Connecting to GitHub API (5 min timeout enabled)...');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/zip/push-to-github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/x-ndjson, application/json',
          'x-github-token': token,
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(5 * 60 * 1000) : undefined,
        body: JSON.stringify({
          uploadId: currentZip.uploadId,
          repoName: repoName.trim(),
          description: repoDescription.trim(),
          isPrivate,
          branch: branch.trim() || 'main',
        }),
      });

      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/x-ndjson') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let completedResult: any = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              if (event.type === 'progress') {
                setPushProgressPct(event.percent);
                setPushStatusMessage(event.message);
              } else if (event.type === 'complete') {
                completedResult = event;
              } else if (event.type === 'error') {
                throw new Error(event.error || 'Push operation failed');
              }
            } catch (pErr: any) {
              if (pErr.message && !pErr.message.includes('JSON')) throw pErr;
            }
          }
        }

        if (completedResult && completedResult.success) {
          setPushProgressPct(100);
          setPushStatusMessage('Repository created and verified successfully!');
          setCreatedRepoResult(completedResult);
          await refreshActivities();
        } else {
          throw new Error('Failed to complete push operation.');
        }
      } else {
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to push project to GitHub');
        }

        setPushProgressPct(100);
        setPushStatusMessage('Repository created and verified successfully!');
        setCreatedRepoResult(data);
        await refreshActivities();
      }
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.message?.includes('timeout')) {
        setErrorMessage('Operation timed out after 5 minutes. Please verify repository state on GitHub.');
      } else {
        setErrorMessage(err.message || 'Push operation failed');
      }
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      
      {/* Hero Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-200/60 dark:bg-neutral-800/60 border border-neutral-300/40 dark:border-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200 shadow-2xs">
          <Zap className="w-3.5 h-3.5 text-neutral-900 dark:text-white" />
          <span>ZIP to GitHub in under 5 seconds</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-white leading-tight">
          Your project deserves to be live.
        </h1>
        <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 max-w-lg mx-auto leading-relaxed">
          Upload your ZIP, push it to GitHub, and deploy without complicated setup.
        </p>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Error:</span> {errorMessage}
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {/* Main Upload Dropzone or Inspect View */}
      {!currentZip ? (
        <div className="space-y-6">
          
          {/* Drag & Drop Card */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                processZipFile(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`clay-card p-8 sm:p-12 text-center cursor-pointer transition-all border-2 border-dashed ${
              isDragging
                ? 'border-neutral-900 dark:border-white bg-neutral-100/60 dark:bg-neutral-800/80 scale-[1.01]'
                : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  processZipFile(e.target.files[0]);
                }
              }}
            />

            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center mx-auto shadow-md">
                {isUploading ? (
                  <RefreshCw className="w-8 h-8 animate-spin" />
                ) : (
                  <UploadCloud className="w-8 h-8" />
                )}
              </div>

              <div>
                <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                  {isUploading ? 'Inspecting archive security...' : 'Drop your project ZIP file here'}
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Supports React, Vite, Next.js, Node.js, Python, or static HTML archives (max 50MB).
                </p>
              </div>

              {isUploading ? (
                <div className="w-full space-y-2">
                  <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-neutral-900 dark:bg-white h-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  {uploadDetails && (
                    <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500 px-0.5">
                      <span className="truncate mr-2">{uploadDetails}</span>
                      <span className="shrink-0 font-semibold">{uploadProgress}%</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="pt-2">
                  <button
                    type="button"
                    className="clay-button-primary px-6 py-2.5 text-xs font-semibold inline-flex items-center gap-2"
                  >
                    <span>Browse Local Files</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Sample Starters */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-neutral-500 px-1">
              <span>Don't have a ZIP file handy? Try a live test project:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleLoadSample('vite-react')}
                className="clay-card p-4 text-left hover:border-neutral-400 dark:hover:border-neutral-600 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900 dark:text-white">Vite + React</span>
                  <span className="text-[10px] font-mono text-neutral-400">SPA</span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">Fast frontend with static build configuration</p>
              </button>

              <button
                type="button"
                onClick={() => handleLoadSample('node-express')}
                className="clay-card p-4 text-left hover:border-neutral-400 dark:hover:border-neutral-600 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900 dark:text-white">Node.js Express</span>
                  <span className="text-[10px] font-mono text-neutral-400">API</span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">Backend service with health check routes</p>
              </button>

              <button
                type="button"
                onClick={() => handleLoadSample('static-html')}
                className="clay-card p-4 text-left hover:border-neutral-400 dark:hover:border-neutral-600 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900 dark:text-white">Static Portfolio</span>
                  <span className="text-[10px] font-mono text-neutral-400">HTML</span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">Zero-dependency static website</p>
              </button>
            </div>
          </div>

        </div>
      ) : (
        /* Inspected Project & Push Configuration */
        <div className="space-y-6">
          
          {/* Top Banner: File Inspected */}
          <div className="clay-card p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center shrink-0 shadow-sm">
                  <FileArchive className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                    {currentZip.filename}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">{currentZip.analysis.frameworkName}</span>
                    <span>·</span>
                    <span>{currentZip.analysis.fileCount} files</span>
                    <span>·</span>
                    <span>{currentZip.analysis.formattedSize}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setCurrentZip(null);
                  setCreatedRepoResult(null);
                }}
                className="clay-button-secondary px-3 py-1.5 text-xs font-semibold self-start sm:self-auto"
              >
                Change Archive
              </button>
            </div>

            {/* Potential Issues & Warnings */}
            {currentZip.analysis.potentialIssues.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  <span>Deployment Health Check:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentZip.analysis.potentialIssues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border text-xs space-y-1 ${
                        issue.type === 'critical'
                          ? 'bg-red-50/70 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-300'
                          : issue.type === 'warning'
                          ? 'bg-amber-50/70 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-300'
                          : 'bg-neutral-50 border-neutral-200 text-neutral-700 dark:bg-neutral-800/40 dark:border-neutral-800 dark:text-neutral-300'
                      }`}
                    >
                      <div className="font-semibold flex items-center gap-1.5">
                        {issue.type === 'critical' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        ) : issue.type === 'warning' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        ) : (
                          <Info className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        )}
                        <span>{issue.title}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">{issue.description}</p>
                      {issue.recommendation && (
                        <p className="text-[10px] font-medium pt-0.5 opacity-80">
                          Fix: {issue.recommendation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Repo Creation Form or Deployment Options */}
          {!createdRepoResult ? (
            <div className="clay-card p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-5">
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  Configure GitHub Repository
                </h3>
                <p className="text-xs text-neutral-500">
                  Choose your repository name, visibility, and branch before pushing.
                </p>
              </div>

              <form onSubmit={handleCreateAndPush} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Repository Name
                    </label>
                    <input
                      type="text"
                      required
                      value={repoName}
                      onChange={(e) => setRepoName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
                      placeholder="my-new-project"
                      className="clay-input w-full px-3.5 py-2.5 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Target Branch
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        placeholder="main"
                        className="clay-input w-full px-3.5 py-2.5 text-xs font-mono pl-8"
                      />
                      <GitBranch className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                    Description
                  </label>
                  <input
                    type="text"
                    value={repoDescription}
                    onChange={(e) => setRepoDescription(e.target.value)}
                    placeholder="Project description"
                    className="clay-input w-full px-3.5 py-2.5 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                    Visibility
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setIsPrivate(true)}
                      className={`p-3 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 ${
                        isPrivate
                          ? 'border-neutral-900 dark:border-white bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                          : 'border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300'
                      }`}
                    >
                      <Lock className="w-4 h-4 shrink-0" />
                      <div>
                        <div className="font-semibold">Private (Default)</div>
                        <div className="text-[10px] opacity-70">Only you can view</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsPrivate(false)}
                      className={`p-3 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 ${
                        !isPrivate
                          ? 'border-neutral-900 dark:border-white bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                          : 'border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300'
                      }`}
                    >
                      <Globe className="w-4 h-4 shrink-0" />
                      <div>
                        <div className="font-semibold">Public</div>
                        <div className="text-[10px] opacity-70">Visible to anyone</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Progress bar when pushing */}
                {isPushing && (
                  <div className="p-4 rounded-2xl bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-2">
                    <div className="flex justify-between items-center text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      <span className="truncate mr-2">{pushStatusMessage}</span>
                      <span className="font-mono shrink-0">{pushProgressPct}%</span>
                    </div>
                    <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-neutral-900 dark:bg-white h-full transition-all duration-300"
                        style={{ width: `${pushProgressPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-neutral-500 font-mono pt-0.5">
                      <span>Live GitHub synchronization</span>
                      <span>5 min timeout active</span>
                    </div>
                  </div>
                )}

                {/* Submit Action */}
                <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => openDoctorWithPrompt(`Diagnose my uploaded project ${currentZip.filename} (${currentZip.analysis.frameworkName})`)}
                    className="clay-button-secondary px-4 py-2.5 text-xs font-semibold flex items-center gap-2 w-full sm:w-auto justify-center"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ask AI Doctor to Audit</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isPushing}
                    className="clay-button-primary px-6 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 w-full sm:w-auto disabled:opacity-50"
                  >
                    {isPushing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating Repo & Pushing Code...</span>
                      </>
                    ) : (
                      <>
                        <GitBranch className="w-4 h-4" />
                        <span>Create Repo & Push Code</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Post-Push Three Deployment Options */
            <DeploymentOptions
              repoResult={createdRepoResult}
              analysis={currentZip.analysis}
              onSelectDeployment={(dep) => {
                onViewDeployment(dep);
              }}
            />
          )}

        </div>
      )}

    </div>
  );
};
