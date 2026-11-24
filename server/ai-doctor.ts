/**
 * AI Doctor: a chat assistant that does GitHub work for the user.
 * The user says what they want in plain language. Gemini chooses the tools and runs them.
 * Anything destructive (delete, rename, visibility, archive, merge, delete file/branch)
 * only runs after the user presses Confirm in the chat.
 */

import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { createHash } from 'crypto';
import * as ghService from './github-service.js';
import { activityStore } from './activity-store.js';
import { blockedBySettings, getPermissions } from './access.js';

// ---------- Types ----------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolInvocations?: ToolInvocation[];
}

export interface ToolInvocation {
  name: string;
  args: Record<string, any>;
  result?: any;
  status: 'running' | 'success' | 'failed' | 'requires_confirmation' | 'cancelled';
}

export interface Conversation {
  id: string;
  /** Who owns this chat: a hash of the GitHub token, or 'anon' without one. Never shown to clients. */
  ownerKey: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  /** Short log of what the AI already did in this chat, fed back into the prompt. */
  recentActions: string[];
  /** The repository the chat is focused on (last one the user tagged with @). */
  focusRepo?: string | null;
}

/** Stable, non-reversible owner key derived from the GitHub token. */
export function ownerKeyOf(token?: string | null): string {
  return token ? `gh:${createHash('sha256').update(token).digest('hex')}` : 'anon';
}

// ---------- Conversations (in memory) ----------

const conversations = new Map<string, Conversation>();

/** Returns the caller's chat with this id, or creates one. Another owner's chat is never returned. */
export function getOrCreateConversation(id: string | undefined, ownerKey: string): Conversation {
  if (id) {
    const existing = conversations.get(id);
    if (existing && existing.ownerKey === ownerKey) return existing;
  }

  const newId =
    id && !conversations.has(id) ? id : `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const conv: Conversation = {
    id: newId,
    ownerKey,
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
    recentActions: [],
    focusRepo: null,
  };
  conversations.set(newId, conv);
  return conv;
}

/** The caller's chat with this id, or null. Never creates or exposes another owner's chat. */
export function getConversation(id: string, ownerKey: string): Conversation | null {
  const conv = conversations.get(id);
  return conv && conv.ownerKey === ownerKey ? conv : null;
}

export function listConversations(ownerKey: string): Array<{ id: string; title: string; updatedAt: string; messageCount: number }> {
  return Array.from(conversations.values())
    .filter((c) => c.ownerKey === ownerKey)
    .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: c.messages.length }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/** Sets or clears the repo a chat is focused on. */
export function setFocusRepo(id: string, repo: string | null, ownerKey: string): boolean {
  const conv = getConversation(id, ownerKey);
  if (!conv) return false;
  conv.focusRepo = repo;
  conv.updatedAt = new Date().toISOString();
  return true;
}

/** Pulls owner/repo references the user tagged with @ (e.g. @octocat/hello-world). */
export function parseRepoMentions(text: string): string[] {
  const found = [...text.matchAll(/(?:^|\s)@([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)/g)].map((m) => m[1]);
  return [...new Set(found)];
}

export function renameConversation(id: string, newTitle: string, ownerKey: string): boolean {
  const conv = getConversation(id, ownerKey);
  if (!conv) return false;
  conv.title = newTitle;
  conv.updatedAt = new Date().toISOString();
  return true;
}

export function deleteConversation(id: string, ownerKey: string): boolean {
  if (!getConversation(id, ownerKey)) return false;
  return conversations.delete(id);
}

function pushMessage(conv: Conversation, msg: ChatMessage) {
  conv.messages.push(msg);
  conv.updatedAt = msg.timestamp;
}

// ---------- Pending actions (waiting for a Confirm click) ----------

interface PendingAction {
  id: string;
  ownerKey: string;
  owner: string;
  title: string;
  description: string;
  confirmLabel: string;
  danger: boolean;
  conversationId: string;
  createdAt: number;
  run: (token: string) => Promise<string>;
}

const pendingActions = new Map<string, PendingAction>();
const ACTION_TTL_MS = 30 * 60 * 1000;

function prunePendingActions() {
  const now = Date.now();
  for (const [id, a] of pendingActions) {
    if (now - a.createdAt > ACTION_TTL_MS) pendingActions.delete(id);
  }
}

/** Stores a destructive step and returns the card the user must confirm. */
function requireConfirmation(
  conv: Conversation,
  toolName: string,
  args: Record<string, any>,
  card: { owner: string; title: string; description: string; confirmLabel: string; danger: boolean },
  run: (token: string) => Promise<string>
): ToolInvocation {
  prunePendingActions();
  const action: PendingAction = {
    ...card,
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ownerKey: conv.ownerKey,
    conversationId: conv.id,
    createdAt: Date.now(),
    run,
  };
  pendingActions.set(action.id, action);
  return {
    name: toolName,
    args,
    status: 'requires_confirmation',
    result: {
      action: {
        id: action.id,
        title: action.title,
        description: action.description,
        confirmLabel: action.confirmLabel,
        danger: action.danger,
      },
    },
  };
}

function findInvocation(conv: Conversation, actionId: string): ToolInvocation | null {
  for (const msg of conv.messages) {
    const inv = msg.toolInvocations?.find((t) => t.result?.action?.id === actionId);
    if (inv) return inv;
  }
  return null;
}

/** Called by the Confirm button. Runs the destructive step only after an explicit click. */
export async function confirmPendingAction(actionId: string, token: string | undefined): Promise<ChatMessage> {
  prunePendingActions();
  const action = pendingActions.get(actionId);
  if (!action) throw Object.assign(new Error('This action expired. Please ask again.'), { status: 404 });
  if (!token) throw Object.assign(new Error('Connect your GitHub account first.'), { status: 401 });
  if (action.ownerKey !== ownerKeyOf(token)) {
    throw Object.assign(new Error('This action belongs to another account.'), { status: 403 });
  }

  const me = await ghService.getAccount(token);
  if (me.login !== action.owner) {
    throw Object.assign(new Error(`This action belongs to @${action.owner}, but you are signed in as @${me.login}.`), { status: 403 });
  }

  pendingActions.delete(actionId);
  const conv = conversations.get(action.conversationId);
  const inv = conv ? findInvocation(conv, actionId) : null;

  let content: string;
  let status: 'success' | 'failed' = 'success';
  try {
    content = await action.run(token);
  } catch (err: any) {
    status = 'failed';
    content = `Could not complete this: ${err.message || 'GitHub request failed'}.`;
  }

  if (inv) {
    inv.status = status;
    inv.result = { ...inv.result, done: true };
  }
  const reply: ChatMessage = { id: `msg-${Date.now()}-ai`, role: 'assistant', content, timestamp: new Date().toISOString() };
  if (conv) {
    pushMessage(conv, reply);
    conv.recentActions.push(`${action.title} (${action.owner}): ${status}`);
  }
  return reply;
}

/** Called by the Cancel button. */
export function cancelPendingAction(actionId: string, token: string | undefined): boolean {
  const action = pendingActions.get(actionId);
  if (!action || action.ownerKey !== ownerKeyOf(token)) return false;
  pendingActions.delete(actionId);
  const conv = conversations.get(action.conversationId);
  const inv = conv && findInvocation(conv, actionId);
  if (inv) {
    inv.status = 'cancelled';
    inv.result = { ...inv.result, done: true };
  }
  return true;
}

// ---------- Gemini key rotation ----------
// GEMINI_API_KEY_1, GEMINI_API_KEY_2, ... (numeric order), GEMINI_API_KEYS pool, or GEMINI_API_KEY.

const keyCooldownUntil = new Map<string, number>();
let keyCursor = 0;

function getGeminiKeys(): string[] {
  const numbered = Object.entries(process.env)
    .filter(([name, value]) => /^GEMINI_API_KEY_\d+$/.test(name) && !!value?.trim())
    .sort(([a], [b]) => Number(a.match(/\d+$/)?.[0]) - Number(b.match(/\d+$/)?.[0]))
    .map(([, value]) => value!.trim());
  const pooled = (process.env.GEMINI_API_KEYS || '')
    .split(/[\s,;]+/).map((key) => key.trim().replace(/^["'`]+|["'`]+$/g, '')).filter(Boolean);
  const single = process.env.GEMINI_API_KEY?.trim();
  return [...new Set([...numbered, ...pooled, ...(single ? [single] : [])])];
}

