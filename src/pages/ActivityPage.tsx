/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import { ActivityEvent } from '../types.js';
import { 
  Activity, 
  FolderArchive, 
  GitBranch, 
  Rocket, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw,
  Clock
} from 'lucide-react';

export const ActivityPage: React.FC = () => {
  const { activities, refreshActivities } = useApp();
  const [filterType, setFilterType] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshActivities();
    setIsRefreshing(false);
  };

  const filteredActivities = activities.filter((act) => {
    if (filterType === 'all') return true;
    if (filterType === 'upload') return act.type === 'upload';
    if (filterType === 'repo') return act.type === 'repo_create' || act.type === 'push_files';
    if (filterType === 'deployment') return act.type === 'deployment';
    if (filterType === 'ai') return act.type === 'ai_action';
    return true;
  });

  const getEventIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'upload':
        return <FolderArchive className="w-4 h-4 text-blue-500" />;
      case 'repo_create':
      case 'push_files':
        return <GitBranch className="w-4 h-4 text-purple-500" />;
      case 'deployment':
        return <Rocket className="w-4 h-4 text-emerald-500" />;
      case 'ai_action':
        return <Sparkles className="w-4 h-4 text-amber-500" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-neutral-500" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">Activity Log</h1>
          <p className="text-xs text-neutral-500">Audit trail of uploads, repository operations, deployments, and AI Doctor actions.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="clay-button-secondary p-2.5 text-xs font-semibold self-start sm:self-auto flex items-center gap-1.5"
          title="Refresh activity logs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-neutral-200/50 dark:bg-neutral-800/50 rounded-xl overflow-x-auto border border-neutral-300/30 dark:border-neutral-700/30">
        {[
          { id: 'all', label: 'All Events' },
          { id: 'upload', label: 'Uploads' },
          { id: 'repo', label: 'GitHub Ops' },
          { id: 'deployment', label: 'Deployments' },
          { id: 'ai', label: 'AI Doctor' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterType(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
              filterType === tab.id
                ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Timeline List */}
      {filteredActivities.length === 0 ? (
        <div className="clay-card p-12 text-center text-xs text-neutral-500">
          No activity logs recorded under this category.
        </div>
      ) : (
        <div className="relative pl-6 space-y-4 border-l-2 border-neutral-200 dark:border-neutral-800 ml-3">
          {filteredActivities.map((event) => (
            <div key={event.id} className="relative group">
              {/* Timeline marker */}
              <div className="absolute -left-[31px] top-3.5 w-6 h-6 rounded-full bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                {getEventIcon(event.type)}
              </div>

              {/* Event card */}
              <div className="clay-card p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 hover:border-neutral-300 dark:hover:border-neutral-700 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h4 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white">
                    {event.title}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(event.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                <p className="text-xs text-neutral-500 leading-relaxed">
                  {event.description}
                </p>

                {event.metadata && (
                  <div className="pt-1.5 flex flex-wrap items-center gap-2">
                    {Object.entries(event.metadata).map(([key, val]) => (
                      <span key={key} className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                        {key}: {String(val)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};
