import React, { createContext, useContext, useState, useEffect } from 'react';
import { GitHubUser, InspectedZipData, ActivityEvent } from '../types.js';

export type TabId = 'dashboard' | 'repositories' | 'activity' | 'doctor' | 'guide' | 'settings';

interface AppContextType {
  user: GitHubUser | null;
  isAuthenticated: boolean;
  token: string;
  setGitHubToken: (token: string) => Promise<boolean>;
  disconnectGitHub: () => Promise<void>;
  currentZip: InspectedZipData | null;
  setCurrentZip: (data: InspectedZipData | null) => void;
  /** Repository chosen on the My Repositories page, waiting for a ZIP on the Dashboard. */
  pushTarget: string | null;
  setPushTarget: (fullName: string | null) => void;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  doctorInitialPrompt: string | null;
  openDoctorWithPrompt: (prompt: string) => void;
  clearDoctorPrompt: () => void;
  activities: ActivityEvent[];
  refreshActivities: () => Promise<void>;
  isLoadingUser: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string>(() => localStorage.getItem('gh_token') || '');
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true);
  const [currentZip, setCurrentZip] = useState<InspectedZipData | null>(null);
  const [pushTarget, setPushTarget] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [doctorInitialPrompt, setDoctorInitialPrompt] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);

  // Older builds stored a Render API key in this browser. It is no longer used, so remove it.
  useEffect(() => {
    localStorage.removeItem('render_api_key');
  }, []);

  const verifyToken = async (tokenToVerify: string): Promise<boolean> => {
    if (!tokenToVerify) {
      setUser(null);
      setIsLoadingUser(false);
      return false;
    }
    setIsLoadingUser(true);
    try {
      const res = await fetch('/api/auth/github/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenToVerify }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        setUser(data.user);
        setIsLoadingUser(false);
        return true;
      }
      setUser(null);
      setIsLoadingUser(false);
      return false;
    } catch (e) {
      setUser(null);
      setIsLoadingUser(false);
      return false;
    }
  };

  const refreshActivities = async () => {
    try {
      const res = await fetch('/api/activity');
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
      }
    } catch (e) {
      // Keep the last known list
    }
  };

  useEffect(() => {
    if (token) {
      verifyToken(token);
    } else {
      setIsLoadingUser(false);
    }
    refreshActivities();
  }, [token]);

  const setGitHubToken = async (newToken: string): Promise<boolean> => {
    setTokenState(newToken);
    localStorage.setItem('gh_token', newToken);
    return await verifyToken(newToken);
  };

  const disconnectGitHub = async () => {
    setTokenState('');
    localStorage.removeItem('gh_token');
    setUser(null);
    try {
      await fetch('/api/auth/github/disconnect', { method: 'POST' });
    } catch (e) {
      // The local token is already cleared
    }
  };

  const openDoctorWithPrompt = (prompt: string) => {
    setDoctorInitialPrompt(prompt);
    setActiveTab('doctor');
  };

  const clearDoctorPrompt = () => {
    setDoctorInitialPrompt(null);
  };

  return (
    <AppContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        token,
        setGitHubToken,
        disconnectGitHub,
        currentZip,
        setCurrentZip,
        pushTarget,
        setPushTarget,
        activeTab,
        setActiveTab,
        doctorInitialPrompt,
        openDoctorWithPrompt,
        clearDoctorPrompt,
        activities,
        refreshActivities,
        isLoadingUser,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
