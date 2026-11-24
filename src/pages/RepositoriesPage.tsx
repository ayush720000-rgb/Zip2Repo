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
  Stethoscope,
  RefreshCw,
  Trash2,
  Plus,
  AlertCircle,
  Copy,
  Check,
  UploadCloud,
} from 'lucide-react';

interface RepositoriesPageProps {
  onOpenConnectModal: () => void;
  onPushToRepo: (repo: GitHubRepoItem) => void;
}

export const RepositoriesPage: React.FC<RepositoriesPageProps> = ({ onOpenConnectModal, onPushToRepo }) => {
  const { token, isAuthenticated, openDoctorWithPrompt } = useApp();
  const [repos, setRepos] = useState<GitHubRepoItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterVisibility, setFilterVisibility] = useState<'all' | 'public' | 'private'>('all');
  const [sortBy, setSortBy] = useState<'updated' | 'name' | 'stars'>('updated');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [repoToDelete, setRepoToDelete] = useState<GitHubRepoItem | null>(null);
  const [notice, setNotice] = useState<{ kind: 'info' | 'success' | 'error'; text: string } | null>(null);

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
        signal: AbortSignal.timeout(5 * 60 * 1000),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load repositories');
      }
      setRepos(data.repositories || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load repositories');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, [token]);

  const showNotice = (kind: 'info' | 'success' | 'error', text: string) => {
    setNotice({ kind, text });
    if (kind !== 'info') setTimeout(() => setNotice(null), 3500);
  };

  // Remove the card at once, delete on GitHub in the background, and restore it if that fails.
  const handleDeleteRepo = async () => {
    if (!repoToDelete || !token) return;
    const target = repoToDelete;
    const index = repos.findIndex((r) => r.id === target.id);
    setRepoToDelete(null);
    setRepos((prev) => prev.filter((r) => r.id !== target.id));
    showNotice('info', `Deleting ${target.full_name}...`);

    try {
      const res = await fetch(`/api/repos/${target.owner.login}/${target.name}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-github-token': token },
        body: JSON.stringify({ confirmRepoName: target.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete repository');
      showNotice('success', `Deleted ${target.full_name}`);
    } catch (err: any) {
      setRepos((prev) => {
        const next = [...prev];
        next.splice(index < 0 ? next.length : index, 0, target);
        return next;
      });
      showNotice('error', err.message || 'Could not delete the repository. It is still on GitHub.');
    }
  };

  const copyCloneUrl = async (repo: GitHubRepoItem) => {
    try {
      await navigator.clipboard.writeText(`${repo.html_url}.git`);
      setCopiedId(repo.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard access can be blocked; nothing else to do
    }
  };

  const filteredRepos = repos
    .filter((r) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q || r.name.toLowerCase().includes(q) || (r.description?.toLowerCase().includes(q) ?? false);
      const matchesVis = filterVisibility === 'all' ? true : filterVisibility === 'private' ? r.private : !r.private;
      return matchesSearch && matchesVis;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'stars') return b.stargazers_count - a.stargazers_count;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center mx-auto text-neutral-200">
          <GitBranch className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-white">Connect GitHub to see your repositories</h2>
        <p className="text-xs text-neutral-500 max-w-sm mx-auto">
          Add a Personal Access Token to list your repositories, push to them, and manage them.
        </p>
        <button onClick={onOpenConnectModal} className="btn-primary px-5 py-2.5 text-xs">
          <span>Connect GitHub</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">My Repositories</h1>
          <p className="text-xs text-neutral-500">Search your repositories, push a ZIP into one, or manage it.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchRepos} disabled={isLoading} className="btn-secondary p-2.5" title="Refresh repositories" aria-label="Refresh repositories">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => openDoctorWithPrompt('Create a new GitHub repository for my project. Ask me for the name first.')}
            className="btn-secondary px-4 py-2.5 text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create with AI Doctor</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-900/50 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or description"
            aria-label="Search repositories"
            className="field w-full pl-10 pr-4 py-2 text-xs"
          />
        </div>

        <div role="group" aria-label="Filter by visibility" className="flex items-center gap-1 p-1 bg-white/[0.04] rounded-lg self-start sm:self-auto border border-white/[0.08]">
          {(['all', 'public', 'private'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterVisibility(tab)}
              aria-pressed={filterVisibility === tab}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                filterVisibility === tab ? 'bg-[#222227] text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'updated' | 'name' | 'stars')}
          aria-label="Sort repositories"
          className="field px-3 py-2 text-xs self-start sm:self-auto"
        >
          <option value="updated">Recently updated</option>
          <option value="name">Name A–Z</option>
          <option value="stars">Most stars</option>
        </select>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs text-neutral-500 flex flex-col items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-neutral-300" />
          <span>Loading repositories from GitHub...</span>
        </div>
      ) : filteredRepos.length === 0 ? (
        <div className="surface p-12 text-center">
          <p className="text-xs text-neutral-500">No repositories match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
          {filteredRepos.map((repo) => (
            <div key={repo.id} className="surface p-4 sm:p-5 flex flex-col justify-between gap-4 min-w-0 hover:border-white/15 transition-colors">
              <div className="space-y-2 min-w-0">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-sm text-white hover:underline truncate min-w-0"
                      title={repo.full_name}
                    >
                      {repo.name}
                    </a>
                    <span className="text-[10px] font-mono shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] text-neutral-400">
                      {repo.private ? <Lock className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
                      <span>{repo.private ? 'Private' : 'Public'}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => copyCloneUrl(repo)}
                      className="p-1.5 text-neutral-500 hover:text-white transition-colors rounded-md"
                      title="Copy clone URL"
                      aria-label={`Copy clone URL for ${repo.name}`}
                    >
                      {copiedId === repo.id ? <Check className="w-3.5 h-3.5 text-accent-300" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 text-neutral-500 hover:text-white transition-colors rounded-md"
                      title="Open on GitHub"
                      aria-label={`Open ${repo.name} on GitHub`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => setRepoToDelete(repo)}
                      className="p-1.5 text-neutral-500 hover:text-red-400 transition-colors rounded-md"
                      title={`Delete ${repo.name}`}
                      aria-label={`Delete ${repo.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-neutral-500 line-clamp-2 break-words">
                  {repo.description || 'No description'}
                </p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 pt-1">
                  {repo.language && (
                    <span className="flex items-center gap-1 text-neutral-300">
                      <span className="w-2 h-2 rounded-full bg-neutral-500" />
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

              <div className="pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] text-xs">
                <button
                  onClick={() => openDoctorWithPrompt(`Inspect the files and configuration of ${repo.full_name} and tell me what you find.`)}
                  className="btn-secondary px-3 py-1.5 font-medium flex-1 sm:flex-initial"
                >
                  <Stethoscope className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Ask AI Doctor</span>
                </button>

                <button onClick={() => onPushToRepo(repo)} className="btn-primary px-3.5 py-1.5 font-semibold flex-1 sm:flex-initial">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Push a ZIP here</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {repoToDelete && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setRepoToDelete(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-repo-title"
            className="animate-pop-in surface p-6 max-w-md w-full bg-[#141418] space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="delete-repo-title" className="text-sm font-semibold text-white">Delete repository</h3>
                <p className="text-xs text-neutral-400">This cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed break-words">
              Permanently delete <strong className="text-white font-semibold break-all">{repoToDelete.full_name}</strong>?
              All branches, commits, issues, and files are removed from GitHub.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button type="button" onClick={() => setRepoToDelete(null)} className="btn-secondary px-4 py-2 font-medium">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRepo}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete repository</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className={`animate-pop-in fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg border text-xs font-medium shadow-xl ${
            notice.kind === 'error'
              ? 'bg-red-950 border-red-800 text-red-200'
              : notice.kind === 'success'
              ? 'bg-[#0F2A1E] border-accent-800 text-accent-200'
              : 'bg-[#18181C] border-white/10 text-neutral-200'
          }`}
        >
          {notice.text}
        </div>
      )}

    </div>
  );
};
