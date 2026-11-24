/**
 * What the token allows, and what the user lets AI Doctor do.
 * GitHub scopes come from the token itself. AI Doctor's switches are stored per account.
 */

export interface DoctorPermissions {
  /** Create, edit, comment, and push. Off means AI Doctor can only read. */
  allowChanges: boolean;
  /** Delete, rename, change visibility, archive, and merge. Needs allowChanges too. */
  allowDestructive: boolean;
}

const DEFAULTS: DoctorPermissions = { allowChanges: true, allowDestructive: true };
const store = new Map<string, DoctorPermissions>();

export function getPermissions(ownerKey: string): DoctorPermissions {
  return { ...DEFAULTS, ...(store.get(ownerKey) || {}) };
}

export function setPermissions(ownerKey: string, patch: Partial<DoctorPermissions>): DoctorPermissions {
  const next = { ...getPermissions(ownerKey), ...patch };
  store.set(ownerKey, next);
  return next;
}

const DESTRUCTIVE_TOOLS = new Set([
  'delete_repository',
  'delete_branch',
  'delete_file',
  'rename_repository',
  'update_visibility',
  'set_archived',
  'merge_pull_request',
]);

const READ_TOOLS = new Set([
  'get_account',
  'list_repositories',
  'get_repository_details',
  'list_branches',
  'list_commits',
  'list_issues',
  'list_pull_requests',
  'list_files',
  'read_file',
]);

/** Returns a message when the user's settings block this tool, otherwise null. */
export function blockedBySettings(toolName: string, perms: DoctorPermissions): string | null {
  if (READ_TOOLS.has(toolName)) return null;
  if (!perms.allowChanges) {
    return 'Changes are turned off in Settings, so AI Doctor can only read. Turn on "Allow changes" to continue.';
  }
  if (DESTRUCTIVE_TOOLS.has(toolName) && !perms.allowDestructive) {
    return 'Deleting, renaming, archiving, and merging are turned off in Settings. Turn on "Allow destructive actions" to continue.';
  }
  return null;
}

export type TokenType = 'classic' | 'fine-grained' | 'other';

export function tokenTypeOf(token: string): TokenType {
  if (token.startsWith('github_pat_')) return 'fine-grained';
  if (token.startsWith('ghp_')) return 'classic';
  return 'other';
}

export type ScopeGroup = 'Repositories' | 'Account' | 'Automation' | 'Content' | 'Organizations' | 'Packages' | 'Security' | 'Other';

export const SCOPE_GROUP_ORDER: ScopeGroup[] = ['Repositories', 'Account', 'Automation', 'Content', 'Organizations', 'Packages', 'Security', 'Other'];

const SCOPE_INFO: Record<string, { title: string; allows: string; group: ScopeGroup }> = {
  repo: { title: 'Repositories', allows: 'Read, create, and push to private and public repositories, plus their issues and pull requests.', group: 'Repositories' },
  public_repo: { title: 'Public repositories', allows: 'Read and push to public repositories only.', group: 'Repositories' },
  delete_repo: { title: 'Delete repositories', allows: 'Permanently delete repositories you own or administer.', group: 'Repositories' },
  user: { title: 'Profile', allows: 'Read and update your GitHub profile.', group: 'Account' },
  'read:user': { title: 'Profile (read only)', allows: 'Read your profile.', group: 'Account' },
  'user:email': { title: 'Email addresses', allows: 'Read your email addresses.', group: 'Account' },
  notifications: { title: 'Notifications', allows: 'Read and mark notifications as read.', group: 'Account' },
  workflow: { title: 'Actions workflows', allows: 'Change workflow files in .github/workflows.', group: 'Automation' },
  codespace: { title: 'Codespaces', allows: 'Create and manage codespaces.', group: 'Automation' },
  copilot: { title: 'Copilot', allows: 'Use GitHub Copilot features.', group: 'Automation' },
  gist: { title: 'Gists', allows: 'Create and edit gists.', group: 'Content' },
  project: { title: 'Project boards', allows: 'Create and edit project boards.', group: 'Content' },
  'write:discussion': { title: 'Discussions', allows: 'Create and edit discussions.', group: 'Content' },
  'read:org': { title: 'Organizations (read only)', allows: 'Read organization membership and teams.', group: 'Organizations' },
  'admin:org': { title: 'Organization admin', allows: 'Manage organization settings, members, and teams.', group: 'Organizations' },
  'admin:org_hook': { title: 'Organization webhooks', allows: 'Create and change organization webhooks.', group: 'Organizations' },
  'admin:enterprise': { title: 'Enterprise admin', allows: 'Manage enterprise accounts and settings.', group: 'Organizations' },
  'write:packages': { title: 'Publish packages', allows: 'Upload and publish packages.', group: 'Packages' },
  'read:packages': { title: 'Read packages', allows: 'Download packages.', group: 'Packages' },
  'delete:packages': { title: 'Delete packages', allows: 'Permanently delete published packages.', group: 'Packages' },
  'admin:repo_hook': { title: 'Repository webhooks', allows: 'Create and change repository webhooks.', group: 'Security' },
  'admin:public_key': { title: 'SSH keys', allows: 'Add and remove SSH keys on your account.', group: 'Security' },
  'admin:gpg_key': { title: 'GPG keys', allows: 'Add and remove GPG keys on your account.', group: 'Security' },
  'admin:ssh_signing_key': { title: 'SSH signing keys', allows: 'Add and remove SSH signing keys.', group: 'Security' },
  audit_log: { title: 'Audit log', allows: 'Read the organization audit log.', group: 'Security' },
  'write:network_configurations': { title: 'Network configurations', allows: 'Change hosted network settings for organizations.', group: 'Security' },
};

/** Scopes that can change or remove a lot. Shown with a warning tag. */
const isSensitive = (scope: string) => scope.startsWith('admin:') || scope.startsWith('delete') || scope === 'delete_repo';

export function describeScope(scope: string): { name: string; title: string; allows: string; group: ScopeGroup; sensitive: boolean } {
  const info = SCOPE_INFO[scope];
  return {
    name: scope,
    title: info?.title || scope,
    allows: info?.allows || 'Extra access granted by this token.',
    group: info?.group || 'Other',
    sensitive: isSensitive(scope),
  };
}

export type CapabilityStatus = 'allowed' | 'blocked' | 'unknown';

export interface Capability {
  label: string;
  /** Token allows it. 'unknown' for fine-grained tokens, which do not list scopes. */
  token: CapabilityStatus;
  /** AI Doctor is allowed to do it under the current settings. */
  doctor: boolean;
}

/** What the account can do with AI Doctor right now, combining the token and the user's switches. */
export function capabilitiesFor(scopes: string[], type: TokenType, perms: DoctorPermissions): Capability[] {
  const has = (s: string) => scopes.includes(s);
  const tokenFor = (ok: boolean): CapabilityStatus => (type === 'fine-grained' ? 'unknown' : ok ? 'allowed' : 'blocked');
  const repoOk = has('repo') || has('public_repo');
  return [
    { label: 'Read repositories', token: tokenFor(repoOk), doctor: true },
    { label: 'Create repositories and push files', token: tokenFor(has('repo')), doctor: perms.allowChanges },
    { label: 'Edit issues and pull requests', token: tokenFor(has('repo')), doctor: perms.allowChanges },
    { label: 'Update your profile', token: tokenFor(has('user')), doctor: perms.allowChanges },
    { label: 'Delete, rename, archive, merge', token: tokenFor(has('repo') && has('delete_repo')), doctor: perms.allowChanges && perms.allowDestructive },
  ];
}
