/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import path from 'path';

// Text that must never appear in a repo description (AI-builder branding, etc.)
const BLOCKED_DESCRIPTION = /ai\s*studio|aistudio|google\s*ai|made\s+with|generated\s+by|built\s+with\s+(google|gemini|bolt|lovable|v0)/i;

/** Returns a clean description, or the fallback when the text is blocked or empty. */
export function cleanDescription(text: unknown, fallback: string): string {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value || BLOCKED_DESCRIPTION.test(value)) return fallback;
  return value.slice(0, 350);
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
  potentialIssues: Array<{
    type: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    recommendation?: string;
  }>;
  suggestedRepoName: string;
  suggestedDescription: string;
  topLevelFiles: string[];
}

export interface ExtractedFile {
  path: string;
  content: Buffer;
  isBinary: boolean;
  size: number;
}

const MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024; // 250MB
const MAX_FILE_COUNT = 5000;
const MAX_SINGLE_FILE_BYTES = 40 * 1024 * 1024; // 40MB per single file (GitHub Git Data API limit is 100MB, 40MB safe)

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function sanitizePath(filePath: string): string | null {
  // Normalize path separators
  let normalized = filePath.replace(/\\/g, '/');
  
  // Guard against path traversal attacks (Zip Slip)
  if (normalized.includes('..') || normalized.startsWith('/') || normalized.includes('\0')) {
    return null;
  }
  
  // Clean path
  normalized = path.posix.normalize(normalized);
  if (normalized.startsWith('../') || normalized === '..') {
    return null;
  }

  return normalized;
}

function isExcludedPath(filePath: string): boolean {
  const parts = filePath.split('/');
  const excludedDirs = ['node_modules', '.git', '__pycache__', '.venv', 'venv', '.idea', '.vscode', '.next', 'dist', 'build', '.cache'];
  const excludedFiles = ['.DS_Store', 'Thumbs.db'];

  for (const part of parts) {
    if (excludedDirs.includes(part)) return true;
  }

  const fileName = parts[parts.length - 1];
  if (excludedFiles.includes(fileName)) return true;

  return false;
}