function errorStatus(err: any): number {
  return Number(err?.status || err?.code || err?.error?.code || 0);
}

function isQuotaError(err: any): boolean {
  const msg = String(err?.message || err?.error?.message || '');
  return errorStatus(err) === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit|429/i.test(msg);
}

function cooldownFor(err: any): number {
  const msg = String(err?.message || '');
  if (/per.?day|daily/i.test(msg)) return 60 * 60 * 1000;
  if (isQuotaError(err)) return 60 * 1000;
  return 20 * 1000;
}

const GEMINI_TIMEOUT_MS = 45_000; // a stuck request moves on to the next key instead of hanging
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.5-flash-lite,gemini-2.5-flash-lite')
  .split(/[\s,;]+/).map((model) => model.trim()).filter(Boolean);

function modelSequence(): string[] {
  return [...new Set([GEMINI_MODEL, ...FALLBACK_MODELS])];
}

/**
 * Try every configured key/model combination, rotating keys on key-specific errors
 * and falling back to another stable model when Gemini is temporarily overloaded.
 */
async function callGemini<T>(run: (ai: GoogleGenAI, model: string) => Promise<T>): Promise<T> {
  const keys = getGeminiKeys();
  if (!keys.length) throw Object.assign(new Error('NO_GEMINI_KEY'), { code: 'NO_GEMINI_KEY' });

  let lastErr: any = null;
  const now = Date.now();
  let attempted = 0;

  for (const model of modelSequence()) {
    for (let offset = 0; offset < keys.length; offset++) {
      const idx = (keyCursor + offset) % keys.length;
      const key = keys[idx];
      if ((keyCooldownUntil.get(key) || 0) > now) continue;
      attempted++;
      try {
        const result = await run(new GoogleGenAI({ apiKey: key, httpOptions: { timeout: GEMINI_TIMEOUT_MS } }), model);
        keyCursor = (idx + 1) % keys.length;
        keyCooldownUntil.delete(key);
        return result;
      } catch (err: any) {
        lastErr = err;
        const status = errorStatus(err);
        const message = String(err?.message || err?.error?.message || '');
        // Per-key errors: quota and invalid credentials.
        if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(message)) {
          keyCooldownUntil.set(key, Date.now() + cooldownFor(err));
        } else if (status === 401 || status === 403 || /API key|permission|unauthorized|forbidden/i.test(message)) {
          keyCooldownUntil.set(key, Date.now() + 10 * 60 * 1000);
        } else if (!status && /ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(message)) {
          keyCooldownUntil.set(key, Date.now() + 15 * 1000);
        }
        // A 5xx is model-wide pressure, not a bad key: skip the other keys for this model.
        if (status >= 500 && status !== 501) break;
      }
    }
  }

  if (attempted === 0) {
    throw Object.assign(new Error('ALL_KEYS_COOLDOWN'), { code: 'ALL_KEYS_COOLDOWN' });
  }
  throw lastErr || Object.assign(new Error('ALL_KEYS_FAILED'), { code: 'ALL_KEYS_FAILED' });
}


