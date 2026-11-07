/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import * as ghService from './github-service.js';
import * as renderService from './render-service.js';
import { activityStore } from './activity-store.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolInvocations?: Array<{
    name: string;
    args: Record<string, any>;
    result?: any;
    status: 'running' | 'success' | 'failed' | 'requires_confirmation' | 'cancelled';
  }>;
}

type ToolInvocation = NonNullable<ChatMessage['toolInvocations']>[number];

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

// ---------- Conversations (in-memory) ----------

const conversations: Map<string, Conversation> = new Map();
const WELCOME = 'Hi! I\'m AI Doctor. I can list, create, rename, or delete your repos, and check your projects.';

export function getOrCreateConversation(id?: string): Conversation {
  if (id && conversations.has(id)) return conversations.get(id)!;

  const newId = id || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const conv: Conversation = {
    id: newId,
    title: 'New chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [
      { id: `msg-${Date.now()}-welcome`, role: 'assistant', content: WELCOME, timestamp: new Date().toISOString() },
    ],
  };
  conversations.set(newId, conv);
  return conv;
}

export function listConversations(): Array<{ id: string; title: string; updatedAt: string; messageCount: number }> {
  return Array.from(conversations.values())
    .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: c.messages.length }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function renameConversation(id: string, newTitle: string): boolean {
  const conv = conversations.get(id);
  if (!conv) return false;
  conv.title = newTitle;
  conv.updatedAt = new Date().toISOString();
  return true;
}

export function deleteConversation(id: string): boolean {
  return conversations.delete(id);
}

// ---------- Pending actions (destructive GitHub tasks awaiting a button click) ----------

type ActionKind = 'delete_repo' | 'rename_repo' | 'set_visibility';

interface PendingAction {
  id: string;
  kind: ActionKind;
  owner: string;
  repo: string;
  newName?: string;
  isPrivate?: boolean;
  conversationId: string;
  createdAt: number;
}

const pendingActions = new Map<string, PendingAction>();
const ACTION_TTL_MS = 30 * 60 * 1000;

function prunePendingActions() {
  const now = Date.now();
  for (const [id, a] of pendingActions) {
    if (now - a.createdAt > ACTION_TTL_MS) pendingActions.delete(id);
  }
}

function describeAction(a: PendingAction): { title: string; description: string; confirmLabel: string; danger: boolean } {
  const full = `${a.owner}/${a.repo}`;
  switch (a.kind) {
    case 'delete_repo':
      return {
        title: 'Delete repository',
        description: `Permanently delete ${full}, including all code, branches, and history. This cannot be undone.`,
        confirmLabel: 'Delete permanently',
        danger: true,
      };
    case 'rename_repo':
      return {
        title: 'Rename repository',
        description: `Rename ${full} to ${a.newName}. Existing clone URLs will redirect, but update any hard-coded links.`,
        confirmLabel: 'Rename',
        danger: false,
      };
    case 'set_visibility':
      return {
        title: 'Change visibility',
        description: `Make ${full} ${a.isPrivate ? 'private' : 'public'}.${a.isPrivate ? '' : ' Anyone on the internet will be able to see its code.'}`,
        confirmLabel: a.isPrivate ? 'Make private' : 'Make public',
        danger: !a.isPrivate,
      };
  }
}

function createPendingAction(conv: Conversation, input: Omit<PendingAction, 'id' | 'createdAt' | 'conversationId'>): ToolInvocation {
  prunePendingActions();
  const action: PendingAction = {
    ...input,
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    conversationId: conv.id,
    createdAt: Date.now(),
  };
  pendingActions.set(action.id, action);
  const card = describeAction(action);
  const toolName = action.kind === 'delete_repo' ? 'delete_repository' : action.kind === 'rename_repo' ? 'rename_repository' : 'update_visibility';
  return {
    name: toolName,
    args: { owner: action.owner, repo: action.repo, newName: action.newName, isPrivate: action.isPrivate },
    status: 'requires_confirmation',
    result: { action: { id: action.id, ...card } },
  };
}

