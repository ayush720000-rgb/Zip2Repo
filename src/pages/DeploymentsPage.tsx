/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.js';
import { DeploymentRecord } from '../types.js';
import { 
  Rocket, 
  ExternalLink, 
  Terminal, 
  RotateCw, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  X, 
  Copy, 
  Check, 
  Layers,
  ArrowUpRight
} from 'lucide-react';

interface DeploymentsPageProps {
  selectedDeploymentId?: string;
}

export const DeploymentsPage: React.FC<DeploymentsPageProps> = ({ selectedDeploymentId }) => {
  const { deployments, refreshDeployments, renderApiKey, openDoctorWithPrompt } = useApp();
  const [activeLogDeployment, setActiveLogDeployment] = useState<DeploymentRecord | null>(null);
  const [isRetrying, setIsRetrying] = useState<string | null>(null);
  const [copiedLog, setCopiedLog] = useState(false);

  useEffect(() => {
    refreshDeployments();
    const interval = setInterval(refreshDeployments, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedDeploymentId) {
      const match = deployments.find((d) => d.id === selectedDeploymentId);
      if (match) setActiveLogDeployment(match);
    }
  }, [selectedDeploymentId, deployments]);

  const handleRetry = async (dep: DeploymentRecord) => {
    setIsRetrying(dep.id);
    try {
      await fetch('/api/render/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: dep.projectName,
          repoName: dep.repoName,
          repoUrl: dep.repoUrl,
          branch: dep.branch,
          renderApiKey: renderApiKey || undefined,
        }),
      });
      await refreshDeployments();
    } catch (e) {
      // Ignore
    } finally {
      setIsRetrying(null);
    }
  };

  const getStatusBadge = (status: DeploymentRecord['status']) => {
    switch (status) {
      case 'live':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live</span>
          </span>
        );
      case 'building':
      case 'deploying':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
            <RotateCw className="w-3 h-3 animate-spin" />
            <span className="capitalize">{status}</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400">
            <AlertCircle className="w-3 h-3" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
            <Clock className="w-3 h-3" />
            <span className="capitalize">{status}</span>
          </span>
        );
    }
  };

  const copyLogs = (logs: string[]) => {
    navigator.clipboard.writeText(logs.join('\n'));
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">Deployments</h1>
          <p className="text-xs text-neutral-500">Monitor live URLs, Render pipelines, and build logs.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshDeployments}
            className="clay-button-secondary p-2.5 text-xs font-semibold flex items-center gap-1.5"
            title="Refresh deployments status"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {deployments.length === 0 ? (
        <div className="clay-card p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
            <Rocket className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-neutral-900 dark:text-white">No deployments yet</h3>
            <p className="text-xs text-neutral-500 mt-1">
              Upload a ZIP archive from the Dashboard and click "Deploy to Render" to launch your first service.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {deployments.map((dep) => (
            <div
              key={dep.id}
              className="clay-card p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-neutral-300 dark:hover:border-neutral-700 transition-all"
            >
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-base text-neutral-900 dark:text-white">
                    {dep.projectName}
                  </span>
                  {getStatusBadge(dep.status)}
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                    {dep.provider}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                  <a
                    href={dep.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-neutral-900 dark:hover:text-white flex items-center gap-1"
                  >
                    <span>{dep.repoName}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <span>·</span>
                  <span className="font-mono text-[11px]">branch: {dep.branch}</span>
                  <span>·</span>
                  <span>{new Date(dep.createdAt).toLocaleString()}</span>
                </div>

                {dep.liveUrl && dep.status === 'live' && (
                  <div className="pt-1">
                    <a
                      href={dep.liveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      <span>{dep.liveUrl}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2.5 pt-2 md:pt-0">
                <button
                  onClick={() => setActiveLogDeployment(dep)}
                  className="clay-button-secondary px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Build Logs ({dep.logs.length})</span>
                </button>

                <button
                  onClick={() => handleRetry(dep)}
                  disabled={isRetrying === dep.id}
                  className="clay-button-primary px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isRetrying === dep.id ? 'animate-spin' : ''}`} />
                  <span>Redeploy</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Build Logs Modal */}
      {activeLogDeployment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div 
            className="clay-card w-full max-w-3xl bg-neutral-950 text-neutral-100 border border-neutral-800 rounded-3xl relative max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/80">
              <div className="flex items-center gap-2.5">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs sm:text-sm text-white">
                  Deployment Logs — {activeLogDeployment.projectName}
                </span>
                {getStatusBadge(activeLogDeployment.status)}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyLogs(activeLogDeployment.logs)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors text-xs flex items-center gap-1"
                  title="Copy logs"
                >
                  {copiedLog ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Copy</span>
                </button>
                <button
                  onClick={() => setActiveLogDeployment(null)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Terminal Body */}
            <div className="p-4 sm:p-5 flex-1 overflow-y-auto font-mono text-xs text-neutral-300 space-y-1.5 leading-relaxed bg-black/70">
              {activeLogDeployment.logs.map((log, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-neutral-600 select-none">{index + 1}</span>
                  <span className="break-all">{log}</span>
                </div>
              ))}
            </div>

            {/* Terminal Footer */}
            <div className="p-3 bg-neutral-900/90 border-t border-neutral-800 flex items-center justify-between text-xs">
              <span className="text-neutral-500 font-mono text-[11px]">
                Target: {activeLogDeployment.repoUrl}
              </span>
              <button
                onClick={() => {
                  setActiveLogDeployment(null);
                  openDoctorWithPrompt(`Diagnose the build logs for ${activeLogDeployment.projectName} on Render: \n${activeLogDeployment.logs.slice(-5).join('\n')}`);
                }}
                className="clay-button-secondary px-3 py-1.5 text-xs font-semibold"
              >
                Diagnose with AI Doctor
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
