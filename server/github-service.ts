/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtractedFile } from './zip-service.js';

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  total_private_repos?: number;
  scopes: string[];
  rateLimitRemaining?: number;
  rateLimitLimit?: number;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  created_at: string;
  archived?: boolean;
}

const GITHUB_API_BASE = 'https://api.github.com';
const TIMEOUT_5_MINUTES = 5 * 60 * 1000; // 5 minutes timeout for slow internet

async function ghFetch(endpoint: string, token: string, options: RequestInit = {}): Promise<Response> {
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Zip2Repo-Engine/1.0',
    ...(options.headers as Record<string, string> || {}),
  };

  const signal = options.signal || (AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_5_MINUTES) : undefined);

  const response = await fetch(url, {
    ...options,
    headers,
    signal,
  });

  return response;
}

export async function verifyGitHubToken(token: string): Promise<GitHubUser> {
  const res = await ghFetch('/user', token);
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Invalid GitHub token. Please verify your Personal Access Token or OAuth credentials.');
    }
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || `GitHub authentication error (HTTP ${res.status})`);
  }

  const scopesHeader = res.headers.get('x-oauth-scopes') || '';
  const scopes = scopesHeader.split(',').map((s) => s.trim()).filter(Boolean);
  const rateLimitLimit = parseInt(res.headers.get('x-ratelimit-limit') || '5000', 10);
  const rateLimitRemaining = parseInt(res.headers.get('x-ratelimit-remaining') || '5000', 10);

  const data = await res.json();
  return {
    login: data.login,
    name: data.name,
    avatar_url: data.avatar_url,
    html_url: data.html_url,
    public_repos: data.public_repos,
    total_private_repos: data.total_private_repos,
    scopes,
    rateLimitLimit,
    rateLimitRemaining,
  };
}

export async function listUserRepositories(
  token: string,
  options: { sort?: 'updated' | 'created'; direction?: 'desc' | 'asc'; perPage?: number; type?: 'all' | 'owner' } = {}
): Promise<GitHubRepo[]> {
  const sort = options.sort || 'updated';
  const direction = options.direction || 'desc';
  const perPage = options.perPage || 30;
  const type = options.type || 'all';

  const res = await ghFetch(`/user/repos?sort=${sort}&direction=${direction}&per_page=${perPage}&type=${type}`, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to fetch repositories from GitHub');
  }

  return await res.json();
}

export async function getRepository(token: string, owner: string, repo: string): Promise<GitHubRepo> {
  const res = await ghFetch(`/repos/${owner}/${repo}`, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Repository ${owner}/${repo} not found`);
  }
  return await res.json();
}

export async function createRepository(
  token: string,
  params: {
    name: string;
    description?: string;
    isPrivate?: boolean;
    autoInit?: boolean;
  }
): Promise<GitHubRepo> {
  const res = await ghFetch('/user/repos', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      description: params.description || '',
      private: params.isPrivate ?? true,
      auto_init: params.autoInit ?? true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 422) {
      throw new Error(`Repository name "${params.name}" already exists on your account or is invalid.`);
    }
    throw new Error(err.message || `Failed to create repository: HTTP ${res.status}`);
  }

  return await res.json();
}

export async function renameRepository(
  token: string,
  owner: string,
  repo: string,
  newName: string
): Promise<GitHubRepo> {
  const res = await ghFetch(`/repos/${owner}/${repo}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to rename repository to ${newName}`);
  }

  return await res.json();
}

export async function updateRepoVisibility(
  token: string,
  owner: string,
  repo: string,
  isPrivate: boolean
): Promise<GitHubRepo> {
  const res = await ghFetch(`/repos/${owner}/${repo}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ private: isPrivate }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to update repository visibility`);
  }

  return await res.json();
}

export async function deleteRepository(
  token: string,
  owner: string,
  repo: string
): Promise<boolean> {
  const res = await ghFetch(`/repos/${owner}/${repo}`, token, {
    method: 'DELETE',
  });

  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to delete repository ${owner}/${repo}`);
  }

  return true;
}

export async function listRepoFiles(
  token: string,
  owner: string,
  repo: string,
  path: string = ''
): Promise<Array<{ name: string; path: string; type: 'file' | 'dir'; size: number; download_url: string | null }>> {
  const res = await ghFetch(`/repos/${owner}/${repo}/contents/${path}`, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to list files in ${owner}/${repo}`);
  }

  const data = await res.json();
  if (Array.isArray(data)) {
    return data.map((item: any) => ({
      name: item.name,
      path: item.path,
      type: item.type === 'dir' ? 'dir' : 'file',
      size: item.size || 0,
      download_url: item.download_url,
    }));
  }
  return [];
}

export async function getRepoFileContent(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  branch?: string
): Promise<{ content: string; encoding: string; sha: string }> {
  const url = `/repos/${owner}/${repo}/contents/${filePath}${branch ? `?ref=${branch}` : ''}`;
  const res = await ghFetch(url, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to read file ${filePath}`);
  }

  const data = await res.json();
  const rawContent = data.content || '';
  const decoded = Buffer.from(rawContent, 'base64').toString('utf-8');

  return {
    content: decoded,
    encoding: 'utf-8',
    sha: data.sha,
  };
}