async function runPendingAction(action: PendingAction, token: string): Promise<string> {
  const user = await ghService.verifyGitHubToken(token);
  if (user.login !== action.owner) {
    throw new Error(`This token belongs to @${user.login}, not ${action.owner}.`);
  }

  switch (action.kind) {
    case 'delete_repo':
      await ghService.deleteRepository(token, action.owner, action.repo);
      activityStore.logActivity({
        type: 'repo_create',
        title: `Deleted repository ${action.owner}/${action.repo}`,
        description: 'Repository permanently deleted after confirmation.',
        status: 'warning',
      });
      return `Deleted **${action.owner}/${action.repo}**.`;
    case 'rename_repo': {
      const renamed = await ghService.renameRepository(token, action.owner, action.repo, action.newName!);
      activityStore.logActivity({
        type: 'ai_action',
        title: `Renamed ${action.owner}/${action.repo}`,
        description: `Now ${renamed.full_name}`,
        status: 'success',
      });
      return `Renamed to **${renamed.full_name}**.`;
    }
    case 'set_visibility': {
      const updated = await ghService.updateRepoVisibility(token, action.owner, action.repo, !!action.isPrivate);
      activityStore.logActivity({
        type: 'ai_action',
        title: `Changed visibility of ${updated.full_name}`,
        description: `Now ${updated.private ? 'private' : 'public'}.`,
        status: 'success',
      });
      return `**${updated.full_name}** is now **${updated.private ? 'private' : 'public'}**.`;
    }
  }
}

function findInvocationMessage(conv: Conversation, actionId: string) {
  for (const msg of conv.messages) {
    const inv = msg.toolInvocations?.find((t) => t.result?.action?.id === actionId);
    if (inv) return { msg, inv };
  }
  return null;
}

/** Called by the Confirm button. Runs the destructive action only after an explicit click. */
export async function confirmPendingAction(actionId: string, token: string | undefined): Promise<ChatMessage> {
  prunePendingActions();
  const action = pendingActions.get(actionId);
  if (!action) throw Object.assign(new Error('This action expired. Please ask again.'), { status: 404 });
  if (!token) throw Object.assign(new Error('Connect your GitHub account first.'), { status: 401 });

  pendingActions.delete(actionId);
  const conv = getOrCreateConversation(action.conversationId);
  const found = findInvocationMessage(conv, actionId);

  let content: string;
  let status: 'success' | 'failed' = 'success';
  try {
    content = await runPendingAction(action, token);
  } catch (err: any) {
    status = 'failed';
    content = `Could not complete this: ${err.message || 'GitHub request failed'}.`;
  }

  if (found) {
    found.inv.status = status;
    found.inv.result = { ...found.inv.result, done: true };
  }
  const reply: ChatMessage = {
    id: `msg-${Date.now()}-ai`,
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
  };
  conv.messages.push(reply);
  conv.updatedAt = reply.timestamp;
  return reply;
}

/** Called by the Cancel button. */
export function cancelPendingAction(actionId: string): boolean {
  const action = pendingActions.get(actionId);
  if (!action) return false;
  pendingActions.delete(actionId);
  const conv = conversations.get(action.conversationId);
  const found = conv && findInvocationMessage(conv, actionId);
  if (found) {
    found.inv.status = 'cancelled';
    found.inv.result = { ...found.inv.result, done: true };
  }
  return true;
}

// ---------- Gemini key rotation ----------

// GEMINI_API_KEYS="key1,key2,key3" (falls back to a single GEMINI_API_KEY).
const keyCooldownUntil = new Map<string, number>();
let keyCursor = 0;

function getGeminiKeys(): string[] {
  const raw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
  return raw.split(/[\s,]+/).map((k) => k.trim()).filter(Boolean);
}

function isQuotaError(err: any): boolean {
  const msg = String(err?.message || '');
  return err?.status === 429 || err?.code === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit|429/i.test(msg);
}

