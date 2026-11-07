/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import { 
  FolderArchive, 
  GitBranch, 
  Rocket, 
  Activity, 
  Settings, 
  Sparkles, 
  Sun, 
  Moon, 
  Github, 
  CheckCircle2, 
  AlertCircle, 
  Menu, 
  X,
  ExternalLink,
  LogOut,
  ChevronDown
} from 'lucide-react';

interface NavbarProps {
  onOpenConnectModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenConnectModal }) => {
  const { 
    user, 
    isAuthenticated, 
    disconnectGitHub, 
    theme, 
    toggleTheme, 
    activeTab, 
    setActiveTab, 
    deployments 
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const activeDeploymentsCount = deployments.filter(
    (d) => d.status === 'building' || d.status === 'deploying'
  ).length;

  interface NavLinkItem {
    id: 'dashboard' | 'repositories' | 'deployments' | 'activity' | 'settings';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }

  const navLinks: NavLinkItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: FolderArchive },
    { id: 'repositories', label: 'My Repositories', icon: GitBranch },
    { 
      id: 'deployments', 
      label: 'Deployments', 
      icon: Rocket,
      badge: activeDeploymentsCount > 0 ? activeDeploymentsCount : undefined 
    },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNavClick = (tab: NavLinkItem['id']) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#0C0C0E]/90 border-b border-white/[0.08] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className="flex items-center gap-2.5 text-left group focus-visible:outline-none"
          >
            <div className="w-9 h-9 rounded-xl bg-white text-neutral-900 flex items-center justify-center font-bold text-lg shadow-[0_4px_12px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)] group-hover:scale-105 transition-transform">
              <span className="font-mono text-xs tracking-tighter">Z2R</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base tracking-tight text-white">Zip2Repo</span>
                <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded-md bg-neutral-800 text-neutral-400 font-semibold">v1.0</span>
              </div>
              <p className="text-[11px] text-neutral-400 hidden sm:block -mt-0.5">Your ZIP. Your Repo. One Click.</p>
            </div>
          </button>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1 p-1 bg-[#161619] rounded-xl border border-white/[0.06]">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  isActive
                    ? 'bg-[#222227] text-white shadow-xs border border-white/[0.08]'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="w-4 h-4 rounded-full bg-white text-neutral-900 text-[9px] font-bold flex items-center justify-center animate-pulse">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          {/* AI Doctor Tactile Button */}
          <button
            onClick={() => setActiveTab('doctor')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
              activeTab === 'doctor'
                ? 'bg-white text-neutral-900 border-white shadow-sm'
                : 'bg-[#18181C] text-[#F4F4F5] border-white/10 hover:border-white/20 shadow-xs'
            }`}
            title="Open ChatGPT-style AI Doctor for GitHub"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>AI Doctor</span>
            <kbd className="hidden lg:inline-block text-[10px] font-mono px-1 rounded bg-neutral-800 text-neutral-400 ml-1">⌘K</kbd>
          </button>

          {/* GitHub Connection Status */}
          {isAuthenticated && user ? (
            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2 p-1.5 pr-2.5 rounded-xl border border-white/10 bg-[#161619] hover:border-white/20 transition-colors shadow-xs"
              >
                <img
                  src={user.avatar_url}
                  alt={user.login}
                  className="w-6 h-6 rounded-lg object-cover border border-black/10 dark:border-white/10"
                />
                <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 max-w-[90px] truncate hidden sm:inline">
                  @{user.login}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
              </button>

              {profileDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setProfileDropdownOpen(false)} 
                  />
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl z-50 p-3 space-y-3">
                    <div className="flex items-center gap-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
                      <img
                        src={user.avatar_url}
                        alt={user.login}
                        className="w-10 h-10 rounded-xl object-cover"
                      />
                      <div className="overflow-hidden">
                        <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                          {user.name || user.login}
                        </p>
                        <p className="text-[11px] text-neutral-500 truncate">@{user.login}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-neutral-600 dark:text-neutral-300">
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-500">Repositories</span>
                        <span className="font-semibold text-neutral-900 dark:text-white">{user.public_repos + (user.total_private_repos || 0)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-500">API Rate Limit</span>
                        <span className="font-mono text-[11px]">{user.rateLimitRemaining || 5000} / {user.rateLimitLimit || 5000}</span>
                      </div>
                      <a
                        href={user.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white py-1 transition-colors"
                      >
                        <span>GitHub Profile</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          disconnectGitHub();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1A1A1E] text-white border border-white/10 hover:border-white/20 text-xs font-medium shadow-xs transition-all"
            >
              <Github className="w-3.5 h-3.5" />
              <span>Connect GitHub</span>
            </button>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/[0.08] bg-[#0C0C0E] px-4 py-3 space-y-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#222227] text-white border border-white/10'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="w-5 h-5 rounded-full bg-white text-neutral-900 text-[10px] font-bold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