export async function inspectZip(buffer: Buffer, originalFilename?: string): Promise<{
  analysis: ProjectAnalysis;
  fileList: string[];
}> {
  const zip = new JSZip();
  let zipContent: JSZip;

  try {
    zipContent = await zip.loadAsync(buffer);
  } catch (err: any) {
    throw new Error(`Failed to parse ZIP archive: ${err.message || 'Corrupted file'}`);
  }

  const entries = Object.keys(zipContent.files);
  if (entries.length === 0) {
    throw new Error('ZIP archive is empty');
  }

  if (entries.length > MAX_FILE_COUNT) {
    throw new Error(`Archive exceeds maximum permitted file count (${MAX_FILE_COUNT} files). Found ${entries.length} files.`);
  }

  let totalSize = 0;
  const validFiles: Array<{ name: string; zipEntry: JSZip.JSZipObject }> = [];
  const topLevelSet = new Set<string>();

  // Detect if there's a common single root directory wrapper (e.g., repo-main/...)
  const nonDirEntries = entries.filter((e) => !zipContent.files[e].dir);
  let commonPrefix = '';
  if (nonDirEntries.length > 0) {
    const firstParts = nonDirEntries[0].split('/');
    if (firstParts.length > 1) {
      const candidate = firstParts[0] + '/';
      const allShare = nonDirEntries.every((e) => e.startsWith(candidate));
      if (allShare) {
        commonPrefix = candidate;
      }
    }
  }

  for (const entryName of entries) {
    const entry = zipContent.files[entryName];
    if (entry.dir) continue;

    const sanitized = sanitizePath(entryName);
    if (!sanitized) {
      throw new Error(`Security validation failure: illegal path traversal detected in archive entry "${entryName}"`);
    }

    // Strip common directory prefix if present
    const relativePath = commonPrefix && sanitized.startsWith(commonPrefix)
      ? sanitized.substring(commonPrefix.length)
      : sanitized;

    if (!relativePath) continue;

    validFiles.push({ name: relativePath, zipEntry: entry });

    // Track top-level files
    const topPart = relativePath.split('/')[0];
    if (topPart) topLevelSet.add(topPart);
  }

  // Check file contents for package.json, requirements.txt, etc.
  let packageJsonContent: any = null;
  let hasGitIgnore = false;
  let hasDockerfile = false;
  let hasRenderYaml = false;
  let hasViteConfig = false;
  let hasNextConfig = false;
  let hasIndexHtml = false;
  let hasPythonRequirements = false;
  let hasPythonFiles = false;
  let hasLargeFiles = false;

  const potentialIssues: ProjectAnalysis['potentialIssues'] = [];

  for (const file of validFiles) {
    const fileName = file.name.toLowerCase();

    if (fileName === '.gitignore') hasGitIgnore = true;
    if (fileName === 'dockerfile') hasDockerfile = true;
    if (fileName === 'render.yaml' || fileName === 'render.yml') hasRenderYaml = true;
    if (fileName.includes('vite.config')) hasViteConfig = true;
    if (fileName.includes('next.config')) hasNextConfig = true;
    if (fileName === 'index.html') hasIndexHtml = true;
    if (fileName === 'requirements.txt' || fileName === 'pyproject.toml' || fileName === 'pipfile') hasPythonRequirements = true;
    if (fileName.endsWith('.py')) hasPythonFiles = true;

    if (file.name === 'package.json') {
      try {
        const text = await file.zipEntry.async('text');
        totalSize += text.length;
        packageJsonContent = JSON.parse(text);
      } catch (e) {
        potentialIssues.push({
          type: 'warning',
          title: 'Invalid package.json',
          description: 'A package.json was found, but it could not be parsed as valid JSON.',
        });
      }
    }
  }

  // Calculate total size safely
  for (const file of validFiles) {
    // Check uncompressed size via internal metadata or async length estimate
    const data = await file.zipEntry.async('nodebuffer');
    totalSize += data.length;

    if (data.length > MAX_SINGLE_FILE_BYTES) {
      hasLargeFiles = true;
      potentialIssues.push({
        type: 'warning',
        title: `Large File: ${file.name}`,
        description: `This file is ${formatBytes(data.length)}. Files over 40MB may cause issues during Git push or build steps.`,
      });
    }

    if (totalSize > MAX_UNCOMPRESSED_BYTES) {
      throw new Error(`Security validation failure: uncompressed size exceeds ${formatBytes(MAX_UNCOMPRESSED_BYTES)} safety limit.`);
    }
  }

  // Project framework detection logic
  let projectType: ProjectAnalysis['projectType'] = 'unknown';
  let frameworkName = 'Generic Project';

  if (hasNextConfig || (packageJsonContent && (packageJsonContent.dependencies?.next || packageJsonContent.devDependencies?.next))) {
    projectType = 'nextjs';
    frameworkName = 'Next.js';
  } else if (hasViteConfig || (packageJsonContent && (packageJsonContent.dependencies?.vite || packageJsonContent.devDependencies?.vite))) {
    projectType = 'vite';
    frameworkName = 'Vite + React / Web';
  } else if (packageJsonContent && (packageJsonContent.dependencies?.react || packageJsonContent.devDependencies?.react)) {
    projectType = 'react';
    frameworkName = 'React SPA';
  } else if (packageJsonContent) {
    projectType = 'nodejs';
    frameworkName = 'Node.js Application';
  } else if (hasPythonRequirements || hasPythonFiles) {
    projectType = 'python';
    frameworkName = 'Python';
  } else if (hasIndexHtml) {
    projectType = 'static_html';
    frameworkName = 'Static HTML / Web';
  }

  // Assess potential deployment issues
  if (!hasGitIgnore) {
    potentialIssues.push({
      type: 'warning',
      title: 'Missing .gitignore',
      description: 'The archive does not contain a .gitignore. Build artifacts, node_modules, or cache files might get pushed.',
      recommendation: 'Use "Make Render Ready" to automatically generate a standard .gitignore.',
    });
  }

  if (packageJsonContent) {
    const scripts = packageJsonContent.scripts || {};
    if (projectType === 'vite' || projectType === 'react' || projectType === 'nextjs') {
      if (!scripts.build) {
        potentialIssues.push({
          type: 'critical',
          title: 'Missing "build" script in package.json',
          description: 'Render and other cloud platforms require an "npm run build" script to compile the frontend application.',
          recommendation: 'Add "build": "vite build" or "next build" to package.json.',
        });
      }
    }

    if (projectType === 'nodejs') {
      if (!scripts.start) {
        potentialIssues.push({
          type: 'warning',
          title: 'Missing "start" script in package.json',
          description: 'Node.js services typically need "npm start" (e.g. "node index.js" or "node server.js") to boot on Render.',
          recommendation: 'Ensure your server entrypoint is referenced in package.json scripts.start.',
        });
      }
    }
  } else if (projectType === 'python' && !hasPythonRequirements) {
    potentialIssues.push({
      type: 'warning',
      title: 'Missing requirements.txt',
      description: 'Python dependencies were not found in a requirements.txt or pyproject.toml file.',
      recommendation: 'Export your packages using pip freeze > requirements.txt.',
    });
  }

  if (!hasRenderYaml) {
    potentialIssues.push({
      type: 'info',
      title: 'No render.yaml blueprint',
      description: 'The repository does not have a render.yaml file yet.',
      recommendation: 'Use "Make Render Ready" to generate a custom blueprint before deploying.',
    });
  }

  // Suggest clean repository name
  let rawName = originalFilename ? path.basename(originalFilename, path.extname(originalFilename)) : '';
  if (!rawName || rawName === 'archive' || rawName === 'project' || rawName === 'source') {
    rawName = packageJsonContent?.name || (commonPrefix ? commonPrefix.replace('/', '') : 'my-app');
  }

  const suggestedRepoName = rawName
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '') || 'my-project';

  const suggestedDescription = cleanDescription(
    packageJsonContent?.description,
    `${frameworkName} project deployed via Zip2Repo.`
  );

  return {
    analysis: {
      projectType,
      frameworkName,
      fileCount: validFiles.length,
      totalUncompressedBytes: totalSize,
      formattedSize: formatBytes(totalSize),
      hasPackageJson: !!packageJsonContent,
      packageDetails: packageJsonContent
        ? {
            name: packageJsonContent.name,
            version: packageJsonContent.version,
            scripts: packageJsonContent.scripts,
            dependencies: packageJsonContent.dependencies,
            devDependencies: packageJsonContent.devDependencies,
            engines: packageJsonContent.engines,
          }
        : undefined,
      hasGitIgnore,
      hasDockerfile,
      hasRenderYaml,
      potentialIssues,
      suggestedRepoName,
      suggestedDescription,
      topLevelFiles: Array.from(topLevelSet).slice(0, 15),
    },
    fileList: validFiles.map((f) => f.name),
  };
}

