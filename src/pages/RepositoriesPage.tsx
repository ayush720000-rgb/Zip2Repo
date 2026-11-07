/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.js';
import { GitHubRepoItem } from '../types.js';
import { 
  GitBranch, 
  Search, 
  Lock, 
  Globe, 
  Star, 
  ExternalLink, 
  Rocket, 
  Sparkles, 
  RefreshCw, 
  Trash2, 
  Plus,
  AlertCircle
} from 'lucide-react';

interface RepositoriesPageProps {
  onOpenConnectModal: () => void;
  onDeployRepo: (repo: GitHubRepoItem) => void;
}

export const RepositoriesPage: React.FC<RepositoriesPageProps> = ({
  onOpenConnectModal,
  onDeployRepo,
}) => {
  const { token, isAuthenticated, openDoctorWithPrompt } = useApp();
  const [repos, setRepos] = useState<GitHubRepoItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterVisibility, setFilterVisibility] = useState<'all' | 'public' | 'private'>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [repoToDelete, setRepoToDelete] = useState<GitHubRepoItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchRepos = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/repos', {
        headers: { 'x-github-token': token },
        signal: AbortSignal.timeout ? AbortSignal.timeout(5 * 60 * 1000) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load repositories');
      }
      setRepos(data.repositories || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading repositories');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, [token]);

  const handleDeleteRepo = async () => {
    if (!repoToDelete || !token) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/repos/${repoToDelete.owner.login}/${repoToDelete.name}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-github-token': token,
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(5 * 60 * 1000) : undefined,
        body: JSON.stringify({ confirmRepoName: repoToDelete.name }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete repository');
      }

      setRepos((prev) => prev.filter((r) => r.id !== repoToDelete.id));
      setRepoToDelete(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Error deleting repository');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredRepos = repos.filter((r) => {
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesVis = filterVisibility === 'all' ? true : filterVisibility === 'private' ? r.private : !r.private;
    return matchesSearch && matchesVis;
  });

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-14 h-14 rounded-3xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center mx-auto shadow-md">
          <GitBranch className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Connect GitHub to view your repositories</h2>
        <p className="text-xs text-neutral-500 max-w-sm mx-auto">
          Authenticate with your GitHub Personal Access Token to manage, inspect, and deploy your projects.
        </p>
        <button
          onClick={onOpenConnectModal}
          className="clay-button-primary px-6 py-2.5 text-xs font-semibold inline-flex items-center gap-2"
        >
          <span>Connect GitHub</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">My Repositories</h1>
          <p className="text-xs text-neutral-500">Search, deploy, or manage your GitHub repositories.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRepos}
            disabled={isLoading}
            className="clay-button-secondary p-2.5 text-xs font-semibold flex items-center gap-1.5"
            title="Refresh repositories"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => openDoctorWithPrompt('Create a new GitHub repository for my project.')}
            className="clay-button-primary px-4 py-2.5 text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create via AI Doctor</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Search & Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search repositories by name or description..."
            className="clay-input w-full pl-10 pr-4 py-2 text-xs"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-neutral-200/50 dark:bg-neutral-800/50 rounded-xl self-start sm:self-auto border border-neutral-300/30 dark:border-neutral-700/30">
          {(['all', 'public', 'private'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterVisibility(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-all ${
                filterVisibility === tab
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Repositories List */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-neutral-400 flex flex-col items-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-neutral-900 dark:text-white" />
          <span>Syncing repositories with GitHub...</span>
        </div>
      ) : filteredRepos.length === 0 ? (
        <div className="clay-card p-12 text-center space-y-3">
          <p className="text-xs text-neutral-500">No repositories found matching your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
          {filteredRepos.map((repo) => (
            <div
              key={repo.id}
              className="clay-card p-4 sm:p-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between hover:border-neutral-300 dark:hover:border-neutral-700 transition-all space-y-4 min-w-0 overflow-hidden"
            >
              <div className="space-y-2 min-w-0">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className="font-bold text-sm text-neutral-900 dark:text-white hover:underline cursor-pointer truncate min-w-0"
                      title={repo.name}
                    >
                      {repo.name}
                    </span>
                    <span className="text-[10px] font-mono shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                      {repo.private ? <Lock className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
                      <span>{repo.private ? 'Private' : 'Public'}</span>
                    </span>
                  </div>

                  {/* Top Right Action Icons: Delete + Open on GitHub (always pinned & visible) */}
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <button
                      onClick={() => setRepoToDelete(repo)}
                      className="p-1.5 text-neutral-400 hover:text-red-400 dark:hover:text-red-400 transition-colors rounded-md"
                      title={`Delete repository ${repo.name}`}
                      aria-label={`Delete ${repo.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors rounded-md"
                      title="Open on GitHub"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                <p className="text-xs text-neutral-500 line-clamp-2 break-words">
                  {repo.description || 'No description provided.'}
                </p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-400 pt-1">
                  {repo.language && (
                    <span className="flex items-center gap-1 font-medium text-neutral-600 dark:text-neutral-300">
                      <span className="w-2 h-2 rounded-full bg-neutral-400" />
                      {repo.language}
                    </span>
                  )}
                  {repo.stargazers_count > 0 && (
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-500" />
                      {repo.stargazers_count}
                    </span>
                  )}
                  <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 border-t border-neutral-100 dark:border-neutral-800 text-xs">
                <button
                  onClick={() => openDoctorWithPrompt(`Inspect files and configuration for repository ${repo.full_name}`)}
                  className="clay-button-secondary px-3 py-1.5 font-medium flex items-center justify-center gap-1.5 flex-1 sm:flex-initial text-center"
                >
                  <Sparkles className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Ask AI Doctor</span>
                </button>

                <button
                  onClick={() => onDeployRepo(repo)}
                  className="clay-button-primary px-3.5 py-1.5 font-semibold flex items-center justify-center gap-1.5 flex-1 sm:flex-initial text-center"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  <span>Deploy to Render</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {repoToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="clay-card p-6 max-w-md w-full bg-[#141418] border border-white/10 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-white">Delete Repository</h3>
                <p className="text-xs text-neutral-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed break-words">
              Are you sure you want to permanently delete <strong className="text-white font-semibold break-all">{repoToDelete.name}</strong> from your GitHub account? All branches, commits, and code files will be destroyed.
            </p>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setRepoToDelete(null);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="clay-button-secondary px-4 py-2 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRepo}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Repository</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