export async function commitFilesDirectly(
  token: string,
  owner: string,
  repo: string,
  files: Array<{ path: string; content: string }>,
  commitMessage: string,
  branch: string = 'main'
): Promise<{ commitSha: string; commitUrl: string }> {
  // Convert string files to ExtractedFile format
  const extractedFiles: ExtractedFile[] = files.map((f) => ({
    path: f.path,
    content: Buffer.from(f.content, 'utf-8'),
    isBinary: false,
    size: Buffer.byteLength(f.content),
  }));

  return await pushExtractedFiles(token, owner, repo, branch, extractedFiles, commitMessage);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const MAX_RATE_LIMIT_WAIT_MS = 10 * 60 * 1000;

// Decide whether a failed response is a GitHub rate limit (primary or secondary).
async function isRateLimited(res: Response): Promise<boolean> {
  if (res.status === 429) return true;
  if (res.status !== 403) return false;
  if (res.headers.get('retry-after')) return true;
  if (res.headers.get('x-ratelimit-remaining') === '0') return true;
  const body = (await res.clone().text().catch(() => '')).toLowerCase();
  return body.includes('rate limit') || body.includes('abuse');
}

function rateLimitWaitMs(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get('retry-after'));
  if (!Number.isNaN(retryAfter) && retryAfter > 0) return retryAfter * 1000 + 1000;

  const reset = Number(res.headers.get('x-ratelimit-reset'));
  if (res.headers.get('x-ratelimit-remaining') === '0' && reset > 0) {
    return Math.max(0, reset * 1000 - Date.now()) + 2000;
  }
  // Secondary limits usually clear within a minute; back off progressively.
  return Math.min(60_000 * attempt, 180_000);
}

/**
 * Same as ghFetch, but waits and retries on GitHub rate limits (429 / secondary 403)
 * and transient 5xx errors instead of failing the whole upload.
 */
async function ghFetchRetry(
  endpoint: string,
  token: string,
  options: RequestInit = {},
  onWait?: (waitMs: number) => void
): Promise<Response> {
  const MAX_ATTEMPTS = 8;
  for (let attempt = 1; ; attempt++) {
    const res = await ghFetch(endpoint, token, options);
    if (res.ok || attempt >= MAX_ATTEMPTS) return res;

    const limited = await isRateLimited(res);
    const transient = res.status >= 500;
    if (!limited && !transient) return res;

    const waitMs = limited ? rateLimitWaitMs(res, attempt) : Math.min(2000 * 2 ** attempt, 60_000);
    if (waitMs > MAX_RATE_LIMIT_WAIT_MS) return res;

    onWait?.(waitMs);
    await sleep(waitMs);
  }
}

// Text files go inline in tree requests (no per-file blob call). Keeps GitHub API usage low.
const TREE_CHUNK_MAX_ITEMS = 100;
const TREE_CHUNK_MAX_BYTES = 4 * 1024 * 1024;

function asSafeText(file: ExtractedFile): string | null {
  if (file.isBinary) return null;
  const text = file.content.toString('utf8');
  return Buffer.from(text, 'utf8').equals(file.content) ? text : null;
}

