/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
  hasRenderYaml: boolean;
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

export interface CreatedRepoResult {
  repository: {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    html_url: string;
    description: string;
    default_branch: string;
  };
  commitSha: string;
  commitUrl: string;
  totalFiles: number;
  branch: string;
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

export interface PreparedChange {
  path: string;
  action: 'create' | 'update';
  rationale: string;
  content: string;
}

export interface RenderPreparationResult {
  ready: boolean;
  projectType: string;
  runtime: 'static' | 'node' | 'python' | 'docker';
  summary: string;
  proposedChanges: PreparedChange[];
  environmentVariables: Array<{
    key: string;
    value: string;
    required: boolean;
    description: string;
  }>;
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
  type: 'upload' | 'repo_create' | 'push_files' | 'deployment' | 'ai_action' | 'error' | 'settings';
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