// ---------- Tool declarations ----------

const str = (description: string) => ({ type: Type.STRING, description });
const bool = (description: string) => ({ type: Type.BOOLEAN, description });
const int = (description: string) => ({ type: Type.INTEGER, description });
const strList = (description: string) => ({ type: Type.ARRAY, items: { type: Type.STRING }, description });

const OWNER = str('Owner account or organization. Leave empty to use the connected account.');
const REPO = str('Repository name, without the owner.');

const decl = (name: string, description: string, properties: Record<string, any> = {}, required: string[] = []): FunctionDeclaration => ({
  name,
  description,
  parameters: { type: Type.OBJECT, properties, required },
});

const tools: FunctionDeclaration[] = [
  // Account
  decl('get_account', 'Get the connected GitHub account: login, name, bio, plan, and repository counts.'),
  decl('update_profile', 'Change the connected account profile: name, bio, company, location, website, or X/Twitter username. Empty string clears a field.', {
    name: str('Display name'),
    bio: str('Short bio'),
    company: str('Company'),
    location: str('Location'),
    blog: str('Website URL'),
    twitter_username: str('X/Twitter username without @'),
  }),

  // Repositories
  decl('list_repositories', "List the connected account's repositories, most recently updated first.", {
    limit: int('How many to return, 1 to 50. Default 15.'),
  }),
  decl('get_repository_details', 'Get full details of one repository: description, visibility, default branch, topics, settings, and URL.', {
    owner: OWNER,
    repo: REPO,
  }, ['repo']),
  decl('create_repository', 'Create a new repository on the connected account. Names keep capitals and turn spaces into dashes.', {
    name: str('Repository name'),
    description: str('Short description'),
    is_private: bool('Private repository. Defaults to private.'),
    auto_init: bool('Create with a README. Defaults to true.'),
    gitignore_template: str('Optional .gitignore template, for example Node or Python'),
    license_template: str('Optional license key, for example mit or apache-2.0'),
  }, ['name']),
  decl('update_repository_settings', 'Change repository details and settings. Use this for description, homepage, default branch, features (issues, wiki, discussions, projects), merge options, and template flag. Does not rename, change visibility, or archive; use those tools.', {
    owner: OWNER,
    repo: REPO,
    description: str('Description'),
    homepage: str('Homepage URL'),
    default_branch: str('Default branch name'),
    has_issues: bool('Enable issues'),
    has_wiki: bool('Enable wiki'),
    has_discussions: bool('Enable discussions'),
    has_projects: bool('Enable projects'),
    is_template: bool('Mark as a template repository'),
    allow_squash_merge: bool('Allow squash merging'),
    allow_merge_commit: bool('Allow merge commits'),
    allow_rebase_merge: bool('Allow rebase merging'),
    delete_branch_on_merge: bool('Delete head branches after merge'),
  }, ['repo']),
  decl('set_repository_topics', 'Replace the topics (tags) of a repository. Topics are lowercase words with dashes.', {
    owner: OWNER,
    repo: REPO,
    topics: strList('The complete list of topics'),
  }, ['repo', 'topics']),
  decl('star_repository', 'Star or unstar a repository for the connected account.', {
    owner: OWNER,
    repo: REPO,
    starred: bool('true to star, false to unstar'),
  }, ['repo', 'starred']),
  decl('rename_repository', 'Rename a repository. The user must press Confirm.', {
    owner: OWNER,
    repo: REPO,
    new_name: str('New repository name'),
  }, ['repo', 'new_name']),
  decl('update_visibility', 'Make a repository private or public. The user must press Confirm.', {
    owner: OWNER,
    repo: REPO,
    is_private: bool('true for private, false for public'),
  }, ['repo', 'is_private']),
  decl('set_archived', 'Archive or unarchive a repository. The user must press Confirm.', {
    owner: OWNER,
    repo: REPO,
    archived: bool('true to archive, false to unarchive'),
  }, ['repo', 'archived']),
  decl('delete_repository', 'Permanently delete one repository. The user must press Confirm. Only ever one repository per request.', {
    owner: OWNER,
    repo: REPO,
  }, ['repo']),

  // Branches and commits
  decl('list_branches', 'List branches of a repository.', { owner: OWNER, repo: REPO }, ['repo']),
  decl('create_branch', 'Create a branch from another branch (default: the default branch).', {
    owner: OWNER,
    repo: REPO,
    branch: str('New branch name'),
    from_branch: str('Branch to start from'),
  }, ['repo', 'branch']),
  decl('delete_branch', 'Delete a branch. The user must press Confirm.', {
    owner: OWNER,
    repo: REPO,
    branch: str('Branch name'),
  }, ['repo', 'branch']),
  decl('list_commits', 'List recent commits on a branch.', {
    owner: OWNER,
    repo: REPO,
    branch: str('Branch name, default branch if empty'),
    limit: int('How many, 1 to 50. Default 10.'),
  }, ['repo']),

  // Issues
  decl('list_issues', 'List issues of a repository.', {
    owner: OWNER,
    repo: REPO,
    state: str('open, closed, or all. Default open.'),
    limit: int('How many, 1 to 50. Default 20.'),
  }, ['repo']),
  decl('create_issue', 'Open a new issue.', {
    owner: OWNER,
    repo: REPO,
    title: str('Issue title'),
    body: str('Issue body in Markdown'),
    labels: strList('Label names'),
    assignees: strList('GitHub usernames'),
  }, ['repo', 'title']),
  decl('update_issue', 'Change an issue: title, body, open/closed state, labels, or assignees.', {
    owner: OWNER,
    repo: REPO,
    number: int('Issue number'),
    title: str('New title'),
    body: str('New body'),
    state: str('open or closed'),
    labels: strList('Replacement label list'),
    assignees: strList('Replacement assignee list'),
  }, ['repo', 'number']),
  decl('comment_on_issue', 'Add a comment to an issue or pull request.', {
    owner: OWNER,
    repo: REPO,
    number: int('Issue or pull request number'),
    body: str('Comment in Markdown'),
  }, ['repo', 'number', 'body']),

  // Pull requests
  decl('list_pull_requests', 'List pull requests of a repository.', {
    owner: OWNER,
    repo: REPO,
    state: str('open, closed, or all. Default open.'),
    limit: int('How many, 1 to 50. Default 20.'),
  }, ['repo']),
  decl('create_pull_request', 'Open a pull request from one branch into another.', {
    owner: OWNER,
    repo: REPO,
    title: str('Title'),
    head: str('Branch with the changes'),
    base: str('Branch to merge into'),
    body: str('Description in Markdown'),
    draft: bool('Open as a draft'),
  }, ['repo', 'title', 'head', 'base']),
  decl('merge_pull_request', 'Merge a pull request. The user must press Confirm.', {
    owner: OWNER,
    repo: REPO,
    number: int('Pull request number'),
    merge_method: str('merge, squash, or rebase. Default merge.'),
  }, ['repo', 'number']),

  // Releases
  decl('create_release', 'Publish a release with a tag.', {
    owner: OWNER,
    repo: REPO,
    tag_name: str('Tag, for example v1.0.0'),
    name: str('Release title'),
    body: str('Release notes in Markdown'),
    target_commitish: str('Branch or commit to tag. Default branch if empty.'),
    draft: bool('Save as draft'),
    prerelease: bool('Mark as pre-release'),
  }, ['repo', 'tag_name']),

  // Files
  decl('list_files', 'List files and folders at a path in a repository.', {
    owner: OWNER,
    repo: REPO,
    path: str('Folder path, empty for the root'),
    branch: str('Branch name'),
  }, ['repo']),
  decl('read_file', 'Read a text file from a repository (first 8000 characters).', {
    owner: OWNER,
    repo: REPO,
    file_path: str('Path of the file'),
    branch: str('Branch name'),
  }, ['repo', 'file_path']),
  decl('write_file', 'Create a file, or replace an existing file, with a commit.', {
    owner: OWNER,
    repo: REPO,
    file_path: str('Path of the file'),
    content: str('Full new content of the file'),
    commit_message: str('Commit message'),
    branch: str('Branch name, default branch if empty'),
  }, ['repo', 'file_path', 'content', 'commit_message']),
  decl('delete_file', 'Delete a file with a commit. The user must press Confirm.', {
    owner: OWNER,
    repo: REPO,
    file_path: str('Path of the file'),
    commit_message: str('Commit message'),
    branch: str('Branch name'),
  }, ['repo', 'file_path', 'commit_message']),

  // Ignore rules
  decl('add_gitignore', 'Add a .gitignore to a repository that has none, using one of GitHub\'s templates. Fails if the repository already has a .gitignore.', {
    owner: OWNER,
    repo: REPO,
    template: str('GitHub template name, for example Node, Python, Go, or Java'),
    branch: str('Branch name, default branch if empty'),
  }, ['repo', 'template']),
];

