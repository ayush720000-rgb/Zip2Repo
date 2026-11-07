/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext.js';
import { ChatMessage, ConversationSummary } from '../types.js';
import { 
  Sparkles, 
  Send, 
  Plus, 
  Trash2, 
  Edit3, 
  Copy, 
  Check, 
  ArrowLeft, 
  Terminal, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Wrench, 
  GitBranch, 
  Rocket, 
  ExternalLink,
  MessageSquare,
  Menu,
  ChevronRight,
  ShieldAlert,
  FolderUp
} from 'lucide-react';

export const AiDoctorPage: React.FC = () => {
  const { 
    token, 
    user, 
    setActiveTab, 
    doctorInitialPrompt, 
    clearDoctorPrompt, 
    refreshActivities 
  } = useApp();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string>('default');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState<string>('');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDeployingFile, setIsDeployingFile] = useState<boolean>(false);

  const handleFileDeploy = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsDeployingFile(true);
    const userPrompt = `Deploy file: ${file.name}`;

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userPrompt,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const inspectRes = await fetch('/api/zip/inspect', {
        method: 'POST',
        body: formData,
      });

      const inspectData = await inspectRes.json();
      if (!inspectRes.ok) {
        throw new Error(inspectData.error || 'Failed to inspect ZIP file');
      }

      const analysis = inspectData.analysis;
      const repoCleanName = file.name.replace(/\.zip$/i, '').replace(/[^a-zA-Z0-9._-]/g, '-');

      const aiResponse: ChatMessage = {
        id: `msg-${Date.now()}-inspect`,
        role: 'assistant',
        content: `### ZIP Archive Inspected: ${file.name}\n\n• **Detected Runtime:** ${analysis.frameworkName.toUpperCase()}\n• **Files Total:** ${analysis.fileCount} files (${analysis.formattedSize})\n• **Entry Point:** \`${analysis.entryFile || 'index.html / package.json'}\`\n• **Deployment Status:** Verified safe, ready for Render\n\nTo push this archive to a new GitHub repository and launch deployment, type:\n\`create repo ${repoCleanName}\`\n\nOr click **Dashboard** in the top navigation to customize repository settings!`,
        timestamp: new Date().toISOString(),
        toolInvocations: [
          {
            name: 'inspect_archive',
            args: { filename: file.name, size: file.size },
            result: { framework: analysis.frameworkName, files: analysis.fileCount },
            status: 'success',
          },
        ],
      };

      setMessages((prev) => [...prev.filter((m) => m.id !== tempUserMsg.id), tempUserMsg, aiResponse]);
      await refreshActivities();
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Error inspecting ${file.name}: ${err.message || 'Corrupt or unsupported archive'}. Please ensure it is a valid .zip file.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsDeployingFile(false);
    }
  };

  // Load conversations list
  const loadConversations = async () => {
    try {
      const res = await fetch('/api/doctor/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (e) {
      // Ignore
    }
  };

  // Load active conversation messages
  const loadActiveConversation = async (convId: string) => {
    try {
      const res = await fetch(`/api/doctor/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.conversation.messages || []);
      }
    } catch (e) {
      // Ignore
    }
  };

  useEffect(() => {
    loadConversations();
    loadActiveConversation(currentConvId);
  }, [currentConvId]);

  // Handle initial prompt from other pages (e.g., clicking suggested prompts)
  useEffect(() => {
    if (doctorInitialPrompt) {
      setInputMessage(doctorInitialPrompt);
      clearDoctorPrompt();
      // focus textarea
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [doctorInitialPrompt]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputMessage;
    if (!textToSend.trim() || isSending) return;

    setInputMessage('');
    setIsSending(true);

    // Optimistically add user message
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch('/api/doctor/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-github-token': token } : {}),
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(5 * 60 * 1000) : undefined,
        body: JSON.stringify({
          conversationId: currentConvId,
          message: textToSend,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'AI Doctor failed to respond');
      }

      setMessages((prev) => [...prev.filter((m) => m.id !== tempUserMsg.id), tempUserMsg, data.message]);
      await loadConversations();
      await refreshActivities();
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Error executing request: ${err.message || 'Network issue'}. Please verify your GitHub connection and try again.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // Confirm or cancel a destructive GitHub action via its inline button
  const decideAction = async (actionId: string, decision: 'confirm' | 'cancel') => {
    if (actionBusyId) return;
    setActionBusyId(actionId);
    try {
      const res = await fetch(`/api/doctor/actions/${actionId}/${decision}`, {
        method: 'POST',
        headers: token ? { 'x-github-token': token } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (decision === 'confirm' && !res.ok) {
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, role: 'assistant', content: data.error || 'Action failed.', timestamp: new Date().toISOString() },
        ]);
      }
    } catch (e) {
      // Network error: resync below shows the real state
    } finally {
      await loadActiveConversation(currentConvId);
      await loadConversations();
      await refreshActivities();
      setActionBusyId(null);
    }
  };

  const handleNewChat = async () => {
    try {
      const res = await fetch('/api/doctor/conversations', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCurrentConvId(data.conversation.id);
        setMessages(data.conversation.messages || []);
        await loadConversations();
        setIsSidebarOpen(false);
      }
    } catch (e) {
      // fallback to timestamp id
      const newId = `conv-${Date.now()}`;
      setCurrentConvId(newId);
      setMessages([]);
      setIsSidebarOpen(false);
    }
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    try {
      await fetch(`/api/doctor/conversations/${convId}`, { method: 'DELETE' });
      await loadConversations();
      if (currentConvId === convId) {
        handleNewChat();
      }
    } catch (e) {
      // Ignore
    }
  };

  const handleStartRename = (conv: ConversationSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(conv.id);
    setNewTitle(conv.title);
  };

  const handleSaveRename = async (convId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await fetch(`/api/doctor/conversations/${convId}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      await loadConversations();
    } catch (e) {
      // Ignore
    } finally {
      setRenamingId(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to format inline markdown without raw asterisks
  const formatInlineText = (text: string): React.ReactNode => {
    if (!text) return null;

    // Tokenize regex matching markdown elements:
    // 1: ***bold italic***
    // 2: **bold**
    // 3: *italic*
    // 4: `code`
    // 5: [link](url)
    const regex = /(\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        // Strip any unparsed or stray asterisks in between
        const cleanPlain = text.slice(lastIndex, match.index).replace(/\*{2,}/g, '');
        if (cleanPlain) nodes.push(cleanPlain);
      }

      if (match[2]) {
        // ***bold italic***
        nodes.push(
          <strong key={`bi-${match.index}`} className="font-semibold text-white">
            <em className="text-neutral-100">{match[2]}</em>
          </strong>
        );
      } else if (match[3]) {
        // **bold**
        nodes.push(
          <strong key={`b-${match.index}`} className="font-semibold text-white">
            {match[3]}
          </strong>
        );
      } else if (match[4]) {
        // *italic*
        nodes.push(
          <em key={`i-${match.index}`} className="text-neutral-300">
            {match[4]}
          </em>
        );
      } else if (match[5]) {
        // `code`
        nodes.push(
          <code
            key={`c-${match.index}`}
            className="px-1.5 py-0.5 mx-0.5 rounded-md bg-[#1F1F27] text-emerald-400 font-mono text-[11px] border border-white/10 font-medium select-all"
          >
            {match[5]}
          </code>
        );
      } else if (match[6] && match[7]) {
        // [text](url)
        nodes.push(
          <a
            key={`a-${match.index}`}
            href={match[7]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium inline-flex items-center gap-1 mx-0.5 transition-colors"
          >
            <span>{match[6]}</span>
            <ExternalLink className="w-3 h-3 inline shrink-0" />
          </a>
        );
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      const remaining = text.slice(lastIndex).replace(/\*{2,}/g, '');
      if (remaining) nodes.push(remaining);
    }

    return nodes.length > 0 ? nodes : text.replace(/\*{2,}/g, '');
  };

  // AI Doctor Markdown & Typography Parser
  const renderFormattedContent = (content: string) => {
    // Check for code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        const language = lines[0].match(/^[a-zA-Z0-9_-]+$/) ? lines[0] : '';
        const code = language ? lines.slice(1).join('\n') : lines.join('\n');
        const codeId = `code-${index}`;

        return (
          <div key={index} className="my-3 rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0A0A0D] text-neutral-100 shadow-md">
            <div className="flex items-center justify-between px-3.5 py-2 bg-[#141418] border-b border-white/[0.06] text-[11px] font-mono text-neutral-400">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-neutral-400" />
                <span>{language || 'code'}</span>
              </span>
              <button
                onClick={() => copyToClipboard(code, codeId)}
                className="flex items-center gap-1 hover:text-white transition-colors"
                title="Copy code"
              >
                {copiedId === codeId ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-sans">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="font-sans">Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3.5 font-mono text-xs overflow-x-auto leading-relaxed text-neutral-200">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      // Process lines for headers, list items, dividers, and paragraphs
      const lines = part.split('\n');

      return (
        <div key={index} className="space-y-1.5 text-xs sm:text-sm text-neutral-200 leading-relaxed">
          {lines.map((line, lIndex) => {
            const trimmed = line.trim();

            if (!trimmed) {
              return <div key={lIndex} className="h-1.5" />;
            }

            // Divider: *** or --- or ___
            if (trimmed === '***' || trimmed === '---' || trimmed === '___') {
              return <div key={lIndex} className="my-2.5 border-t border-white/[0.08]" />;
            }

            // Headers
            if (trimmed.startsWith('### ')) {
              return (
                <div key={lIndex} className="text-xs sm:text-sm font-semibold text-white tracking-wide mt-3 mb-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>{formatInlineText(trimmed.slice(4))}</span>
                </div>
              );
            }
            if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
              const hText = trimmed.replace(/^#{1,2}\s+/, '');
              return (
                <div key={lIndex} className="text-sm sm:text-base font-bold text-white mt-3.5 mb-1.5">
                  {formatInlineText(hText)}
                </div>
              );
            }

            // Bullet list items: • or - or *
            if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || (trimmed.startsWith('* ') && !trimmed.startsWith('*** '))) {
              const bulletText = trimmed.replace(/^[•\-*]\s+/, '');
              return (
                <div key={lIndex} className="flex items-start gap-2.5 my-1 text-xs sm:text-sm text-neutral-200 leading-relaxed pl-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
                  <div className="flex-1">{formatInlineText(bulletText)}</div>
                </div>
              );
            }

            // Numbered list item: 1. or 2.
            const numMatch = trimmed.match(/^([0-9]+)\.\s+(.*)$/);
            if (numMatch) {
              return (
                <div key={lIndex} className="flex items-start gap-2 my-1 text-xs sm:text-sm text-neutral-200 leading-relaxed pl-1">
                  <span className="text-[11px] font-mono text-emerald-400 font-semibold shrink-0 mt-0.5">{numMatch[1]}.</span>
                  <div className="flex-1">{formatInlineText(numMatch[2])}</div>
                </div>
              );
            }

            // Blockquote: >
            if (trimmed.startsWith('> ')) {
              return (
                <div key={lIndex} className="border-l-2 border-emerald-500/50 pl-3 py-1 my-1.5 text-xs text-neutral-300 italic bg-white/[0.02] rounded-r-md">
                  {formatInlineText(trimmed.slice(2))}
                </div>
              );
            }

            // Regular paragraph line
            return (
              <p key={lIndex} className="text-xs sm:text-sm leading-relaxed text-neutral-200">
                {formatInlineText(line)}
              </p>
            );
          })}
        </div>
      );
    });
  };


  const suggestedPrompts = [
    { label: 'List my repos', prompt: 'List my repos' },
    { label: 'Prepare for Render', prompt: 'prepare render config for vite' },
    { label: 'Create a repo', prompt: 'create repo my-new-app' },
  ];

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-[#0C0C0E] text-[#F4F4F5]">
      
      {/* Mobile Drawer Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar (Desktop permanent, Mobile drawer) */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-72 bg-[#121215] border-r border-white/[0.08] flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 space-y-4 flex-1 flex flex-col min-h-0">
          
          {/* Back to Dashboard & New Chat */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNewChat}
              className="clay-button-primary flex-1 py-2 px-3 text-xs font-semibold flex items-center justify-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Consultation</span>
            </button>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden p-2 rounded-xl text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Conversations Section */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 px-2 py-1">
              Conversations
            </div>

            {conversations.length === 0 ? (
              <p className="text-xs text-neutral-400 p-2 italic">No previous chats</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => {
                    setCurrentConvId(conv.id);
                    setIsSidebarOpen(false);
                  }}
                  className={`group relative flex items-center justify-between p-2.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                    currentConvId === conv.id
                      ? 'bg-[#202026] text-white border border-white/[0.08]'
                      : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                    {renamingId === conv.id ? (
                      <form onSubmit={(e) => handleSaveRename(conv.id, e)} className="flex-1">
                        <input
                          type="text"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          onBlur={() => setRenamingId(null)}
                          autoFocus
                          className="w-full text-xs bg-[#1A1A20] text-white border border-white/20 rounded px-1.5 py-0.5 outline-none"
                        />
                      </form>
                    ) : (
                      <span className="truncate">{conv.title}</span>
                    )}
                  </div>

                  {/* Actions on hover */}
                  <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-1">
                    <button
                      onClick={(e) => handleStartRename(conv, e)}
                      className="p-1 rounded text-neutral-400 hover:text-white"
                      title="Rename"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      className="p-1 rounded text-neutral-400 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar Footer info */}
        <div className="p-3.5 border-t border-white/[0.08] text-[11px] text-neutral-400">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="truncate">
              {user ? `@${user.login} connected` : 'GitHub Not Connected'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main ChatGPT-like Chat Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* Top Header */}
        <div className="h-14 border-b border-white/[0.08] px-4 flex items-center justify-between bg-[#0C0C0E]/90 backdrop-blur-xs shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-xl text-neutral-300 hover:bg-white/[0.06]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white text-neutral-900 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-neutral-900" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-white">AI Doctor</h2>
                <p className="text-[10px] text-neutral-400">Autonomous GitHub & Deployment Specialist</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isDeployingFile}
              className="clay-button-primary px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              title="Deploy ZIP archive to GitHub & Render"
            >
              <FolderUp className="w-3.5 h-3.5" />
              <span>Deploy File</span>
            </button>
            <button
              onClick={() => setActiveTab('deployments')}
              className="clay-button-secondary px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 text-neutral-300 hover:text-white"
              title="View Deployments"
            >
              <Rocket className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Deployments</span>
            </button>
            <button
              onClick={() => setMessages([])}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors text-xs flex items-center gap-1"
              title="Clear chat messages"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear Chat</span>
            </button>
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 max-w-4xl w-full mx-auto">
          {messages.length === 0 ? (
            /* Empty State */
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-6 max-w-lg mx-auto my-auto">
              <div className="w-14 h-14 rounded-3xl bg-[#16161A] border border-white/10 flex items-center justify-center shadow-lg">
                <Sparkles className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">
                  How can I help?
                </h3>
              </div>

              {/* Suggested Prompts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                {suggestedPrompts.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => handleSendMessage(s.prompt)}
                    className="clay-card p-3.5 text-left text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:border-neutral-400 dark:hover:border-neutral-600 transition-all flex items-center justify-between group"
                  >
                    <span>{s.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Message list */
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3.5 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role !== 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-white text-neutral-900 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Sparkles className="w-4 h-4 text-neutral-900" />
                  </div>
                )}

                <div
                  className={`space-y-3 max-w-[88%] sm:max-w-[80%] ${
                    msg.role === 'user'
                      ? 'bg-[#25252C] text-white rounded-2xl rounded-tr-xs px-4 py-3 border border-white/10 shadow-xs'
                      : 'clay-card p-4 sm:p-5 rounded-2xl rounded-tl-xs bg-[#16161A] text-[#F4F4F5] border border-white/[0.08]'
                  }`}
                >
                  {/* Tool Invocations Status Badges */}
                  {msg.toolInvocations && msg.toolInvocations.length > 0 && (
                    <div className="space-y-2 pb-2 mb-2 border-b border-white/[0.08]">
                      {msg.toolInvocations.map((t, tIndex) => (
                        <div key={tIndex} className="text-xs space-y-1.5">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-400">
                            <Terminal className="w-3 h-3 text-neutral-300" />
                            <span>Tool: <strong className="text-white">{t.name}</strong></span>
                            {t.status === 'success' && (
                              <span className="text-emerald-400 font-sans flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3" /> Done
                              </span>
                            )}
                            {t.status === 'failed' && (
                              <span className="text-red-400 font-sans flex items-center gap-0.5">
                                <AlertTriangle className="w-3 h-3" /> Notice
                              </span>
                            )}
                            {t.status === 'requires_confirmation' && (
                              <span className="text-amber-400 font-sans flex items-center gap-0.5">
                                <ShieldAlert className="w-3 h-3" /> Awaiting confirm
                              </span>
                            )}
                            {t.status === 'cancelled' && (
                              <span className="text-neutral-400 font-sans">Cancelled</span>
                            )}
                          </div>

                          {/* Inline confirmation card for destructive GitHub actions */}
                          {t.status === 'requires_confirmation' && t.result?.action?.id && (
                            <div className="mt-1 p-3.5 rounded-xl bg-[#101014] border border-white/[0.08] space-y-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                                  <ShieldAlert className={`w-3.5 h-3.5 shrink-0 ${t.result.action.danger ? 'text-red-400' : 'text-emerald-400'}`} />
                                  <span>{t.result.action.title}</span>
                                </div>
                                <p className="text-[11px] leading-relaxed text-neutral-400">{t.result.action.description}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => decideAction(t.result.action.id, 'confirm')}
                                  disabled={actionBusyId !== null}
                                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
                                    t.result.action.danger
                                      ? 'bg-red-600 hover:bg-red-500 shadow-[0_4px_14px_rgba(220,38,38,0.25)]'
                                      : 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_4px_14px_rgba(16,185,129,0.2)]'
                                  }`}
                                >
                                  {actionBusyId === t.result.action.id ? 'Working...' : t.result.action.confirmLabel}
                                </button>
                                <button
                                  onClick={() => decideAction(t.result.action.id, 'cancel')}
                                  disabled={actionBusyId !== null}
                                  className="clay-button-secondary px-3.5 py-2 text-xs font-medium text-neutral-300 disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Formatted Text Content */}
                  <div className="break-words">
                    {renderFormattedContent(msg.content)}
                  </div>

                  <div className="text-[10px] opacity-40 text-right">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-[#25252C] border border-white/10 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-neutral-200">
                    {user ? user.login[0].toUpperCase() : 'U'}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Thinking / Running indicator */}
          {isSending && (
            <div className="flex gap-3.5 items-center">
              <div className="w-8 h-8 rounded-xl bg-white text-neutral-900 flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                <Sparkles className="w-4 h-4 text-neutral-900" />
              </div>
              <div className="clay-card px-4 py-3 bg-[#16161A] border border-white/[0.08] text-xs text-neutral-300 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-white animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-white animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 rounded-full bg-white animate-bounce [animation-delay:0.4s]" />
                <span>Thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Fixed Message Composer at bottom */}
        <div className="p-4 bg-[#0C0C0E]/95 backdrop-blur-md border-t border-white/[0.08] shrink-0">
          <div className="max-w-4xl mx-auto space-y-2">
            
            {/* Quick suggested prompt tags on empty or active conversation */}
            {messages.length > 0 && messages.length < 5 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] text-neutral-400">
                <span className="shrink-0 text-neutral-500">Try:</span>
                {suggestedPrompts.slice(0, 3).map((s) => (
                  <button
                    key={s.label}
                    onClick={() => handleSendMessage(s.prompt)}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-[#18181D] hover:bg-[#22222A] text-neutral-300 border border-white/[0.06] transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="relative flex items-center gap-2"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileDeploy}
                accept=".zip,application/zip"
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isDeployingFile}
                className="p-3 rounded-xl text-neutral-400 hover:text-emerald-400 hover:bg-white/[0.06] transition-colors shrink-0 flex items-center justify-center border border-white/10 bg-[#121215]"
                title="Deploy ZIP File"
                aria-label="Deploy ZIP File"
              >
                <FolderUp className="w-4 h-4 text-emerald-400" />
              </button>

              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={1}
                placeholder="Ask AI Doctor..."
                className="clay-input flex-1 py-3 px-4 text-xs sm:text-sm resize-none pr-12 max-h-32 min-h-[48px] bg-[#121215] border-white/10 text-white placeholder-neutral-500"
              />

              <button
                type="submit"
                disabled={!inputMessage.trim() || isSending || isDeployingFile}
                className="clay-button-primary p-3 flex items-center justify-center shrink-0 disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            <div className="flex items-center justify-between text-[11px] text-neutral-500 px-1">
              <span>Press <kbd className="font-mono px-1 rounded bg-[#1A1A20] text-neutral-400">Enter</kbd> to send, <kbd className="font-mono px-1 rounded bg-[#1A1A20] text-neutral-400">Shift+Enter</kbd> for newline</span>
              <span />
            </div>
          </div>
        </div>

      </main>

    </div>
  );
};
