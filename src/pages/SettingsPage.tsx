import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.js';
import { CheckCircle2, ExternalLink, Github, HelpCircle, KeyRound, ShieldCheck, Stethoscope, Trash2, XCircle } from 'lucide-react';

interface SettingsPageProps {
  onOpenConnectModal: () => void;
}

const GROUP_ORDER = ['Repositories', 'Account', 'Automation', 'Content', 'Organizations', 'Packages', 'Security', 'Other'];

interface Access {
  login: string;
  tokenType: 'classic' | 'fine-grained' | 'other';
  scopes: Array<{ name: string; title: string; allows: string; group: string; sensitive: boolean }>;
  capabilities: Array<{ label: string; token: 'allowed' | 'blocked' | 'unknown'; doctor: boolean }>;
  permissions: { allowChanges: boolean; allowDestructive: boolean };
}

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint: string; disabled?: boolean }> = ({
  checked,
  onChange,
  label,
  hint,
  disabled,
}) => (
  <label className={`flex items-center justify-between gap-4 py-3.5 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
    <span className="min-w-0">
      <span className="block text-xs font-semibold text-white">{label}</span>
      <span className="block text-[11px] text-neutral-500 mt-0.5">{hint}</span>
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full shrink-0 transition-colors duration-200 ${checked ? 'bg-accent-500' : 'bg-white/15'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  </label>
);

const StatusIcon: React.FC<{ status: 'allowed' | 'blocked' | 'unknown' | boolean }> = ({ status }) => {
  const ok = status === true || status === 'allowed';
  if (status === 'unknown') return <HelpCircle className="w-4 h-4 text-neutral-500" aria-label="Set on GitHub" />;
  return ok ? (
    <CheckCircle2 className="w-4 h-4 text-accent-300 animate-pop-in" aria-label="Allowed" />
  ) : (
    <XCircle className="w-4 h-4 text-neutral-600" aria-label="Not allowed" />
  );
};

const Card: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string; children: React.ReactNode; right?: React.ReactNode }> = ({
  icon: Icon,
  title,
  subtitle,
  children,
  right,
}) => (
  <section className="surface p-5 sm:p-6 space-y-4 animate-pop-in">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-accent-500/10 border border-accent-500/20 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-accent-300" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {right}
    </div>
    {children}
  </section>
);

export const SettingsPage: React.FC<SettingsPageProps> = ({ onOpenConnectModal }) => {
  const { user, token, disconnectGitHub } = useApp();
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      setAccess(null);
      return;
    }
    let active = true;
    setLoading(true);
    fetch('/api/settings/access', { headers: { 'x-github-token': token } })
      .then((res) => res.json())
      .then((data) => {
        if (active && !data.error) setAccess(data);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token, user?.login]);

  const updatePermission = async (patch: Partial<Access['permissions']>) => {
    if (!access) return;
    const previous = access.permissions;
    const optimistic = { ...previous, ...patch };
    setAccess({ ...access, permissions: optimistic });
    setSaving(true);
    try {
      const res = await fetch('/api/settings/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-github-token': token },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (res.ok) setAccess((a) => (a ? { ...a, permissions: data.permissions } : a));
      else throw new Error(data.error);
    } catch {
      setAccess((a) => (a ? { ...a, permissions: previous } : a));
    } finally {
      setSaving(false);
    }
  };

  const handleClearAll = () => {
    if (confirm('Clear the saved GitHub token from this browser and disconnect?')) {
      disconnectGitHub();
      localStorage.clear();
      window.location.reload();
    }
  };

  const tokenPage =
    access?.tokenType === 'fine-grained'
      ? 'https://github.com/settings/personal-access-tokens'
      : 'https://github.com/settings/tokens';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Settings</h1>
        <p className="text-xs text-neutral-500">See what your token allows, and decide what AI Doctor may do.</p>
      </div>

      {!user ? (
        <section className="surface p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center mx-auto text-neutral-200">
            <Github className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-white">No GitHub account connected</h2>
            <p className="text-xs text-neutral-500">Connect with a token to see its access and set AI Doctor's permissions.</p>
          </div>
          <button onClick={onOpenConnectModal} className="btn-primary h-10 px-5 text-xs">
            <Github className="w-3.5 h-3.5" />
            <span>Connect GitHub</span>
          </button>
        </section>
      ) : (
        <>
          <Card
            icon={Github}
            title="Account"
            subtitle="The GitHub account this browser is using."
            right={
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-accent-500/10 text-accent-300 border border-accent-500/20 whitespace-nowrap">
                Connected
              </span>
            }
          >
            <div className="flex items-center gap-4 p-4 rounded-lg bg-white/[0.03] border border-white/[0.08]">
              <img src={user.avatar_url} alt={user.login} className="w-11 h-11 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user.name || user.login}</p>
                <p className="text-xs text-neutral-500 font-mono">@{user.login}</p>
              </div>
              <p className="text-[11px] text-neutral-500 text-right whitespace-nowrap">
                {user.public_repos + (user.total_private_repos || 0)} repos
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button onClick={onOpenConnectModal} className="btn-secondary h-9 px-4 text-xs font-semibold">
                <KeyRound className="w-3.5 h-3.5" />
                <span>Use a different token</span>
              </button>
              <button onClick={disconnectGitHub} className="btn-secondary h-9 px-4 text-xs font-semibold text-red-400 hover:text-red-300">
                <span>Disconnect</span>
              </button>
            </div>
          </Card>

          <Card
            icon={KeyRound}
            title="Token access"
            subtitle={
              access?.tokenType === 'fine-grained'
                ? 'Fine-grained tokens set access per repository on GitHub.'
                : 'What the token you connected is allowed to do.'
            }
          >
            {loading && !access ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-9 rounded-lg bg-white/[0.04] animate-pulse" />
                ))}
              </div>
            ) : access?.tokenType === 'fine-grained' ? (
              <p className="text-xs text-neutral-400 leading-relaxed">
                Fine-grained tokens do not list their permissions here. See the capabilities below, which show what AI Doctor
                will try. GitHub returns an error for anything the token cannot do.
              </p>
            ) : access && access.scopes.length > 0 ? (
              <div className="space-y-5">
                <p className="text-[11px] text-neutral-500">
                  {access.scopes.length} permissions
                  {access.scopes.some((x) => x.sensitive) && ' · amber items can change or remove a lot'}
                </p>
                {GROUP_ORDER.filter((g) => access.scopes.some((x) => x.group === g)).map((group) => (
                  <div key={group} className="space-y-2.5 min-w-0">
                    <h3 className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{group}</h3>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                      {access.scopes
                        .filter((x) => x.group === group)
                        .map((scope) => (
                          <li
                            key={scope.name}
                            className={`min-w-0 p-3 rounded-lg border bg-white/[0.02] space-y-1.5 ${
                              scope.sensitive ? 'border-amber-900/50' : 'border-white/[0.08]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <code className="font-mono text-[11px] text-neutral-200 break-all min-w-0">{scope.name}</code>
                              {scope.sensitive && (
                                <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-900/50">
                                  Sensitive
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-white break-words">{scope.title}</p>
                            <p className="text-[11px] text-neutral-500 leading-relaxed break-words">{scope.allows}</p>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-500">This token has no extra scopes.</p>
            )}
            <a href={tokenPage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-accent-300 hover:text-accent-200 transition-colors">
              <span>Change this token's access on GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </Card>

          <Card
            icon={ShieldCheck}
            title="What AI Doctor can do"
            subtitle="Each action needs both the token and your switches below."
          >
            <div className="rounded-lg border border-white/[0.08] overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 px-4 py-2.5 bg-white/[0.03] text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                <span>Action</span>
                <span className="text-center w-16">Token</span>
                <span className="text-center w-16">AI Doctor</span>
              </div>
              {(access?.capabilities || []).map((c) => (
                <div key={c.label} className="grid grid-cols-[1fr_auto_auto] gap-x-6 items-center px-4 py-3 border-t border-white/[0.06] text-xs">
                  <span className="text-neutral-200">{c.label}</span>
                  <span className="flex justify-center w-16"><StatusIcon status={c.token} /></span>
                  <span className="flex justify-center w-16"><StatusIcon status={c.doctor} /></span>
                </div>
              ))}
              {!access && (
                <div className="px-4 py-6 text-center text-xs text-neutral-500">{loading ? 'Checking access...' : 'Access could not be read.'}</div>
              )}
            </div>
          </Card>

          <Card
            icon={Stethoscope}
            title="AI Doctor permissions"
            subtitle="Turn these off to keep AI Doctor from changing things. Reading is always on."
            right={saving ? <span className="text-[11px] text-neutral-500">Saving...</span> : null}
          >
            <div className="divide-y divide-white/[0.06]">
              <Toggle
                label="Allow changes"
                hint="Create repos, push files, edit issues and pull requests, comment, update your profile."
                checked={access?.permissions.allowChanges ?? true}
                disabled={!access}
                onChange={(v) => updatePermission({ allowChanges: v, ...(v ? {} : { allowDestructive: false }) })}
              />
              <Toggle
                label="Allow destructive actions"
                hint="Delete repositories, branches, and files, rename, change visibility, archive, and merge. Each still asks you to confirm."
                checked={access?.permissions.allowDestructive ?? true}
                disabled={!access || !access.permissions.allowChanges}
                onChange={(v) => updatePermission({ allowDestructive: v })}
              />
            </div>
            <p className="text-[11px] text-neutral-500">
              These switches apply to this server's AI Doctor and reset when the server restarts.
            </p>
          </Card>

          <section className="surface p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-pop-in">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-white">Reset this browser</h2>
              <p className="text-xs text-neutral-500">Removes the saved token and local settings here. Your repositories and chats are not changed.</p>
            </div>
            <button onClick={handleClearAll} className="btn-secondary h-9 px-4 text-xs font-semibold text-red-400 hover:text-red-300 shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear local data</span>
            </button>
          </section>
        </>
      )}
    </div>
  );
};
