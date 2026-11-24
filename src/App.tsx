import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext.js';
import { Navbar } from './components/Navbar.js';
import { GitHubConnectModal } from './components/GitHubConnectModal.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { RepositoriesPage } from './pages/RepositoriesPage.js';
import { ActivityPage } from './pages/ActivityPage.js';
import { AiDoctorPage } from './pages/AiDoctorPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { GuidePage } from './pages/GuidePage.js';
import { Splash } from './components/Splash.js';
import { GitHubRepoItem } from './types.js';

const AppContent: React.FC = () => {
  const { activeTab, setActiveTab, setPushTarget } = useApp();
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  // Cmd+K / Ctrl+K toggles AI Doctor
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

  const openConnectModal = () => setIsConnectModalOpen(true);

  return (
    <div className="min-h-screen flex flex-col bg-[#0C0C0E] text-[#F4F4F5]">
      <Splash />
      <Navbar onOpenConnectModal={openConnectModal} />

      <main className="flex-1">
        <div key={activeTab} className="animate-page-enter">
        {activeTab === 'dashboard' && <DashboardPage onOpenConnectModal={openConnectModal} />}

        {activeTab === 'repositories' && (
          <RepositoriesPage
            onOpenConnectModal={openConnectModal}
            onPushToRepo={(repo: GitHubRepoItem) => {
              setPushTarget(repo.full_name);
              setActiveTab('dashboard');
            }}
          />
        )}

        {activeTab === 'activity' && <ActivityPage />}

        {activeTab === 'doctor' && <AiDoctorPage />}

        {activeTab === 'guide' && <GuidePage />}

        {activeTab === 'settings' && <SettingsPage onOpenConnectModal={openConnectModal} />}
        </div>
      </main>

      {activeTab !== 'doctor' && (
        <footer className="mt-auto border-t border-white/[0.08] py-6 px-4 text-xs text-neutral-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="font-semibold text-neutral-300">Zip2Repo</span>
            <nav className="flex items-center gap-4">
              <button onClick={() => setActiveTab('dashboard')} className="hover:text-neutral-200">Dashboard</button>
              <button onClick={() => setActiveTab('repositories')} className="hover:text-neutral-200">Repositories</button>
              <button onClick={() => setActiveTab('doctor')} className="hover:text-neutral-200">AI Doctor</button>
              <button onClick={() => setActiveTab('guide')} className="hover:text-neutral-200">Guide</button>
              <button onClick={() => setActiveTab('settings')} className="hover:text-neutral-200">Settings</button>
            </nav>
          </div>
        </footer>
      )}

      <GitHubConnectModal isOpen={isConnectModalOpen} onClose={() => setIsConnectModalOpen(false)} />
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