export async function pushExtractedFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: ExtractedFile[],
  commitMessage: string,
  onProgress?: (message: string, percent: number) => void
): Promise<{ commitSha: string; commitUrl: string; totalFiles: number }> {
  let lastPercent = 10;
  const notify = (message: string, percent: number) => {
    lastPercent = percent;
    onProgress?.(message, percent);
  };
  const onWait = (waitMs: number) => {
    notify(`GitHub rate limit reached. Pausing ${Math.ceil(waitMs / 1000)}s, then continuing automatically...`, lastPercent);
  };

  notify('Fetching repository branch state...', 10);

  // 1. Find the current branch head (if any)
  let parentCommitSha: string | null = null;
  let baseTreeSha: string | null = null;

  const branchRes = await ghFetchRetry(`/repos/${owner}/${repo}/branches/${branch}`, token, {}, onWait);
  if (branchRes.ok) {
    const branchData = await branchRes.json();
    parentCommitSha = branchData.commit?.sha || null;
    baseTreeSha = branchData.commit?.commit?.tree?.sha || null;
  } else {
    const repoInfo = await getRepository(token, owner, repo);
    const defaultBranchRes = await ghFetchRetry(`/repos/${owner}/${repo}/branches/${repoInfo.default_branch}`, token, {}, onWait);
    if (defaultBranchRes.ok) {
      const defaultData = await defaultBranchRes.json();
      parentCommitSha = defaultData.commit?.sha || null;
      baseTreeSha = defaultData.commit?.commit?.tree?.sha || null;
    }
  }

  // 2. Upload only binary files as blobs (sequentially, to stay under secondary limits)
  const binaryFiles = files.filter((f) => asSafeText(f) === null);
  const textFiles = files.filter((f) => asSafeText(f) !== null);

  notify(`Uploading ${binaryFiles.length} binary files...`, 15);
  const treeItems: Array<{ path: string; mode: string; type: 'blob'; sha?: string; content?: string }> = [];

  for (let i = 0; i < binaryFiles.length; i++) {
    const file = binaryFiles[i];
    const blobRes = await ghFetchRetry(
      `/repos/${owner}/${repo}/git/blobs`,
      token,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: file.content.toString('base64'), encoding: 'base64' }),
      },
      onWait
    );
    if (!blobRes.ok) {
      const err = await blobRes.json().catch(() => ({}));
      throw new Error(`Failed to upload ${file.path}: ${err.message || blobRes.statusText}`);
    }
    const blobData = await blobRes.json();
    treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: blobData.sha });
    notify(`Uploaded binary file ${i + 1} of ${binaryFiles.length}...`, 15 + Math.floor(((i + 1) / Math.max(binaryFiles.length, 1)) * 15));
  }

  for (const file of textFiles) {
    treeItems.push({ path: file.path, mode: '100644', type: 'blob', content: asSafeText(file)! });
  }

  // 3. Build the Git tree in chunks, chaining base_tree so earlier chunks are kept
  notify(`Building Git tree for ${files.length} files...`, 35);
  let currentTreeSha: string | null = baseTreeSha;
  let chunk: typeof treeItems = [];
  let chunkBytes = 0;
  let written = 0;

  const flushChunk = async () => {
    if (chunk.length === 0) return;
    const payload: any = { tree: chunk };
    if (currentTreeSha) payload.base_tree = currentTreeSha;

    const treeRes = await ghFetchRetry(
      `/repos/${owner}/${repo}/git/trees`,
      token,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      onWait
    );
    if (!treeRes.ok) {
      const err = await treeRes.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create Git tree');
    }
    currentTreeSha = (await treeRes.json()).sha;
    written += chunk.length;
    chunk = [];
    chunkBytes = 0;
    notify(
      `Uploaded ${written} of ${treeItems.length} files...`,
      35 + Math.floor((written / Math.max(treeItems.length, 1)) * 40)
    );
  };

  for (const item of treeItems) {
    const size = item.content ? Buffer.byteLength(item.content) : 0;
    if (chunk.length >= TREE_CHUNK_MAX_ITEMS || chunkBytes + size > TREE_CHUNK_MAX_BYTES) {
      await flushChunk();
    }
    chunk.push(item);
    chunkBytes += size;
  }
  await flushChunk();

  if (!currentTreeSha) {
    throw new Error('No files to commit');
  }
  const newTreeSha = currentTreeSha as string;

  // 4. Create commit
  notify('Creating commit on Git history...', 85);
  const commitRes = await ghFetchRetry(
    `/repos/${owner}/${repo}/git/commits`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: commitMessage || 'Initial commit pushed via Zip2Repo',
        tree: newTreeSha,
        parents: parentCommitSha ? [parentCommitSha] : [],
      }),
    },
    onWait
  );
  if (!commitRes.ok) {
    const err = await commitRes.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create Git commit');
  }
  const newCommitSha = (await commitRes.json()).sha;

  // 5. Update branch ref, or create it if missing
  notify(`Updating branch "${branch}"...`, 92);
  let refRes = await ghFetchRetry(
    `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    token,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: newCommitSha, force: true }),
    },
    onWait
  );

  if (!refRes.ok) {
    refRes = await ghFetchRetry(
      `/repos/${owner}/${repo}/git/refs`,
      token,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: newCommitSha }),
      },
      onWait
    );
    if (!refRes.ok) {
      const err = await refRes.json().catch(() => ({}));
      throw new Error(err.message || `Failed to update branch ${branch} reference`);
    }
  }

  notify('Repository successfully updated and verified!', 100);

  return {
    commitSha: newCommitSha,
    commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommitSha}`,
    totalFiles: files.length,
  };
}