function cooldownFor(err: any): number {
  const msg = String(err?.message || '');
  // Daily quotas stay exhausted for hours; per-minute limits clear quickly.
  return /per.?day|daily/i.test(msg) ? 60 * 60 * 1000 : 60 * 1000;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

/** Runs a Gemini request, moving to the next key when one hits its quota. */
async function callGemini<T>(run: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  const keys = getGeminiKeys();
  if (keys.length === 0) throw Object.assign(new Error('NO_GEMINI_KEY'), { code: 'NO_GEMINI_KEY' });

  const now = Date.now();
  let lastErr: any = null;

  for (let i = 0; i < keys.length; i++) {
    const idx = (keyCursor + i) % keys.length;
    const key = keys[idx];
    if ((keyCooldownUntil.get(key) || 0) > now) continue;

    try {
      const result = await run(new GoogleGenAI({ apiKey: key }));
      keyCursor = (idx + 1) % keys.length; // spread load across keys
      return result;
    } catch (err: any) {
      lastErr = err;
      if (isQuotaError(err)) {
        keyCooldownUntil.set(key, Date.now() + cooldownFor(err));
        continue;
      }
      throw err;
    }
  }

  throw lastErr ?? Object.assign(new Error('ALL_KEYS_BUSY'), { code: 'ALL_KEYS_BUSY' });
}

// ---------- Gemini tool declarations ----------

const tools: FunctionDeclaration[] = [
  {
    name: 'list_repositories',
    description: 'List the user\'s GitHub repositories.',
    parameters: { type: Type.OBJECT, properties: { limit: { type: Type.INTEGER } } },
  },
  {
    name: 'get_repository_details',
    description: 'Get details of one repository.',
    parameters: {
      type: Type.OBJECT,
      properties: { owner: { type: Type.STRING }, repo: { type: Type.STRING } },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'create_repository',
    description: 'Create a new repository on the user\'s account.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        description: { type: Type.STRING },
        is_private: { type: Type.BOOLEAN },
      },
      required: ['name'],
    },
  },
  {
    name: 'rename_repository',
    description: 'Rename a repository. Needs user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        owner: { type: Type.STRING },
        repo: { type: Type.STRING },
        new_name: { type: Type.STRING },
      },
      required: ['owner', 'repo', 'new_name'],
    },
  },
  {
    name: 'update_visibility',
    description: 'Change a repository to private or public. Needs user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        owner: { type: Type.STRING },
        repo: { type: Type.STRING },
        is_private: { type: Type.BOOLEAN },
      },
      required: ['owner', 'repo', 'is_private'],
    },
  },
  {
    name: 'delete_repository',
    description: 'Permanently delete one repository. Needs user confirmation. Never delete more than one repository.',
    parameters: {
      type: Type.OBJECT,
      properties: { owner: { type: Type.STRING }, repo: { type: Type.STRING } },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'inspect_repo_files',
    description: 'List files in a repository folder.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        owner: { type: Type.STRING },
        repo: { type: Type.STRING },
        path: { type: Type.STRING },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'read_file_content',
    description: 'Read a text file from a repository.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        owner: { type: Type.STRING },
        repo: { type: Type.STRING },
        file_path: { type: Type.STRING },
      },
      required: ['owner', 'repo', 'file_path'],
    },
  },
  {
    name: 'prepare_render_config',
    description: 'Generate a render.yaml and .gitignore for a project type.',
    parameters: {
      type: Type.OBJECT,
      properties: { project_type: { type: Type.STRING } },
      required: ['project_type'],
    },
  },
];

const SYSTEM_PROMPT = `You are AI Doctor, a GitHub and deployment assistant inside Zip2Repo.
- Use tools to do GitHub work. Do not tell the user to do it manually.
- Keep answers short. Use simple markdown.
- Never delete, rename, or change visibility yourself. Call the tool; the user confirms with a button.
- Only one repository at a time. Refuse bulk deletes.`;

// ---------- Tool execution ----------

type ToolOutcome = { result: any; status: 'success' | 'failed' | 'requires_confirmation'; pending?: ToolInvocation };

async function executeTool(name: string, args: Record<string, any>, token: string | undefined, conv: Conversation): Promise<ToolOutcome> {
  const needsToken = name !== 'prepare_render_config';
  if (needsToken && !token) {
    return { result: { error: 'GitHub is not connected. Ask the user to connect a token in Settings.' }, status: 'failed' };
  }

  try {
    switch (name) {
      case 'list_repositories': {
        const repos = await ghService.listUserRepositories(token!, { perPage: Math.min(args.limit || 10, 50) });
        return { result: { count: repos.length, repositories: repos.map((r) => ({ name: r.name, private: r.private })) }, status: 'success' };
      }
      case 'get_repository_details': {
        const r = await ghService.getRepository(token!, args.owner, args.repo);
        return { result: { full_name: r.full_name, private: r.private, default_branch: r.default_branch, url: r.html_url }, status: 'success' };
      }
      case 'create_repository': {
        const r = await ghService.createRepository(token!, { name: args.name, description: args.description, isPrivate: args.is_private ?? true, autoInit: true });
        activityStore.logActivity({ type: 'ai_action', title: `Created ${r.full_name}`, description: 'Created via AI Doctor.', status: 'success' });
        return { result: { full_name: r.full_name, url: r.html_url }, status: 'success' };
      }
      case 'rename_repository':
      case 'update_visibility':
      case 'delete_repository': {
        const owner = args.owner || (await ghService.verifyGitHubToken(token!)).login;
        const pending = createPendingAction(conv, {
          kind: name === 'delete_repository' ? 'delete_repo' : name === 'rename_repository' ? 'rename_repo' : 'set_visibility',
          owner,
          repo: args.repo,
          newName: args.new_name,
          isPrivate: args.is_private,
        });
        return { result: { status: 'awaiting_user_confirmation' }, status: 'requires_confirmation', pending };
      }
      case 'inspect_repo_files': {
        const files = await ghService.listRepoFiles(token!, args.owner, args.repo, args.path || '');
        return { result: { files: files.map((f) => `${f.type === 'dir' ? '📁' : '📄'} ${f.path}`) }, status: 'success' };
      }
      case 'read_file_content': {
        const file = await ghService.getRepoFileContent(token!, args.owner, args.repo, args.file_path);
        return { result: { content: file.content.slice(0, 4000) }, status: 'success' };
      }
      case 'prepare_render_config': {
        const config = renderService.prepareRenderCompatibility(args.project_type || 'vite', { name: 'app' }, []);
        return { result: config, status: 'success' };
      }
      default:
        return { result: { error: `Unknown tool ${name}` }, status: 'failed' };
    }
  } catch (err: any) {
    return { result: { error: err.message || 'Tool failed' }, status: 'failed' };
  }
}

