export interface ActivityEvent {
  id: string;
  type: 'upload' | 'repo_create' | 'push_files' | 'ai_action' | 'error' | 'settings';
  title: string;
  description: string;
  timestamp: string;
  status: 'success' | 'pending' | 'failed' | 'warning';
  metadata?: Record<string, any>;
}

class Store {
  private activities: ActivityEvent[] = [
    {
      id: 'act-init',
      type: 'settings',
      title: 'Zip2Repo started',
      description: 'Ready to inspect ZIP archives and push them to GitHub.',
      timestamp: new Date().toISOString(),
      status: 'success',
    },
  ];

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
}

export const activityStore = new Store();
