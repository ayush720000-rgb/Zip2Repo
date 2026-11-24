import { ExtractedFile } from './zip-service.js';
import { createHash } from 'crypto';

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
    'User-Agent': 'Zip2Repo/1.0',
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
  options: { sort?: 'updated' | 'created'; direction?: 'desc' | 'asc'; perPage?: number; page?: number; type?: 'all' | 'owner' } = {}
): Promise<GitHubRepo[]> {
  const sort = options.sort || 'updated';
  const direction = options.direction || 'desc';
  const perPage = options.perPage || 30;
  const page = options.page || 1;
  const type = options.type || 'all';

  const res = await ghFetch(`/user/repos?sort=${sort}&direction=${direction}&per_page=${perPage}&page=${page}&type=${type}`, token);
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
    gitignoreTemplate?: string;
    licenseTemplate?: string;
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
      ...(params.gitignoreTemplate ? { gitignore_template: params.gitignoreTemplate } : {}),
      ...(params.licenseTemplate ? { license_template: params.licenseTemplate } : {}),
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const MAX_RATE_LIMIT_WAIT_MS = 10 * 60 * 1000;
const MIN_MUTATION_INTERVAL_MS = 1000;
let lastMutationAt = 0;

// Detect primary or secondary GitHub rate limits.
async function isRateLimited(res: Response): Promise<boolean> {
  if (res.status === 429) return true;
  if (res.status !== 403) return false;
  if (res.headers.get('retry-after')) return true;
  if (res.headers.get('x-ratelimit-remaining') === '0') return true;
  const body = (await res.clone().text().catch(() => '')).toLowerCase();
  return body.includes('rate limit') || body.includes('abuse') || body.includes('secondary rate limit');
}

function rateLimitWaitMs(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000 + 1000;

  const reset = Number(res.headers.get('x-ratelimit-reset'));
  if (res.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset) && reset > 0) {
    return Math.max(0, reset * 1000 - Date.now()) + 2000;
  }
  // Secondary rate limits without headers: wait at least 1 minute, then exponential backoff.
  return Math.min(60_000 * (2 ** (attempt - 1)), MAX_RATE_LIMIT_WAIT_MS);
}

/**
 * Retry only explicit rate-limit responses for mutations (GitHub rejects these requests).
 * Avoid replaying mutative requests after ambiguous 5xx responses, which can duplicate
 * commits, trees, blobs, or repository creation. Pace mutative requests at >=1s.
 */
async function ghFetchRetry(
  endpoint: string,
  token: string,
  options: RequestInit = {},
  onWait?: (waitMs: number) => void
): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
  const MAX_RATE_LIMIT_ATTEMPTS = 4;
  const MAX_TRANSIENT_ATTEMPTS = 3;

  for (let attempt = 1; ; attempt++) {
    if (isMutation) {
      const elapsed = Date.now() - lastMutationAt;
      if (elapsed < MIN_MUTATION_INTERVAL_MS) await sleep(MIN_MUTATION_INTERVAL_MS - elapsed);
      lastMutationAt = Date.now();
    }

    const res = await ghFetch(endpoint, token, options);
    if (res.ok) return res;

    const limited = await isRateLimited(res);
    if (limited) {
      if (attempt >= MAX_RATE_LIMIT_ATTEMPTS) return res;
      const waitMs = rateLimitWaitMs(res, attempt);
      if (waitMs > MAX_RATE_LIMIT_WAIT_MS) return res;
      onWait?.(waitMs);
      await sleep(waitMs);
      continue;
    }

    // Only retry safe non-mutating requests for temporary server errors.
    if (!isMutation && res.status >= 500 && attempt < MAX_TRANSIENT_ATTEMPTS) {
      const waitMs = Math.min(1000 * 2 ** attempt, 15_000);
      onWait?.(waitMs);
      await sleep(waitMs);
      continue;
    }
    return res;
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

// ============================================================================
// Full account and repository toolkit used by AI Doctor.
// Every call goes through ghFetchRetry (rate-limit aware) and throws a
// GitHubApiError carrying GitHub's own message, so the AI can explain it.
// ============================================================================

export class GitHubApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

function describeGhError(status: number, data: any): string {
  const base = data?.message || `GitHub request failed (HTTP ${status})`;
  const details: string[] = Array.isArray(data?.errors)
    ? data.errors
        .map((e: any) => e?.message || [e?.resource, e?.field, e?.code].filter(Boolean).join(' '))
        .filter(Boolean)
    : [];
  return details.length ? `${base} (${details.join('; ')})` : base;
}

async function gh<T = any>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await ghFetchRetry(path, token, init);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 300) };
    }
  }
  if (!res.ok) throw new GitHubApiError(describeGhError(res.status, data), res.status);
  return data as T;
}