export async function extractAndPrepareFiles(buffer: Buffer): Promise<ExtractedFile[]> {
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(buffer);
  const entries = Object.keys(zipContent.files);

  // Detect common prefix wrapper
  const nonDirEntries = entries.filter((e) => !zipContent.files[e].dir);
  let commonPrefix = '';
  if (nonDirEntries.length > 0) {
    const firstParts = nonDirEntries[0].split('/');
    if (firstParts.length > 1) {
      const candidate = firstParts[0] + '/';
      const allShare = nonDirEntries.every((e) => e.startsWith(candidate));
      if (allShare) {
        commonPrefix = candidate;
      }
    }
  }

  const extracted: ExtractedFile[] = [];

  for (const entryName of entries) {
    const entry = zipContent.files[entryName];
    if (entry.dir) continue;

    const sanitized = sanitizePath(entryName);
    if (!sanitized) continue;

    const relativePath = commonPrefix && sanitized.startsWith(commonPrefix)
      ? sanitized.substring(commonPrefix.length)
      : sanitized;

    if (!relativePath || isExcludedPath(relativePath)) {
      continue;
    }

    const contentBuffer = await entry.async('nodebuffer');

    // Simple heuristic to detect binary files
    let isBinary = false;
    const sampleLength = Math.min(contentBuffer.length, 512);
    for (let i = 0; i < sampleLength; i++) {
      if (contentBuffer[i] === 0) {
        isBinary = true;
        break;
      }
    }

    extracted.push({
      path: relativePath,
      content: contentBuffer,
      isBinary,
      size: contentBuffer.length,
    });
  }

  return extracted;
}
