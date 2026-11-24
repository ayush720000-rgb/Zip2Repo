import React, { useState } from 'react';
import { useApp, TabId } from '../context/AppContext.js';
import { LogoMark } from './Logo.js';
import {
  FolderArchive,
  GitBranch,
  Activity,
  Settings,
  Stethoscope,
  BookOpen,
  Github,
  Menu,
  X,
  ExternalLink,
  LogOut,
  ChevronDown,
} from 'lucide-react';

interface NavbarProps {
  onOpenConnectModal: () => void;
}

interface NavLinkItem {
  id: Exclude<TabId, 'doctor'>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navLinks: NavLinkItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: FolderArchive },
  { id: 'repositories', label: 'Repositories', icon: GitBranch },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'guide', label: 'Guide', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Navbar: React.FC<NavbarProps> = ({ onOpenConnectModal }) => {
  const { user, isAuthenticated, disconnectGitHub, activeTab, setActiveTab } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const handleNavClick = (tab: TabId) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0C0C0E] border-b border-white/[0.08]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        <button
          onClick={() => handleNavClick('dashboard')}
          className="group flex items-center gap-2.5 font-semibold text-sm tracking-tight text-white"
        >
          <LogoMark className="w-7 h-7 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-105" />
          <span>Zip2Repo</span>
        </button>

        <nav className="hidden md:flex items-center gap-1 h-full">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`h-full flex items-center gap-2 px-3 text-xs font-medium border-b-2 transition-all duration-200 ${
                  isActive
                    ? 'border-accent-400 text-white'
                    : 'border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('doctor')}
            aria-label="AI Doctor"
            title="Open AI Doctor (Ctrl+K or ⌘K)"
            className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
              activeTab === 'doctor'
                ? 'bg-white text-neutral-900 border-white'
                : 'bg-[#18181C] text-[#F4F4F5] border-white/10 hover:border-white/20'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5 text-accent-400" />
            <span className="hidden sm:inline">AI Doctor</span>
          </button>

          {isAuthenticated && user ? (
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 p-1.5 pr-2.5 rounded-lg border border-white/10 bg-[#161619] hover:border-white/20 transition-colors"
              >
                <img src={user.avatar_url} alt={user.login} className="w-6 h-6 rounded-md object-cover" />
                <span className="text-xs font-medium text-neutral-200 max-w-[90px] truncate hidden sm:inline">
                  @{user.login}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
              </button>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                  <div className="surface absolute right-0 mt-2 w-64 bg-[#151518] shadow-xl z-50 p-3 space-y-3">
                    <div className="flex items-center gap-3 pb-3 border-b border-white/[0.08]">
                      <img src={user.avatar_url} alt={user.login} className="w-10 h-10 rounded-lg object-cover" />
                      <div className="overflow-hidden">
                        <p className="text-xs font-semibold text-white truncate">{user.name || user.login}</p>
                        <p className="text-[11px] text-neutral-500 truncate">@{user.login}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-neutral-300">
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-500">Repositories</span>
                        <span className="font-semibold text-white">{user.public_repos + (user.total_private_repos || 0)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-500">Requests left this hour</span>
                        <span className="font-mono text-[11px]">{user.rateLimitRemaining || 5000} / {user.rateLimitLimit || 5000}</span>
                      </div>
                      <a
                        href={user.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between text-neutral-400 hover:text-white py-1 transition-colors"
                      >
                        <span>GitHub profile</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <div className="pt-2 border-t border-white/[0.08]">
                      <button
                        onClick={() => {
                          setProfileOpen(false);
                          disconnectGitHub();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-950/30 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Disconnect GitHub</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenConnectModal}
              aria-label="Connect GitHub"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#1A1A1E] text-white border border-white/10 hover:border-white/20 text-xs font-medium whitespace-nowrap transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Connect GitHub</span>
            </button>
          )}

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/[0.08] bg-[#0C0C0E] px-4 py-3 space-y-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-[#222227] text-white' : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
