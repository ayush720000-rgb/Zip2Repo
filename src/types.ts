export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  total_private_repos?: number;
  scopes: string[];
  rateLimitRemaining?: number;
  rateLimitLimit?: number;
}

export interface PotentialIssue {
  type: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation?: string;
}

export interface ProjectAnalysis {
  projectType: 'vite' | 'nextjs' | 'react' | 'nodejs' | 'python' | 'static_html' | 'unknown';
  frameworkName: string;
  fileCount: number;
  totalUncompressedBytes: number;
  formattedSize: string;
  hasPackageJson: boolean;
  packageDetails?: {
    name?: string;
    version?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    engines?: Record<string, string>;
  };
  hasGitIgnore: boolean;
  hasDockerfile: boolean;
  potentialIssues: PotentialIssue[];
  suggestedRepoName: string;
  suggestedDescription: string;
  topLevelFiles: string[];
}

export interface InspectedZipData {
  uploadId: string;
  filename: string;
  analysis: ProjectAnalysis;
  filesPreview: string[];
}

export interface GitHubRepoRef {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string;
  default_branch: string;
}

export interface CreatedRepoResult {
  repository: GitHubRepoRef;
  commitSha: string;
  commitUrl: string;
  totalFiles: number;
  branch: string;
  mode?: 'new' | 'existing';
  gitignoreAdded?: boolean;
}

/** A repository the connected account can push to. */
export interface PushTarget {
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  default_branch: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolInvocations?: Array<{
    name: string;
    args: Record<string, any>;
    result?: any;
    status: 'running' | 'success' | 'failed' | 'requires_confirmation' | 'cancelled';
  }>;
  suggestedActions?: Array<{
    label: string;
    action: string;
    payload?: any;
  }>;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface ActivityEvent {
  id: string;
  type: 'upload' | 'repo_create' | 'push_files' | 'ai_action' | 'error' | 'settings';
  title: string;
  description: string;
  timestamp: string;
  status: 'success' | 'pending' | 'failed' | 'warning';
  metadata?: Record<string, any>;
}

export interface GitHubRepoItem {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
}
