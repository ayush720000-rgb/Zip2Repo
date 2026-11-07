/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import { Github, KeyRound, Check, AlertCircle, ExternalLink, X, ShieldCheck } from 'lucide-react';

interface GitHubConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitHubConnectModal: React.FC<GitHubConnectModalProps> = ({ isOpen, onClose }) => {
  const { setGitHubToken, user, token } = useApp();
  const [inputToken, setInputToken] = useState(token || '');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  if (!isOpen) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputToken.trim()) {
      setErrorMessage('Please enter a GitHub Personal Access Token');
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);

    const success = await setGitHubToken(inputToken.trim());
    setIsVerifying(false);

    if (success) {
      onClose();
    } else {
      setErrorMessage('Failed to authenticate with GitHub. Ensure your token is valid and has "repo" permissions.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div 
        className="clay-card w-full max-w-lg p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center shadow-md">
            <Github className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Connect Your GitHub</h2>
            <p className="text-xs text-neutral-500">Enable one-click repository creation and file pushing.</p>
          </div>
        </div>

        {user ? (
          <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700 mb-6 flex items-center gap-3">
            <img src={user.avatar_url} alt={user.login} className="w-12 h-12 rounded-xl" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-neutral-900 dark:text-white">@{user.login}</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">Connected</span>
              </div>
              <p className="text-xs text-neutral-500">{user.public_repos + (user.total_private_repos || 0)} repositories accessible</p>
            </div>
          </div>
        ) : null}

        {/* Form */}
        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              Personal Access Token (Classic or Fine-Grained)
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="clay-input w-full px-3.5 py-2.5 text-xs font-mono pr-20"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 px-2 py-1 rounded-md"
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Quick Setup Instructions */}
          <div className="p-4 rounded-2xl bg-neutral-100/70 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-800 space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
            <div className="flex items-center justify-between font-semibold text-neutral-800 dark:text-neutral-200">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" /> How to get a token:
              </span>
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=Zip2Repo+Access"
                target="_blank"
                rel="noreferrer"
                className="text-neutral-900 dark:text-white underline hover:no-underline flex items-center gap-1"
              >
                Generate Token <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <ol className="list-decimal pl-4 space-y-1 leading-relaxed text-[11px]">
              <li>Visit GitHub Token Settings (or click the quick link above).</li>
              <li>Check the <strong className="text-neutral-800 dark:text-neutral-200">repo</strong> scope (gives permission to create repos and push files).</li>
              <li>Generate and copy your token, then paste it above.</li>
            </ol>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-neutral-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Tokens are used only to communicate with GitHub API directly from your server. Never shared.</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="clay-button-secondary px-4 py-2.5 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              className="clay-button-primary px-5 py-2.5 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Verify & Connect</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