// ---------- System prompt with account awareness ----------

async function buildSystemPrompt(token: string | undefined, conv: Conversation, mentions: string[]): Promise<string> {
  let accountBlock: string;
  if (!token) {
    accountBlock = 'GitHub: NOT connected. GitHub tools will fail. If the user asks for GitHub work, tell them to connect GitHub in the top bar.';
  } else {
    try {
      const a = await ghService.getAccount(token);
      accountBlock = [
        `Connected account: @${a.login}${a.name ? ` (${a.name})` : ''}.`,
        `Bio: ${a.bio || 'none'}. Company: ${a.company || 'none'}. Location: ${a.location || 'none'}.`,
        `Public repos: ${a.public_repos}. Private repos: ${a.owned_private_repos ?? 'unknown'}. Plan: ${a.plan || 'unknown'}.`,
        `Profile: ${a.html_url}. Account created: ${a.created_at.slice(0, 10)}.`,
        `"Me", "my", and "I" always mean @${a.login}. Use this login as the owner for every repository tool unless the user names another owner.`,
      ].join('\n');
    } catch (err: any) {
      accountBlock = `GitHub token problem: ${err.message}. Tell the user to reconnect GitHub.`;
    }
  }

  const focusBlock = conv.focusRepo
    ? `Focus repository for this chat: ${conv.focusRepo}. When the user says "it", "this repo", or "the repo" without naming one, they mean this one.`
    : 'Focus repository for this chat: none.';
  const mentionBlock = mentions.length
    ? `The user tagged these repositories with @ in their latest message: ${mentions.join(', ')}. Treat them as the exact target. Do not guess other repositories.`
    : '';

  const recent = conv.recentActions.slice(-15);
  const recentBlock = recent.length ? recent.map((a) => `- ${a}`).join('\n') : 'None yet.';

  return `You are AI Doctor, the GitHub assistant inside Zip2Repo.
Identity: always introduce yourself as AI Doctor by Zip2Repo. Never say you were made by any other company or name the model provider. If asked which model or company runs you, say you are AI Doctor by Zip2Repo and cannot share details about the underlying technology. Never deny being an AI.

Current time (server): ${new Date().toISOString()}

${accountBlock}

${focusBlock}
${mentionBlock}

Actions already taken in this chat:
${recentBlock}

How you work:
- The user tells you what they want in plain words. You do the work with your tools. Never tell the user to open GitHub or run commands themselves.
- Chain tools as needed. For example, to change a file, read it first, then write it. Check results before you answer.
- Only ask a question when the request really cannot be done without an answer, such as a missing repository name when several match. Ask one short question.
- Turn names into valid GitHub names: letters, numbers, dashes, dots, underscores. Spaces become dashes. Keep capitals as the user typed them.
- Delete, rename, visibility, archive, merge, delete branch, and delete file tools show a Confirm card to the user. After calling one, say in one short sentence what you prepared and that they should press Confirm.
- Never delete more than one repository per request. If asked to delete several, refuse and ask which single one.
- Be accurate: report what GitHub actually returned, including URLs. If a tool fails, say what failed and why, in plain words.
- Answer in short, plain sentences. Avoid headings. Use a short bullet list only for lists of repositories, issues, files, or branches.`;
}