/** Encodes each part of a path (keeps slashes between parts). */
const seg = (p: string) => p.split('/').map(encodeURIComponent).join('/');
const repoPath = (owner: string, repo: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

// ---------- Account ----------

export interface GitHubAccount {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  twitter_username: string | null;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  owned_private_repos: number | null;
  plan: string | null;
  created_at: string;
}

const accountCache = new Map<string, { at: number; account: GitHubAccount }>();
const ACCOUNT_TTL_MS = 2 * 60 * 1000;
const tokenKey = (token: string) => createHash('sha256').update(token).digest('hex');

export async function getAccount(token: string): Promise<GitHubAccount> {
  const key = tokenKey(token);
  const hit = accountCache.get(key);
  if (hit && Date.now() - hit.at < ACCOUNT_TTL_MS) return hit.account;

  const u = await gh<any>(token, 'GET', '/user');
  const account: GitHubAccount = {
    login: u.login,
    name: u.name ?? null,
    bio: u.bio ?? null,
    company: u.company ?? null,
    location: u.location ?? null,
    blog: u.blog ?? null,
    twitter_username: u.twitter_username ?? null,
    avatar_url: u.avatar_url,
    html_url: u.html_url,
    public_repos: u.public_repos ?? 0,
    owned_private_repos: u.owned_private_repos ?? null,
    plan: u.plan?.name ?? null,
    created_at: u.created_at,
  };
  accountCache.set(key, { at: Date.now(), account });
  return account;
}

export async function updateProfile(token: string, fields: Record<string, unknown>): Promise<GitHubAccount> {
  await gh(token, 'PATCH', '/user', fields);
  accountCache.delete(tokenKey(token));
  return getAccount(token);
}

// ---------- Repositories ----------

export async function getRepositoryFull(token: string, owner: string, repo: string): Promise<any> {
  return gh(token, 'GET', repoPath(owner, repo));
}

export async function updateRepository(token: string, owner: string, repo: string, patch: Record<string, unknown>): Promise<any> {
  return gh(token, 'PATCH', repoPath(owner, repo), patch);
}

export async function setRepositoryTopics(token: string, owner: string, repo: string, names: string[]): Promise<string[]> {
  const data = await gh<{ names: string[] }>(token, 'PUT', `${repoPath(owner, repo)}/topics`, { names });
  return data.names;
}

export async function setStarred(token: string, owner: string, repo: string, starred: boolean): Promise<void> {
  await gh(token, starred ? 'PUT' : 'DELETE', `/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
}

export async function setArchived(token: string, owner: string, repo: string, archived: boolean): Promise<any> {
  return gh(token, 'PATCH', repoPath(owner, repo), { archived });
}

// ---------- Branches and commits ----------

export async function listBranches(token: string, owner: string, repo: string): Promise<Array<{ name: string; protected: boolean }>> {
  const data = await gh<any[]>(token, 'GET', `${repoPath(owner, repo)}/branches?per_page=100`);
  return data.map((b) => ({ name: b.name, protected: !!b.protected }));
}

export async function createBranch(token: string, owner: string, repo: string, branch: string, fromBranch?: string) {
  const base = fromBranch || (await getRepositoryFull(token, owner, repo)).default_branch;
  const ref = await gh<any>(token, 'GET', `${repoPath(owner, repo)}/git/ref/heads/${seg(base)}`);
  return gh(token, 'POST', `${repoPath(owner, repo)}/git/refs`, { ref: `refs/heads/${branch}`, sha: ref.object.sha });
}

export async function deleteBranch(token: string, owner: string, repo: string, branch: string): Promise<void> {
  await gh(token, 'DELETE', `${repoPath(owner, repo)}/git/refs/heads/${seg(branch)}`);
}

export async function listCommits(token: string, owner: string, repo: string, opts: { branch?: string; limit?: number }) {
  const q = new URLSearchParams({ per_page: String(Math.min(opts.limit || 10, 50)) });
  if (opts.branch) q.set('sha', opts.branch);
  const data = await gh<any[]>(token, 'GET', `${repoPath(owner, repo)}/commits?${q}`);
  return data.map((c) => ({
    sha: String(c.sha).slice(0, 7),
    message: String(c.commit?.message || '').split('\n')[0],
    author: c.commit?.author?.name,
    date: c.commit?.author?.date,
  }));
}

// ---------- Issues and pull requests ----------

export async function listIssues(token: string, owner: string, repo: string, opts: { state?: string; limit?: number }) {
  const q = new URLSearchParams({ state: opts.state || 'open', per_page: String(Math.min(opts.limit || 20, 50)) });
  const data = await gh<any[]>(token, 'GET', `${repoPath(owner, repo)}/issues?${q}`);
  return data
    .filter((i) => !i.pull_request) // GitHub lists PRs as issues too
    .map((i) => ({ number: i.number, title: i.title, state: i.state, labels: (i.labels || []).map((l: any) => l.name), html_url: i.html_url }));
}

export async function createIssue(token: string, owner: string, repo: string, fields: Record<string, unknown>) {
  return gh(token, 'POST', `${repoPath(owner, repo)}/issues`, fields);
}

export async function updateIssue(token: string, owner: string, repo: string, number: number, fields: Record<string, unknown>) {
  return gh(token, 'PATCH', `${repoPath(owner, repo)}/issues/${number}`, fields);
}

export async function commentOnIssue(token: string, owner: string, repo: string, number: number, body: string) {
  return gh(token, 'POST', `${repoPath(owner, repo)}/issues/${number}/comments`, { body });
}

export async function listPullRequests(token: string, owner: string, repo: string, opts: { state?: string; limit?: number }) {
  const q = new URLSearchParams({ state: opts.state || 'open', per_page: String(Math.min(opts.limit || 20, 50)) });
  const data = await gh<any[]>(token, 'GET', `${repoPath(owner, repo)}/pulls?${q}`);
  return data.map((p) => ({ number: p.number, title: p.title, state: p.state, draft: p.draft, head: p.head?.ref, base: p.base?.ref, html_url: p.html_url }));
}

export async function createPullRequest(token: string, owner: string, repo: string, fields: Record<string, unknown>) {
  return gh(token, 'POST', `${repoPath(owner, repo)}/pulls`, fields);
}

export async function mergePullRequest(token: string, owner: string, repo: string, number: number, mergeMethod: string) {
  return gh(token, 'PUT', `${repoPath(owner, repo)}/pulls/${number}/merge`, { merge_method: mergeMethod });
}

// ---------- Releases ----------

export async function createRelease(token: string, owner: string, repo: string, fields: Record<string, unknown>) {
  return gh(token, 'POST', `${repoPath(owner, repo)}/releases`, fields);
}

// ---------- Files ----------

export async function readFile(token: string, owner: string, repo: string, path: string, ref?: string) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const data = await gh<any>(token, 'GET', `${repoPath(owner, repo)}/contents/${seg(path)}${q}`);
  if (Array.isArray(data) || data.type !== 'file') throw new Error(`${path} is a folder, not a file`);
  const text = Buffer.from(String(data.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
  return { path: data.path, sha: data.sha, size: data.size, content: text };
}

async function fileSha(token: string, owner: string, repo: string, path: string, ref?: string): Promise<string | undefined> {
  try {
    const f = await readFile(token, owner, repo, path, ref);
    return f.sha;
  } catch (err: any) {
    if (err instanceof GitHubApiError && err.status === 404) return undefined;
    throw err;
  }
}

export async function writeFile(
  token: string,
  owner: string,
  repo: string,
  p: { path: string; content: string; message: string; branch?: string }
): Promise<{ created: boolean; commit: string }> {
  const sha = await fileSha(token, owner, repo, p.path, p.branch);
  const data = await gh<any>(token, 'PUT', `${repoPath(owner, repo)}/contents/${seg(p.path)}`, {
    message: p.message,
    content: Buffer.from(p.content, 'utf8').toString('base64'),
    ...(sha ? { sha } : {}),
    ...(p.branch ? { branch: p.branch } : {}),
  });
  return { created: !sha, commit: String(data.commit?.sha || '').slice(0, 7) };
}

export async function deleteFile(
  token: string,
  owner: string,
  repo: string,
  p: { path: string; message: string; branch?: string }
): Promise<string> {
  const sha = await fileSha(token, owner, repo, p.path, p.branch);
  if (!sha) throw new Error(`${p.path} does not exist`);
  const data = await gh<any>(token, 'DELETE', `${repoPath(owner, repo)}/contents/${seg(p.path)}`, {
    message: p.message,
    sha,
    ...(p.branch ? { branch: p.branch } : {}),
  });
  return String(data?.commit?.sha || '').slice(0, 7);
}

/** Returns the text of one of GitHub's .gitignore templates, for example "Node" or "Python". */
export async function getGitignoreTemplate(token: string, name: string): Promise<string> {
  try {
    const data = await gh<{ source: string }>(token, 'GET', `/gitignore/templates/${encodeURIComponent(name)}`);
    return data.source;
  } catch (err: any) {
    if (err instanceof GitHubApiError && err.status === 404) {
      throw new Error(`No GitHub .gitignore template named "${name}". Try Node, Python, Go, or Java.`);
    }
    throw err;
  }
}