// ---------- Deterministic commands (no AI needed) ----------

function reply(conv: Conversation, content: string, toolInvocations?: ChatMessage['toolInvocations']): ChatMessage {
  const msg: ChatMessage = {
    id: `msg-${Date.now()}-ai`,
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
    toolInvocations,
  };
  conv.messages.push(msg);
  conv.updatedAt = msg.timestamp;
  return msg;
}

async function tryDeterministic(conv: Conversation, text: string, token: string | undefined): Promise<ChatMessage | null> {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // Bulk delete: refuse
  if (/\bdelete\b/.test(lower) && /\ball\b/.test(lower) && /\brepo/.test(lower)) {
    return reply(conv, 'I can\'t delete several repositories at once. Tell me the exact name of one repo to delete.');
  }

  // Typed confirmation: "CONFIRM DELETE <repo>" (kept as a fallback to the button)
  const typedDelete = clean.match(/^(?:confirm\s+delete|yes\s+delete)\s+([a-zA-Z0-9._-]+)$/i);
  if (typedDelete) {
    if (!token) return reply(conv, 'Connect your GitHub account first.');
    const target = typedDelete[1];
    const owner = (await ghService.verifyGitHubToken(token)).login;
    const pending = createPendingAction(conv, { kind: 'delete_repo', owner, repo: target });
    return reply(conv, `Please confirm deleting **${owner}/${target}** with the button below.`, [pending]);
  }

  // Single delete: "delete repo my-app"
  const del = clean.match(/^(?:delete|remove)\s+(?:repo\s+|repository\s+)?([a-zA-Z0-9._-]+)$/i);
  if (del && !['all', 'every', 'my', 'repo', 'repos', 'repository'].includes(del[1].toLowerCase())) {
    if (!token) return reply(conv, 'Connect your GitHub account first (Settings or the top bar).');
    const owner = (await ghService.verifyGitHubToken(token)).login;
    const pending = createPendingAction(conv, { kind: 'delete_repo', owner, repo: del[1] });
    return reply(conv, `Confirm deleting **${owner}/${del[1]}**.`, [pending]);
  }

  // Rename: "rename repo old to new"
  const ren = clean.match(/^rename\s+(?:repo\s+|repository\s+)?([a-zA-Z0-9._-]+)\s+(?:to\s+)?([a-zA-Z0-9._-]+)$/i);
  if (ren) {
    if (!token) return reply(conv, 'Connect your GitHub account first.');
    const owner = (await ghService.verifyGitHubToken(token)).login;
    const pending = createPendingAction(conv, { kind: 'rename_repo', owner, repo: ren[1], newName: ren[2] });
    return reply(conv, `Confirm renaming **${ren[1]}** to **${ren[2]}**.`, [pending]);
  }

  // Visibility: "make my-app private" / "set my-app public"
  const vis = clean.match(/^(?:make|set|change)\s+(?:repo\s+)?([a-zA-Z0-9._-]+)\s+(?:to\s+|as\s+)?(private|public)$/i);
  if (vis) {
    if (!token) return reply(conv, 'Connect your GitHub account first.');
    const owner = (await ghService.verifyGitHubToken(token)).login;
    const isPrivate = vis[2].toLowerCase() === 'private';
    const pending = createPendingAction(conv, { kind: 'set_visibility', owner, repo: vis[1], isPrivate });
    return reply(conv, `Confirm changing **${vis[1]}** to ${vis[2].toLowerCase()}.`, [pending]);
  }

  // List repos
  if (/^(list|show|get|check)\b.*\brepo/.test(lower) || lower === 'my repos' || lower === 'my repositories') {
    if (!token) return reply(conv, 'Connect your GitHub account first (Settings or the top bar).');
    const repos = await ghService.listUserRepositories(token, { perPage: 12 });
    const items = repos.map((r) => `• **${r.name}** (${r.private ? 'private' : 'public'}) · [Open](${r.html_url})`).join('\n');
    return reply(conv, `### Your repositories (${repos.length})\n${items || 'No repositories found.'}`);
  }

  // Create repo: "create repo my-app" / "create private repo my-app"
  const create = clean.match(/^(?:create|make|new)\s+(?:a\s+)?(?:(private|public)\s+)?(?:repo|repository)\s+([a-zA-Z0-9._-]+)$/i);
  if (create) {
    if (!token) return reply(conv, 'Connect your GitHub account first.');
    const isPrivate = create[1]?.toLowerCase() !== 'public';
    const r = await ghService.createRepository(token, { name: create[2], isPrivate, autoInit: true });
    activityStore.logActivity({ type: 'ai_action', title: `Created ${r.full_name}`, description: 'Created via AI Doctor.', status: 'success' });
    return reply(conv, `Created **${r.full_name}** (${r.private ? 'private' : 'public'}).\n\n${r.html_url}`);
  }

  return null;
}