// ---------- Tool execution ----------

type ToolOutcome = { result: any; status: ToolInvocation['status']; pending?: ToolInvocation };

const ok = (result: any): ToolOutcome => ({ result, status: 'success' });
const fail = (message: string): ToolOutcome => ({ result: { error: message }, status: 'failed' });

/** Turns a user-given name into a valid GitHub repo name, keeping its capitals. */
export function toRepoName(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

function splitRepo(args: Record<string, any>, defaultOwner: string): { owner: string; repo: string } {
  let owner = args.owner ? String(args.owner).trim() : '';
  let repo = String(args.repo || '').trim();
  if (repo.includes('/')) {
    const [o, r] = repo.split('/');
    owner = owner || o;
    repo = r;
  }
  return { owner: owner || defaultOwner, repo };
}

function logAction(title: string, description: string, status: 'success' | 'warning' = 'success') {
  activityStore.logActivity({ type: 'ai_action', title, description, status });
}

async function executeTool(name: string, args: Record<string, any>, token: string | undefined, conv: Conversation): Promise<ToolOutcome> {
  if (!token) return fail('GitHub is not connected. Ask the user to connect GitHub in the top bar.');

  const blocked = blockedBySettings(name, getPermissions(ownerKeyOf(token)));
  if (blocked) return fail(blocked);

  try {
    const me = await ghService.getAccount(token);
    const target = () => splitRepo(args, me.login);
    const need = (value: unknown, label: string): string => {
      if (value === undefined || value === null || value === '') throw new Error(`Missing ${label}.`);
      return String(value);
    };

    switch (name) {
      // ----- Account -----
      case 'get_account':
        return ok(me);

      case 'update_profile': {
        const fields: Record<string, unknown> = {};
        for (const key of ['name', 'bio', 'company', 'location', 'blog', 'twitter_username']) {
          if (args[key] !== undefined) fields[key] = args[key];
        }
        if (!Object.keys(fields).length) return fail('Nothing to change.');
        const updated = await ghService.updateProfile(token, fields);
        logAction('Updated profile', `@${me.login}: ${Object.keys(fields).join(', ')}`);
        return ok(updated);
      }

      // ----- Repositories -----
      case 'list_repositories': {
        const repos = await ghService.listUserRepositories(token, { perPage: Math.min(Number(args.limit) || 15, 50) });
        return ok({
          count: repos.length,
          repositories: repos.map((r) => ({
            name: r.name,
            private: r.private,
            description: r.description,
            default_branch: r.default_branch,
            url: r.html_url,
          })),
        });
      }

      case 'get_repository_details': {
        const { owner, repo } = target();
        need(repo, 'repository name');
        const r = await ghService.getRepositoryFull(token, owner, repo);
        return ok({
          full_name: r.full_name,
          description: r.description,
          private: r.private,
          archived: r.archived,
          default_branch: r.default_branch,
          topics: r.topics || [],
          homepage: r.homepage,
          has_issues: r.has_issues,
          has_wiki: r.has_wiki,
          url: r.html_url,
        });
      }

      case 'create_repository': {
        const repoName = toRepoName(need(args.name, 'repository name'));
        if (!repoName) return fail('That name has no valid characters. Ask for another name.');
        const r = await ghService.createRepository(token, {
          name: repoName,
          description: args.description,
          isPrivate: args.is_private ?? true,
          autoInit: args.auto_init ?? true,
          gitignoreTemplate: args.gitignore_template,
          licenseTemplate: args.license_template,
        });
        logAction(`Created ${r.full_name}`, 'Created via AI Doctor.');
        return ok({ full_name: r.full_name, private: r.private, url: r.html_url });
      }

      case 'update_repository_settings': {
        const { owner, repo } = target();
        const allowed = [
          'description', 'homepage', 'default_branch', 'has_issues', 'has_wiki', 'has_discussions', 'has_projects',
          'is_template', 'allow_squash_merge', 'allow_merge_commit', 'allow_rebase_merge', 'delete_branch_on_merge',
        ];
        const patch: Record<string, unknown> = {};
        for (const key of allowed) if (args[key] !== undefined) patch[key] = args[key];
        if (!Object.keys(patch).length) return fail('Nothing to change.');
        const r = await ghService.updateRepository(token, owner, repo, patch);
        logAction(`Updated ${r.full_name}`, `Changed: ${Object.keys(patch).join(', ')}`);
        return ok({ full_name: r.full_name, description: r.description, url: r.html_url, changed: Object.keys(patch) });
      }

      case 'set_repository_topics': {
        const { owner, repo } = target();
        const names = (args.topics || []).map((t: string) => String(t).trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean);
        const saved = await ghService.setRepositoryTopics(token, owner, repo, names);
        logAction(`Topics on ${owner}/${repo}`, saved.join(', ') || 'cleared');
        return ok({ topics: saved });
      }

      case 'star_repository': {
        const { owner, repo } = target();
        await ghService.setStarred(token, owner, repo, !!args.starred);
        return ok({ repo: `${owner}/${repo}`, starred: !!args.starred });
      }

      case 'rename_repository': {
        const { owner, repo } = target();
        const newName = toRepoName(need(args.new_name, 'new name'));
        if (!newName) return fail('The new name has no valid characters.');
        return pendingOutcome(conv, name, args, {
          owner,
          title: 'Rename repository',
          description: `Rename ${owner}/${repo} to ${newName}.`,
          confirmLabel: 'Rename',
          danger: false,
        }, async (t) => {
          const r = await ghService.renameRepository(t, owner, repo, newName);
          logAction(`Renamed ${owner}/${repo}`, `Now ${r.full_name}`);
          return `Renamed to **${r.full_name}**.`;
        });
      }

      case 'update_visibility': {
        const { owner, repo } = target();
        const isPrivate = !!args.is_private;
        return pendingOutcome(conv, name, args, {
          owner,
          title: 'Change visibility',
          description: `Make ${owner}/${repo} ${isPrivate ? 'private' : 'public'}.${isPrivate ? '' : ' Anyone on the internet will be able to see its code.'}`,
          confirmLabel: isPrivate ? 'Make private' : 'Make public',
          danger: !isPrivate,
        }, async (t) => {
          const r = await ghService.updateRepoVisibility(t, owner, repo, isPrivate);
          logAction(`Changed visibility of ${r.full_name}`, `Now ${r.private ? 'private' : 'public'}.`);
          return `**${r.full_name}** is now **${r.private ? 'private' : 'public'}**.`;
        });
      }

      case 'set_archived': {
        const { owner, repo } = target();
        const archived = !!args.archived;
        return pendingOutcome(conv, name, args, {
          owner,
          title: archived ? 'Archive repository' : 'Unarchive repository',
          description: archived
            ? `Archive ${owner}/${repo}. It becomes read-only until someone unarchives it.`
            : `Unarchive ${owner}/${repo}. It becomes writable again.`,
          confirmLabel: archived ? 'Archive' : 'Unarchive',
          danger: false,
        }, async (t) => {
          const r = await ghService.setArchived(t, owner, repo, archived);
          logAction(`${archived ? 'Archived' : 'Unarchived'} ${r.full_name}`, 'Changed via AI Doctor.');
          return `**${r.full_name}** is now ${archived ? 'archived' : 'active'}.`;
        });
      }

      case 'delete_repository': {
        const { owner, repo } = target();
        need(repo, 'repository name');
        return pendingOutcome(conv, name, args, {
          owner,
          title: 'Delete repository',
          description: `Permanently delete ${owner}/${repo}, including all code, branches, issues, and history. This cannot be undone.`,
          confirmLabel: 'Delete permanently',
          danger: true,
        }, async (t) => {
          await ghService.deleteRepository(t, owner, repo);
          logAction(`Deleted ${owner}/${repo}`, 'Permanently deleted after confirmation.', 'warning');
          return `Deleted **${owner}/${repo}**.`;
        });
      }

      // ----- Branches and commits -----
      case 'list_branches': {
        const { owner, repo } = target();
        const branches = await ghService.listBranches(token, owner, repo);
        return ok({ count: branches.length, branches });
      }

      case 'create_branch': {
        const { owner, repo } = target();
        const branch = need(args.branch, 'branch name');
        await ghService.createBranch(token, owner, repo, String(branch), args.from_branch);
        logAction(`Created branch ${branch}`, `${owner}/${repo}`);
        return ok({ branch, repo: `${owner}/${repo}` });
      }

      case 'delete_branch': {
        const { owner, repo } = target();
        const branch = String(need(args.branch, 'branch name'));
        return pendingOutcome(conv, name, args, {
          owner,
          title: 'Delete branch',
          description: `Delete the branch ${branch} in ${owner}/${repo}. Commits stay in other branches if they are merged elsewhere.`,
          confirmLabel: 'Delete branch',
          danger: true,
        }, async (t) => {
          await ghService.deleteBranch(t, owner, repo, branch);
          logAction(`Deleted branch ${branch}`, `${owner}/${repo}`, 'warning');
          return `Deleted branch **${branch}** in **${owner}/${repo}**.`;
        });
      }

      case 'list_commits': {
        const { owner, repo } = target();
        const commits = await ghService.listCommits(token, owner, repo, { branch: args.branch, limit: Number(args.limit) || 10 });
        return ok({ count: commits.length, commits });
      }

      // ----- Issues -----
      case 'list_issues': {
        const { owner, repo } = target();
        const issues = await ghService.listIssues(token, owner, repo, { state: args.state, limit: Number(args.limit) || 20 });
        return ok({ count: issues.length, issues });
      }

      case 'create_issue': {
        const { owner, repo } = target();
        const issue = await ghService.createIssue(token, owner, repo, {
          title: need(args.title, 'issue title'),
          body: args.body,
          labels: args.labels,
          assignees: args.assignees,
        });
        logAction(`Opened issue #${issue.number}`, `${owner}/${repo}: ${issue.title}`);
        return ok({ number: issue.number, title: issue.title, url: issue.html_url });
      }

      case 'update_issue': {
        const { owner, repo } = target();
        const number = Number(need(args.number, 'issue number'));
        const fields: Record<string, unknown> = {};
        for (const key of ['title', 'body', 'state', 'labels', 'assignees']) if (args[key] !== undefined) fields[key] = args[key];
        if (!Object.keys(fields).length) return fail('Nothing to change.');
        const issue = await ghService.updateIssue(token, owner, repo, number, fields);
        logAction(`Updated issue #${number}`, `${owner}/${repo}`);
        return ok({ number: issue.number, title: issue.title, state: issue.state, url: issue.html_url });
      }

      case 'comment_on_issue': {
        const { owner, repo } = target();
        const number = Number(need(args.number, 'issue number'));
        const c = await ghService.commentOnIssue(token, owner, repo, number, String(need(args.body, 'comment')));
        logAction(`Commented on #${number}`, `${owner}/${repo}`);
        return ok({ url: c.html_url });
      }

      // ----- Pull requests -----
      case 'list_pull_requests': {
        const { owner, repo } = target();
        const prs = await ghService.listPullRequests(token, owner, repo, { state: args.state, limit: Number(args.limit) || 20 });
        return ok({ count: prs.length, pull_requests: prs });
      }

      case 'create_pull_request': {
        const { owner, repo } = target();
        const pr = await ghService.createPullRequest(token, owner, repo, {
          title: need(args.title, 'title'),
          head: need(args.head, 'head branch'),
          base: need(args.base, 'base branch'),
          body: args.body,
          draft: !!args.draft,
        });
        logAction(`Opened pull request #${pr.number}`, `${owner}/${repo}: ${pr.title}`);
        return ok({ number: pr.number, title: pr.title, url: pr.html_url });
      }

      case 'merge_pull_request': {
        const { owner, repo } = target();
        const number = Number(need(args.number, 'pull request number'));
        const method = ['merge', 'squash', 'rebase'].includes(args.merge_method) ? args.merge_method : 'merge';
        return pendingOutcome(conv, name, args, {
          owner,
          title: 'Merge pull request',
          description: `Merge pull request #${number} in ${owner}/${repo} using ${method}.`,
          confirmLabel: 'Merge',
          danger: false,
        }, async (t) => {
          await ghService.mergePullRequest(t, owner, repo, number, method);
          logAction(`Merged #${number}`, `${owner}/${repo} (${method})`);
          return `Merged pull request **#${number}** in **${owner}/${repo}**.`;
        });
      }

      // ----- Releases -----
      case 'create_release': {
        const { owner, repo } = target();
        const rel = await ghService.createRelease(token, owner, repo, {
          tag_name: need(args.tag_name, 'tag name'),
          name: args.name,
          body: args.body,
          target_commitish: args.target_commitish,
          draft: !!args.draft,
          prerelease: !!args.prerelease,
        });
        logAction(`Published release ${rel.tag_name}`, `${owner}/${repo}`);
        return ok({ tag: rel.tag_name, url: rel.html_url, draft: rel.draft });
      }

      // ----- Files -----
      case 'list_files': {
        const { owner, repo } = target();
        const files = await ghService.listRepoFiles(token, owner, repo, args.path || '');
        return ok({ files: files.map((f) => `${f.type === 'dir' ? '📁' : '📄'} ${f.path}`) });
      }

      case 'read_file': {
        const { owner, repo } = target();
        const f = await ghService.readFile(token, owner, repo, String(need(args.file_path, 'file path')), args.branch);
        return ok({ path: f.path, size: f.size, content: f.content.slice(0, 8000), truncated: f.content.length > 8000 });
      }

      case 'write_file': {
        const { owner, repo } = target();
        const path = String(need(args.file_path, 'file path'));
        const res = await ghService.writeFile(token, owner, repo, {
          path,
          content: String(args.content ?? ''),
          message: String(need(args.commit_message, 'commit message')),
          branch: args.branch,
        });
        logAction(`${res.created ? 'Created' : 'Updated'} ${path}`, `${owner}/${repo}`);
        return ok({ path, created: res.created, commit: res.commit });
      }

      case 'delete_file': {
        const { owner, repo } = target();
        const path = String(need(args.file_path, 'file path'));
        return pendingOutcome(conv, name, args, {
          owner,
          title: 'Delete file',
          description: `Delete ${path} from ${owner}/${repo} with a commit.`,
          confirmLabel: 'Delete file',
          danger: true,
        }, async (t) => {
          await ghService.deleteFile(t, owner, repo, { path, message: String(args.commit_message), branch: args.branch });
          logAction(`Deleted ${path}`, `${owner}/${repo}`, 'warning');
          return `Deleted **${path}** from **${owner}/${repo}**.`;
        });
      }

      case 'add_gitignore': {
        const { owner, repo } = target();
        const template = String(need(args.template, 'template name')).trim();
        const branch = args.branch || undefined;
        try {
          await ghService.readFile(token, owner, repo, '.gitignore', branch);
          return fail(`${owner}/${repo} already has a .gitignore. Use write_file to replace it.`);
        } catch (err: any) {
          if (!(err instanceof ghService.GitHubApiError) || err.status !== 404) throw err;
        }
        const source = await ghService.getGitignoreTemplate(token, template);
        await ghService.writeFile(token, owner, repo, {
          path: '.gitignore',
          content: source,
          message: `Add ${template} .gitignore`,
          branch,
        });
        logAction(`Added .gitignore to ${owner}/${repo}`, `GitHub ${template} template`);
        return ok({ repo: `${owner}/${repo}`, path: '.gitignore', template });
      }

      default:
        return fail(`Unknown tool ${name}`);
    }
  } catch (err: any) {
    return fail(err.message || 'Tool failed');
  }
}

/** Wraps a destructive step so the AI can only ask for it; the user's Confirm click runs it. */
function pendingOutcome(
  conv: Conversation,
  toolName: string,
  args: Record<string, any>,
  card: { owner: string; title: string; description: string; confirmLabel: string; danger: boolean },
  run: (token: string) => Promise<string>
): ToolOutcome {
  const pending = requireConfirmation(conv, toolName, args, card, run);
  return { result: { status: 'awaiting_user_confirmation' }, status: 'requires_confirmation', pending };
}

// ---------- Main entry ----------

const MAX_TOOL_ROUNDS = 8;

export async function processDoctorMessage(params: {
  conversationId?: string;
  userMessage: string;
  githubToken?: string;
}): Promise<ChatMessage> {
  const ownerKey = ownerKeyOf(params.githubToken || process.env.GITHUB_TOKEN);
  const conv = getOrCreateConversation(params.conversationId, ownerKey);
  const now = new Date().toISOString();

  pushMessage(conv, { id: `msg-${Date.now()}-user`, role: 'user', content: params.userMessage, timestamp: now });
  if (conv.title === 'New chat' && conv.messages.length >= 2) {
    const t = params.userMessage.trim();
    conv.title = t.length > 36 ? `${t.slice(0, 36)}...` : t;
  }

  const token = params.githubToken || process.env.GITHUB_TOKEN;

  // A tagged repo becomes the focus of the chat until another one is tagged or it is cleared.
  const mentions = parseRepoMentions(params.userMessage);
  if (mentions.length) conv.focusRepo = mentions[mentions.length - 1];

  // Recent history in Gemini's format. Gemini needs the conversation to start with a user turn.
  const contents: any[] = [];
  for (const m of conv.messages.slice(-12)) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += `\n${m.content}`;
    else contents.push({ role, parts: [{ text: m.content }] });
  }
  while (contents.length && contents[0].role !== 'user') contents.shift();

  const toolInvocations: ToolInvocation[] = [];
  let finalText = '';

  try {
    const systemInstruction = await buildSystemPrompt(token, conv, mentions);

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response: any = await callGemini((ai, model) =>
        ai.models.generateContent({
          model,
          contents,
          config: { systemInstruction, tools: [{ functionDeclarations: tools }] },
        })
      );

      const calls: any[] = response.functionCalls || [];
      if (calls.length === 0) {
        finalText = response.text || '';
        break;
      }

      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent);

      const responseParts: any[] = [];
      for (const call of calls) {
        const name = call.name || 'tool';
        const args = (call.args as Record<string, any>) || {};
        const outcome = await executeTool(name, args, token, conv);
        toolInvocations.push(outcome.pending ?? { name, args, result: outcome.result, status: outcome.status });
        conv.recentActions.push(`${name}: ${outcome.status === 'failed' ? `failed (${outcome.result?.error || 'error'})` : outcome.status}`);
        responseParts.push({ functionResponse: { name, response: { output: outcome.result } } });
      }
      contents.push({ role: 'user', parts: responseParts });
    }
    conv.recentActions = conv.recentActions.slice(-30);

    if (!finalText) {
      finalText = toolInvocations.some((t) => t.status === 'requires_confirmation')
        ? 'I have it ready. Press Confirm below to continue.'
        : 'Done.';
    }

    const reply: ChatMessage = {
      id: `msg-${Date.now()}-ai`,
      role: 'assistant',
      content: finalText,
      timestamp: new Date().toISOString(),
      toolInvocations: toolInvocations.length ? toolInvocations : undefined,
    };
    pushMessage(conv, reply);
    return reply;
  } catch (err: any) {
    let content: string;
    if (err?.code === 'NO_GEMINI_KEY') {
      content = 'AI Doctor is off. Add your Gemini key as `GEMINI_API_KEY_1` (or `GEMINI_API_KEYS`) on the server and restart.';
    } else if (err?.code === 'ALL_KEYS_BUSY' || err?.code === 'ALL_KEYS_COOLDOWN' || isQuotaError(err)) {
      content = 'All Gemini keys are at their limit right now. Please try again in a minute.';
    } else {
      console.error('[AI Doctor] Gemini request failed:', errorStatus(err) || '', err?.message || err);
      content = 'AI is unavailable right now. Please try again in a moment.';
    }
    const reply: ChatMessage = { id: `msg-${Date.now()}-ai`, role: 'assistant', content, timestamp: new Date().toISOString() };
    pushMessage(conv, reply);
    return reply;
  }
}
