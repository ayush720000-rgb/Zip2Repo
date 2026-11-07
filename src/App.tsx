/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext.js';
import { Navbar } from './components/Navbar.js';
import { GitHubConnectModal } from './components/GitHubConnectModal.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { RepositoriesPage } from './pages/RepositoriesPage.js';
import { DeploymentsPage } from './pages/DeploymentsPage.js';
import { ActivityPage } from './pages/ActivityPage.js';
import { AiDoctorPage } from './pages/AiDoctorPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { DeploymentRecord, GitHubRepoItem } from './types.js';

const AppContent: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | undefined>();

  // Global Keyboard shortcuts: Cmd+K / Ctrl+K opens AI Doctor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setActiveTab(activeTab === 'doctor' ? 'dashboard' : 'doctor');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, setActiveTab]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0C0C0E] text-[#F4F4F5] transition-colors">
      <Navbar onOpenConnectModal={() => setIsConnectModalOpen(true)} />

      <div className="flex-1">
        {activeTab === 'dashboard' && (
          <DashboardPage
            onOpenConnectModal={() => setIsConnectModalOpen(true)}
            onViewDeployment={(dep: DeploymentRecord) => {
              setSelectedDeploymentId(dep.id);
              setActiveTab('deployments');
            }}
          />
        )}

        {activeTab === 'repositories' && (
          <RepositoriesPage
            onOpenConnectModal={() => setIsConnectModalOpen(true)}
            onDeployRepo={async (repo: GitHubRepoItem) => {
              try {
                const res = await fetch('/api/render/deploy', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    projectName: repo.name,
                    repoName: repo.full_name,
                    repoUrl: repo.html_url,
                    branch: repo.default_branch || 'main',
                  }),
                });
                const data = await res.json();
                if (data.deployment) {
                  setSelectedDeploymentId(data.deployment.id);
                  setActiveTab('deployments');
                }
              } catch (e) {
                // Ignore
              }
            }}
          />
        )}

        {activeTab === 'deployments' && (
          <DeploymentsPage selectedDeploymentId={selectedDeploymentId} />
        )}

        {activeTab === 'activity' && <ActivityPage />}

        {activeTab === 'doctor' && <AiDoctorPage />}

        {activeTab === 'settings' && (
          <SettingsPage onOpenConnectModal={() => setIsConnectModalOpen(true)} />
        )}
      </div>

      {/* Persistent Quiet Footer only when not in full-screen AI Doctor */}
      {activeTab !== 'doctor' && (
        <footer className="mt-auto border-t border-neutral-200/80 dark:border-neutral-800/80 py-6 px-4 text-center text-xs text-neutral-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">Zip2Repo</span>
              <span>·</span>
              <span>Your ZIP. Your Repo. One Click.</span>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <button onClick={() => setActiveTab('dashboard')} className="hover:underline">Dashboard</button>
              <button onClick={() => setActiveTab('doctor')} className="hover:underline">AI Doctor</button>
              <button onClick={() => setActiveTab('deployments')} className="hover:underline">Deployments</button>
              <button onClick={() => setActiveTab('settings')} className="hover:underline">Settings</button>
            </div>
          </div>
        </footer>
      )}

      {/* GitHub Connect Modal */}
      <GitHubConnectModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