// ---------- Main entry ----------

export async function processDoctorMessage(params: {
  conversationId: string;
  userMessage: string;
  githubToken?: string;
}): Promise<ChatMessage> {
  const conv = getOrCreateConversation(params.conversationId);
  const now = new Date().toISOString();

  conv.messages.push({ id: `msg-${Date.now()}-user`, role: 'user', content: params.userMessage, timestamp: now });
  conv.updatedAt = now;
  if (conv.title === 'New chat' && conv.messages.length >= 2) {
    const t = params.userMessage.trim();
    conv.title = t.length > 36 ? `${t.slice(0, 36)}...` : t;
  }

  const token = params.githubToken || process.env.GITHUB_TOKEN;

  try {
    const handled = await tryDeterministic(conv, params.userMessage, token);
    if (handled) return handled;
  } catch (err: any) {
    return reply(conv, `Something went wrong: ${err.message || 'GitHub request failed'}.`);
  }

  // AI path (Gemini with tool calling)
  try {
    const history = conv.messages
      .slice(-12)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    // Gemini expects the conversation to start with a user turn
    while (history.length && history[0].role !== 'user') history.shift();

    const toolInvocations: NonNullable<ChatMessage['toolInvocations']> = [];
    const contents: any[] = history;
    let finalText = '';

    for (let round = 0; round < 4; round++) {
      const response: any = await callGemini((ai) =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents,
          config: { systemInstruction: SYSTEM_PROMPT, tools: [{ functionDeclarations: tools }] },
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
        if (outcome.pending) {
          toolInvocations.push(outcome.pending);
        } else {
          toolInvocations.push({ name, args, result: outcome.result, status: outcome.status });
        }
        responseParts.push({ functionResponse: { name, response: { output: outcome.result } } });
      }
      contents.push({ role: 'user', parts: responseParts });
    }

    const msg = reply(
      conv,
      finalText || (toolInvocations.some((t) => t.status === 'requires_confirmation') ? 'Please confirm below.' : 'Done.'),
      toolInvocations.length ? toolInvocations : undefined
    );
    return msg;
  } catch (err: any) {
    if (err?.code === 'NO_GEMINI_KEY') {
      return reply(conv, 'AI mode is off. Add `GEMINI_API_KEYS` to your environment to enable it.');
    }
    if (err?.code === 'ALL_KEYS_BUSY' || isQuotaError(err)) {
      return reply(conv, 'All AI keys are at their limit right now. Please try again in a minute.');
    }
    // Log the real cause on the server (Render logs) without exposing it to the chat
    console.error('[AI Doctor] Gemini request failed:', err?.status || '', err?.message || err);
    return reply(conv, 'AI is unavailable right now. Try a direct command like `list my repos`.');
  }
}
