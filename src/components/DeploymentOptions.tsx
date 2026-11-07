/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import { 
  ProjectAnalysis, 
  CreatedRepoResult, 
  DeploymentRecord, 
  PreparedChange, 
  RenderPreparationResult 
} from '../types.js';
import { 
  Rocket, 
  Wrench, 
  Play, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  FileCode, 
  Info, 
  X, 
  Check, 
  ArrowRight,
  ShieldCheck,
  Code
} from 'lucide-react';

interface DeploymentOptionsProps {
  repoResult: CreatedRepoResult;
  analysis: ProjectAnalysis;
  onSelectDeployment: (deployment: DeploymentRecord) => void;
}

export const DeploymentOptions: React.FC<DeploymentOptionsProps> = ({
  repoResult,
  analysis,
  onSelectDeployment,
}) => {
  const { renderApiKey, refreshDeployments, refreshActivities } = useApp();

  const [loadingAction, setLoadingAction] = useState<'render' | 'ready' | 'asis' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showReadyModal, setShowReadyModal] = useState(false);
  const [preparationResult, setPreparationResult] = useState<RenderPreparationResult | null>(null);
  const [isCommittingChanges, setIsCommittingChanges] = useState(false);
  const [committedSuccess, setCommittedSuccess] = useState(false);

  // Option A: Deploy to Render
  const handleDeployToRender = async () => {
    setLoadingAction('render');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/render/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: repoResult.repository.name,
          repoName: repoResult.repository.full_name,
          repoUrl: repoResult.repository.html_url,
          branch: repoResult.branch,
          renderApiKey: renderApiKey || undefined,
          asIs: false,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start Render deployment');
      }

      await refreshDeployments();
      await refreshActivities();
      onSelectDeployment(data.deployment);
    } catch (err: any) {
      setErrorMessage(err.message || 'Deployment error');
    } finally {
      setLoadingAction(null);
    }
  };

  // Option B: Make Render Ready (Opens inspection and diff preview modal)
  const handleMakeRenderReady = async () => {
    setLoadingAction('ready');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/render/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectType: analysis.projectType,
          packageDetails: analysis.packageDetails,
          existingFiles: analysis.topLevelFiles,
        }),
      });

      const data = await res.json();
      setPreparationResult(data);
      setShowReadyModal(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to evaluate Render compatibility');
    } finally {
      setLoadingAction(null);
    }
  };

  // User authorizes committing prepared changes
  const handleCommitPreparedChanges = async () => {
    if (!preparationResult || preparationResult.proposedChanges.length === 0) return;

    setIsCommittingChanges(true);
    setErrorMessage(null);

    try {
      const [owner, repo] = repoResult.repository.full_name.split('/');
      const res = await fetch('/api/render/commit-prepared', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          repo,
          branch: repoResult.branch,
          files: preparationResult.proposedChanges.map((c) => ({
            path: c.path,
            content: c.content,
          })),
          commitMessage: 'Configure Render deployment compatibility (render.yaml, .gitignore)',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to commit files to repository');
      }

      setCommittedSuccess(true);
      await refreshActivities();
    } catch (err: any) {
      setErrorMessage(err.message || 'Commit failed');
    } finally {
      setIsCommittingChanges(false);
    }
  };

  // Option C: Deploy As-Is
  const handleDeployAsIs = async () => {
    setLoadingAction('asis');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/render/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: repoResult.repository.name,
          repoName: repoResult.repository.full_name,
          repoUrl: repoResult.repository.html_url,
          branch: repoResult.branch,
          renderApiKey: renderApiKey || undefined,
          asIs: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to trigger as-is deployment');
      }

      await refreshDeployments();
      await refreshActivities();
      onSelectDeployment(data.deployment);
    } catch (err: any) {
      setErrorMessage(err.message || 'Deployment error');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success banner for Repo Creation */}
      <div className="clay-card p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                Repository created & code pushed!
              </h3>
              <p className="text-xs text-neutral-500">
                {repoResult.totalFiles} files committed to branch <span className="font-mono">{repoResult.branch}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={repoResult.repository.html_url}
              target="_blank"
              rel="noreferrer"
              className="clay-button-secondary px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5"
            >
              <span>View on GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Deployment Section Header */}
      <div>
        <h3 className="text-base font-bold text-neutral-900 dark:text-white">Choose Deployment Strategy</h3>
        <p className="text-xs text-neutral-500">Deploy directly to Render with optimized configuration or inspect source readiness.</p>
      </div>

      {/* Three Clean Deployment Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Card A: Deploy to Render */}
        <div className="clay-card p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between hover:border-neutral-300 dark:hover:border-neutral-700 transition-all">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center shadow-md">
                <Rocket className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                Recommended
              </span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-neutral-900 dark:text-white">Deploy to Render</h4>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                Connects GitHub to Render with detected runtime ({analysis.frameworkName}), provisions the service, and provides real-time logs and a live URL.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-600 dark:text-neutral-400 space-y-1">
              <div className="flex justify-between">
                <span>Target Provider:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">Render</span>
              </div>
              <div className="flex justify-between">
                <span>Detected Runtime:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">{analysis.frameworkName}</span>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <button
              onClick={handleDeployToRender}
              disabled={loadingAction !== null}
              className="clay-button-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingAction === 'render' ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Configuring & Deploying...</span>
                </>
              ) : (
                <>
                  <Rocket className="w-3.5 h-3.5" />
                  <span>Deploy to Render</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Card B: Make Render Ready */}
        <div className="clay-card p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between hover:border-neutral-300 dark:hover:border-neutral-700 transition-all">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white flex items-center justify-center">
                <Wrench className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                Inspect & Prepare
              </span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-neutral-900 dark:text-white">Make Render Ready</h4>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                Inspect project compatibility, generate optimal <code className="font-mono text-[11px]">render.yaml</code> blueprint and <code className="font-mono text-[11px]">.gitignore</code>. Review changes before pushing.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-600 dark:text-neutral-400 space-y-1">
              <div className="flex justify-between">
                <span>Automations:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">render.yaml + .gitignore</span>
              </div>
              <div className="flex justify-between">
                <span>Safe Review:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">User Approval Required</span>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <button
              onClick={handleMakeRenderReady}
              disabled={loadingAction !== null}
              className="clay-button-secondary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingAction === 'ready' ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-neutral-400 border-t-neutral-800 rounded-full animate-spin" />
                  <span>Inspecting compatibility...</span>
                </>
              ) : (
                <>
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Make Render Ready</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Card C: Deploy As-Is */}
        <div className="clay-card p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between hover:border-neutral-300 dark:hover:border-neutral-700 transition-all">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white flex items-center justify-center">
                <Play className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                Preserve Source
              </span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-neutral-900 dark:text-white">Deploy As-Is</h4>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                Attempt deployment using existing project files without automatically generating blueprints or modifying configuration.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-600 dark:text-neutral-400 space-y-1">
              <div className="flex justify-between">
                <span>Modifications:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">None (Original files)</span>
              </div>
              <div className="flex justify-between">
                <span>Requires:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">Existing build config</span>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <button
              onClick={handleDeployAsIs}
              disabled={loadingAction !== null}
              className="clay-button-secondary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingAction === 'asis' ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-neutral-400 border-t-neutral-800 rounded-full animate-spin" />
                  <span>Launching As-Is...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Deploy As-Is</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* Make Render Ready Modal (Inspect, Review Diffs, Approve & Push) */}
      {showReadyModal && preparationResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div 
            className="clay-card w-full max-w-2xl p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl relative max-h-[90vh] overflow-y-auto space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setShowReadyModal(false);
                setCommittedSuccess(false);
              }}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center shadow-md">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">Make Render Ready — Change Preview</h3>
                <p className="text-xs text-neutral-500">{preparationResult.summary}</p>
              </div>
            </div>

            {committedSuccess ? (
              <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Changes successfully committed to GitHub repository!</span>
                </div>
                <p className="text-xs leading-relaxed">
                  Your project is now fully configured with Render blueprints and clean git hygiene. You can now proceed to deploy with guaranteed compatibility.
                </p>
                <div className="pt-2 flex items-center gap-3">
                  <button
                    onClick={() => {
                      setShowReadyModal(false);
                      handleDeployToRender();
                    }}
                    className="clay-button-primary px-4 py-2 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <span>Now Deploy to Render</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowReadyModal(false)}
                    className="clay-button-secondary px-3.5 py-2 text-xs font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3.5 rounded-2xl bg-neutral-100/70 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    No changes are applied without your explicit approval. Review the proposed configuration files below.
                  </span>
                </div>

                {/* List Proposed Changes */}
                <div className="space-y-4">
                  {preparationResult.proposedChanges.map((change) => (
                    <div key={change.path} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                      <div className="p-3 bg-neutral-50 dark:bg-neutral-850 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                          <span className="font-mono text-xs font-bold text-neutral-900 dark:text-white">{change.path}</span>
                          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                            {change.action}
                          </span>
                        </div>
                      </div>
                      <div className="p-3 bg-neutral-50/50 dark:bg-neutral-900 text-xs text-neutral-600 dark:text-neutral-400 border-b border-neutral-100 dark:border-neutral-800">
                        <strong>Rationale:</strong> {change.rationale}
                      </div>
                      <div className="p-3 bg-neutral-950 font-mono text-[11px] text-neutral-300 overflow-x-auto max-h-48 leading-relaxed">
                        <pre>{change.content}</pre>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setShowReadyModal(false)}
                    className="clay-button-secondary px-4 py-2.5 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isCommittingChanges}
                    onClick={handleCommitPreparedChanges}
                    className="clay-button-primary px-5 py-2.5 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    {isCommittingChanges ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Committing changes to GitHub...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve & Push Changes to Repo</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
