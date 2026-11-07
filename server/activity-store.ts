/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ActivityEvent {
  id: string;
  type: 'upload' | 'repo_create' | 'push_files' | 'deployment' | 'ai_action' | 'error' | 'settings';
  title: string;
  description: string;
  timestamp: string;
  status: 'success' | 'pending' | 'failed' | 'warning';
  metadata?: Record<string, any>;
}

export interface DeploymentRecord {
  id: string;
  projectName: string;
  repoName: string;
  repoUrl: string;
  provider: 'render';
  status: 'ready' | 'queued' | 'building' | 'deploying' | 'live' | 'failed';
  liveUrl?: string;
  commitSha?: string;
  branch: string;
  serviceId?: string;
  createdAt: string;
  updatedAt: string;
  logs: string[];
  configSummary?: string;
}

class Store {
  private activities: ActivityEvent[] = [
    {
      id: 'act-init',
      type: 'settings',
      title: 'Zip2Repo Initialized',
      description: 'System ready for archive uploads and repository management.',
      timestamp: new Date().toISOString(),
      status: 'success',
    },
  ];

  private deployments: DeploymentRecord[] = [];

  getActivities(): ActivityEvent[] {
    return [...this.activities].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  logActivity(event: Omit<ActivityEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): ActivityEvent {
    const item: ActivityEvent = {
      id: event.id || `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: event.timestamp || new Date().toISOString(),
      ...event,
    };
    this.activities.unshift(item);
    if (this.activities.length > 200) {
      this.activities.pop();
    }
    return item;
  }

  getDeployments(): DeploymentRecord[] {
    return [...this.deployments].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  getDeployment(id: string): DeploymentRecord | undefined {
    return this.deployments.find((d) => d.id === id);
  }

  createDeployment(record: Omit<DeploymentRecord, 'id' | 'createdAt' | 'updatedAt' | 'logs'> & { logs?: string[] }): DeploymentRecord {
    const now = new Date().toISOString();
    const deployment: DeploymentRecord = {
      id: `dep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      updatedAt: now,
      logs: record.logs || [
        `[${now}] Deployment initialized for repository ${record.repoName}`,
        `[${now}] Detected project configuration and assigned provider: Render`,
      ],
      ...record,
    };
    this.deployments.unshift(deployment);
    return deployment;
  }

  updateDeployment(id: string, updates: Partial<DeploymentRecord>): DeploymentRecord | undefined {
    const index = this.deployments.findIndex((d) => d.id === id);
    if (index === -1) return undefined;
    const now = new Date().toISOString();
    const current = this.deployments[index];
    const newLogs = updates.logs ? [...current.logs, ...updates.logs] : current.logs;

    const updated: DeploymentRecord = {
      ...current,
      ...updates,
      logs: newLogs,
      updatedAt: now,
    };
    this.deployments[index] = updated;
    return updated;
  }
}

export const activityStore = new Store();
