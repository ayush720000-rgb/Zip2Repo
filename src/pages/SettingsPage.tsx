/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import { 
  Settings, 
  Github, 
  Rocket, 
  Sun, 
  Moon, 
  ShieldCheck, 
  ExternalLink, 
  Trash2, 
  Check, 
  KeyRound,
  AlertCircle
} from 'lucide-react';

interface SettingsPageProps {
  onOpenConnectModal: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onOpenConnectModal }) => {
  const { 
    user, 
    token, 
    disconnectGitHub, 
    renderApiKey, 
    setRenderApiKey, 
    theme, 
    toggleTheme 
  } = useApp();

  const [inputRenderKey, setInputRenderKey] = useState(renderApiKey);
  const [renderSaved, setRenderSaved] = useState(false);
  const [isVerifyingRender, setIsVerifyingRender] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const handleSaveRenderKey = (e: React.FormEvent) => {
    e.preventDefault();
    setRenderApiKey(inputRenderKey.trim());
    setRenderSaved(true);
    setTimeout(() => setRenderSaved(false), 2500);
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear local settings and disconnect GitHub?')) {
      disconnectGitHub();
      setRenderApiKey('');
      setInputRenderKey('');
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">Settings</h1>
        <p className="text-xs text-neutral-500">Configure GitHub access, Render credentials, and appearance.</p>
      </div>

      <div className="space-y-6">
        
        {/* GitHub Integration Section */}
        <div className="clay-card p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center">
                <Github className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-neutral-900 dark:text-white">GitHub Integration</h3>
                <p className="text-xs text-neutral-500">Enables automatic repository creation, branch commits, and AI Doctor tools.</p>
              </div>
            </div>

            {user && (
              <span className="text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                Connected
              </span>
            )}
          </div>

          {user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
                <img src={user.avatar_url} alt={user.login} className="w-12 h-12 rounded-xl object-cover" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-neutral-900 dark:text-white">
                      {user.name || user.login}
                    </span>
                    <span className="text-xs text-neutral-500 font-mono">(@{user.login})</span>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {user.public_repos + (user.total_private_repos || 0)} repositories accessible · Rate limit: {user.rateLimitRemaining || 5000} remaining
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={onOpenConnectModal}
                  className="clay-button-secondary px-4 py-2 text-xs font-semibold"
                >
                  Change Token
                </button>
                <button
                  onClick={disconnectGitHub}
                  className="clay-button-secondary px-4 py-2 text-xs font-semibold text-red-600 hover:text-red-700"
                >
                  Disconnect GitHub
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500 leading-relaxed">
                No GitHub account connected. Connect using a Personal Access Token with <code className="font-mono">repo</code> permissions.
              </p>
              <button
                onClick={onOpenConnectModal}
                className="clay-button-primary px-5 py-2.5 text-xs font-semibold inline-flex items-center gap-2"
              >
                <Github className="w-3.5 h-3.5" />
                <span>Connect GitHub Account</span>
              </button>
            </div>
          )}
        </div>

        {/* Render Integration Section */}
        <div className="clay-card p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center">
                <Rocket className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-neutral-900 dark:text-white">Render Deployment Integration</h3>
                <p className="text-xs text-neutral-500">Directly provision and monitor services via the Render REST API.</p>
              </div>
            </div>
            {renderApiKey && (
              <span className="text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                Key Saved
              </span>
            )}
          </div>

          <form onSubmit={handleSaveRenderKey} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Render API Key (Optional)
                </label>
                <a
                  href="https://dashboard.render.com/u/settings#api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-neutral-500 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1"
                >
                  <span>Get API Key from Render</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="password"
                value={inputRenderKey}
                onChange={(e) => setInputRenderKey(e.target.value)}
                placeholder="rnd_xxxxxxxxxxxxxxxxxxxx"
                className="clay-input w-full px-3.5 py-2.5 text-xs font-mono"
              />
              <p className="text-[11px] text-neutral-400 mt-1">
                If omitted, Zip2Repo uses Render's official One-Click Blueprint Deploy pipeline.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="clay-button-primary px-5 py-2 text-xs font-semibold flex items-center gap-1.5"
              >
                {renderSaved ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <span>Save Render Key</span>
                )}
              </button>
              {renderApiKey && (
                <button
                  type="button"
                  onClick={() => {
                    setRenderApiKey('');
                    setInputRenderKey('');
                  }}
                  className="clay-button-secondary px-3 py-2 text-xs text-red-600"
                >
                  Clear Key
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Theme Settings */}
        <div className="clay-card p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4">
          <div className="pb-3 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white">Theme & Display</h3>
              <p className="text-xs text-neutral-500">60% claymorphism, 30% minimalism, 10% AI-inspired tactile styling.</p>
            </div>
            <span className="text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
              Dark Mode (Default)
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#1A1A1E] border border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-800 text-white flex items-center justify-center shrink-0">
              <Moon className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="font-bold text-xs text-white">Premium Dark Theme Active</div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Optimized for eye comfort with deep obsidian tones (#0C0C0E), velvety cards, and tactile controls.
              </p>
            </div>
          </div>
        </div>

        {/* Reset Section */}
        <div className="clay-card p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-3">
          <h3 className="font-bold text-sm text-neutral-900 dark:text-white">Reset & Clear Cache</h3>
          <p className="text-xs text-neutral-500">
            Clear all cached tokens, uploaded file sessions, and conversation history from your browser.
          </p>
          <button
            onClick={handleClearAll}
            className="clay-button-secondary px-4 py-2 text-xs font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset All Local Data</span>
          </button>
        </div>

      </div>

    </div>
  );
};
