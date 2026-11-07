/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { GitHubUser, InspectedZipData, ActivityEvent, DeploymentRecord } from '../types.js';

interface AppContextType {
  user: GitHubUser | null;
  isAuthenticated: boolean;
  token: string;
  setGitHubToken: (token: string) => Promise<boolean>;
  disconnectGitHub: () => Promise<void>;
  renderApiKey: string;
  setRenderApiKey: (key: string) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  currentZip: InspectedZipData | null;
  setCurrentZip: (data: InspectedZipData | null) => void;
  activeTab: 'dashboard' | 'repositories' | 'deployments' | 'activity' | 'doctor' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'repositories' | 'deployments' | 'activity' | 'doctor' | 'settings') => void;
  doctorInitialPrompt: string | null;
  openDoctorWithPrompt: (prompt: string) => void;
  clearDoctorPrompt: () => void;
  activities: ActivityEvent[];
  refreshActivities: () => Promise<void>;
  deployments: DeploymentRecord[];
  refreshDeployments: () => Promise<void>;
  isLoadingUser: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string>(() => localStorage.getItem('gh_token') || '');
  const [renderApiKey, setRenderApiKeyState] = useState<string>(() => localStorage.getItem('render_api_key') || '');
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true);
  const [theme] = useState<'dark'>('dark');
  const [currentZip, setCurrentZip] = useState<InspectedZipData | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'repositories' | 'deployments' | 'activity' | 'doctor' | 'settings'>('dashboard');
  const [doctorInitialPrompt, setDoctorInitialPrompt] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);

  // Dark mode is default and permanent
  useEffect(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('app_theme', 'dark');
  }, []);

  const toggleTheme = () => {};

  const setRenderApiKey = (key: string) => {
    setRenderApiKeyState(key);
    localStorage.setItem('render_api_key', key);
  };

  // Verify GitHub Token
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
      } else {
        setUser(null);
        setIsLoadingUser(false);
        return false;
      }
    } catch (e) {
      setUser(null);
      setIsLoadingUser(false);
      return false;
    }
  };

  useEffect(() => {
    if (token) {
      verifyToken(token);
    } else {
      setIsLoadingUser(false);
    }
    refreshActivities();
    refreshDeployments();
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
      // Ignore
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
      // Ignore
    }
  };

  const refreshDeployments = async () => {
    try {
      const res = await fetch('/api/render/deployments');
      if (res.ok) {
        const data = await res.json();
        setDeployments(data.deployments || []);
      }
    } catch (e) {
      // Ignore
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
        renderApiKey,
        setRenderApiKey,
        theme,
        toggleTheme,
        currentZip,
        setCurrentZip,
        activeTab,
        setActiveTab,
        doctorInitialPrompt,
        openDoctorWithPrompt,
        clearDoctorPrompt,
        activities,
        refreshActivities,
        deployments,
        refreshDeployments,
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
