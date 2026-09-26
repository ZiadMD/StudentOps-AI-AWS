import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Send,
  Paperclip,
  Search,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Volume2,
  Reply,
  Edit2,
  X,
  RefreshCw,
  Phone,
  Shield,
  Smile,
  Download,
  AlertCircle,
  Users,
  ChevronLeft,
} from 'lucide-react';
import { api, getWhatsAppWebSocketUrl } from '../api/client';
import {
  UserProfile,
  WhatsAppChatMessage,
  WhatsAppThreadSummary,
} from '../types';
import { useToast } from '../context/ToastContext';

const isSafeMediaUrl = (url?: string | null): boolean => {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  if (
    clean.startsWith('javascript:') ||
    clean.startsWith('vbscript:') ||
    clean.startsWith('file:')
  ) {
    return false;
  }
  return (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('data:image/') ||
    clean.startsWith('data:video/') ||
    clean.startsWith('data:audio/') ||
    clean.startsWith('data:application/pdf') ||
    clean.startsWith('/')
  );
};

interface WhatsAppChatWindowProps {
  currentUser: UserProfile;
}

const QUICK_REACTIONS = ['👍', '❤️', '✅', '🙏', '👏', '👀'];

export const WhatsAppChatWindow: React.FC<WhatsAppChatWindowProps> = ({ currentUser }) => {
  const toast = useToast();
  const isLeader =
    currentUser.role === 'committee_hr_leader' ||
    currentUser.role === 'region_hr_head' ||
    currentUser.role === 'hr_admin';

  // State
  const [threads, setThreads] = useState<WhatsAppThreadSummary[]>([]);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsAppChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [oversightMode, setOversightMode] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Input state
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyToMsg, setReplyToMsg] = useState<WhatsAppChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<WhatsAppChatMessage | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [activeMediaModal, setActiveMediaModal] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Load thread list
  const fetchThreads = async (oversight = oversightMode) => {
    try {
      setLoadingThreads(true);
      const data = await api.getWhatsAppThreads(oversight);
      setThreads(data);
      if (data.length > 0 && !activeStudentId) {
        setActiveStudentId(data[0].student_id);
      }
    } catch (err) {
      console.error('Failed to load WhatsApp threads', err);
    } finally {
      setLoadingThreads(false);
    }
  };

  // Load messages for active thread
  const fetchMessages = async (studentId: string) => {
    try {
      setLoadingMessages(true);
      const data = await api.getThreadMessages(studentId);
      setMessages(data);
      // Update thread unread count locally
      setThreads((prev) =>
        prev.map((t) => (t.student_id === studentId ? { ...t, unread_count: 0 } : t))
      );
    } catch (err) {
      console.error('Failed to load thread messages', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchThreads(oversightMode);
  }, [oversightMode]);

  // When active thread changes
  useEffect(() => {
    if (activeStudentId) {
      fetchMessages(activeStudentId);
      setReplyToMsg(null);
      setEditingMsg(null);
      setAttachedFile(null);
    }
  }, [activeStudentId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // WebSocket Live Connection
  useEffect(() => {
    let isMounted = true;
    const wsUrl = getWhatsAppWebSocketUrl();

    const connectWs = () => {
      try {
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (isMounted) setWsConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            const { type, data } = parsed;

            if (type === 'incoming_message' || type === 'message_sent') {
              const newMsg = data as WhatsAppChatMessage;
              // If for active thread, append
              if (newMsg.student_id === activeStudentId) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === newMsg.id)) return prev;
                  return [...prev, newMsg];
                });
              }
              // Update thread snippet in sidebar
              setThreads((prev) =>
                prev.map((t) => {
                  if (t.student_id === newMsg.student_id) {
                    const isCurrent = t.student_id === activeStudentId;
                    return {
                      ...t,
                      last_message: newMsg,
                      unread_count: isCurrent || newMsg.sender_type === 'HR' ? t.unread_count : t.unread_count + 1,
                    };
                  }
                  return t;
                })
              );
            } else if (type === 'message_ack') {
              const updated = data as WhatsAppChatMessage;
              setMessages((prev) =>
                prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
              );
            } else if (type === 'message_reaction') {
              const updated = data as WhatsAppChatMessage;
              setMessages((prev) =>
                prev.map((m) => (m.id === updated.id ? { ...m, reactions: updated.reactions } : m))
              );
            } else if (type === 'message_edited') {
              const updated = data as WhatsAppChatMessage;
              setMessages((prev) =>
                prev.map((m) => (m.id === updated.id ? { ...m, content: updated.content, is_edited: true } : m))
              );
            } else if (type === 'messages_synced') {
              const syncData = data as { student_id?: string };
              if (syncData?.student_id === activeStudentId) {
                fetchMessages(activeStudentId);
              }
            }
          } catch (e) {
            console.error('Error parsing WS message', e);
          }
        };

        socket.onclose = () => {
          if (isMounted) {
            setWsConnected(false);
            // Reconnect after 4 seconds
            setTimeout(() => {
              if (isMounted) connectWs();
            }, 4000);
          }
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch (err) {
        console.error('WebSocket connection error', err);
      }
    };

    connectWs();

    // Heartbeat ping interval
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping');
      }
    }, 25000);

    return () => {
      isMounted = false;
      clearInterval(pingInterval);
      wsRef.current?.close();
    };
  }, [activeStudentId]);

  // On-demand chat synchronization with OpenWA
  const handleSyncChat = async () => {
    if (!activeStudentId || syncing) return;
    try {
      setSyncing(true);
      const res = await api.syncThreadMessages(activeStudentId);
      setMessages(res.messages);
      if (res.new_messages_count > 0) {
        toast.success(`Synced ${res.new_messages_count} new message${res.new_messages_count > 1 ? 's' : ''}`);
      } else {
        toast.info('Chat history is up to date');
      }
      if (res.messages && res.messages.length > 0) {
        const last = res.messages[res.messages.length - 1];
        setThreads((prev) =>
          prev.map((t) => (t.student_id === activeStudentId ? { ...t, last_message: last } : t))
        );
      }
    } catch (err: any) {
      toast.error(`Chat sync failed: ${err.message || 'Check gateway connection'}`);
    } finally {
      setSyncing(false);
    }
  };

  // Send message handler
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeStudentId || (!inputText.trim() && !attachedFile) || sending) return;

    try {
      setSending(true);

      // Editing existing message
      if (editingMsg) {
        const updated = await api.editThreadMessage(activeStudentId, editingMsg.id, inputText.trim());
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        setEditingMsg(null);
        setInputText('');
        return;
      }

      // Media file upload
      if (attachedFile) {
        const sent = await api.sendThreadMedia(
          activeStudentId,
          attachedFile,
          inputText.trim() || undefined,
          replyToMsg?.id
        );
        setMessages((prev) => [...prev, sent]);
        setAttachedFile(null);
        setInputText('');
        setReplyToMsg(null);
        return;
      }

      // Text message
      const sent = await api.sendThreadMessage(activeStudentId, {
        content: inputText.trim(),
        reply_to_message_id: replyToMsg?.id,
      });
      setMessages((prev) => [...prev, sent]);
      setInputText('');
      setReplyToMsg(null);
    } catch (err: any) {
      toast.error(`Message dispatch failed: ${err.message || 'Check connection'}`);
    } finally {
      setSending(false);
    }
  };

  // Quick reaction handler
  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!activeStudentId) return;
    try {
      const updated = await api.reactToMessage(activeStudentId, messageId, emoji);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setActiveReactionMsgId(null);
    } catch (err) {
      console.error('Reaction error', err);
    }
  };

  // Filter threads by search query
  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter(
      (t) =>
        t.full_name.toLowerCase().includes(q) ||
        t.arabic_name.toLowerCase().includes(q) ||
        t.phone.includes(q) ||
        (t.student_code && t.student_code.toLowerCase().includes(q))
    );
  }, [threads, searchQuery]);

  const activeThread = useMemo(
    () => threads.find((t) => t.student_id === activeStudentId) || null,
    [threads, activeStudentId]
  );

  const formatMessageTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const renderAckIcon = (ack: number, status: string) => {
    if (status === 'failed') {
      return <AlertCircle className="w-3.5 h-3.5 text-rose-500" />;
    }
    if (ack === 3 || status === 'read') {
      return <CheckCheck className="w-3.5 h-3.5 text-sky-500" />;
    }
    if (ack === 2 || status === 'delivered') {
      return <CheckCheck className="w-3.5 h-3.5 text-slate-400" />;
    }
    if (ack === 1 || status === 'sent') {
      return <Check className="w-3.5 h-3.5 text-slate-400" />;
    }
    return <Clock className="w-3.5 h-3.5 text-slate-400 animate-pulse" />;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[750px] max-h-[85vh]">
      {/* Top Bar / Header */}
      <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="text-sm font-semibold tracking-tight">
            WhatsApp Operational Chat
          </h2>
          <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
            OpenWA Official SIM
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded ${
              wsConnected ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                wsConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            {wsConnected ? 'Live Socket Active' : 'Connecting Stream…'}
          </span>
          <button
            type="button"
            onClick={() => {
              fetchThreads();
              if (activeStudentId) fetchMessages(activeStudentId);
            }}
            className="p-1 rounded text-slate-400 hover:text-white transition-colors"
            title="Refresh Conversations"
            aria-label="Refresh conversations"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main 2-Column Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Threads List */}
        <div className={`w-full sm:w-80 md:w-96 border-r border-slate-200 flex flex-col bg-slate-50/50 ${activeStudentId ? 'hidden sm:flex' : 'flex'}`}>
          {/* Search & Oversight Toggle */}
          <div className="p-3 border-b border-slate-200 space-y-2 bg-white">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search assigned members…"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {isLeader && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-medium text-slate-500">
                  {oversightMode ? 'All Committee (Oversight)' : 'My Assigned Members'}
                </span>
                <button
                  type="button"
                  onClick={() => setOversightMode(!oversightMode)}
                  aria-pressed={oversightMode}
                  className={`min-h-9 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    oversightMode
                      ? 'bg-violet-100 text-violet-800'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {oversightMode ? 'Switch to my assigned' : 'View committee oversight'}
                </button>
              </div>
            )}
          </div>

          {/* Threads List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingThreads ? (
              <div className="flex items-center justify-center p-8 text-xs text-slate-400">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                Loading conversations…
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                No assigned members found.
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isSelected = thread.student_id === activeStudentId;
                return (
                  <button
                    key={thread.student_id}
                    onClick={() => setActiveStudentId(thread.student_id)}
                    className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 ${
                      isSelected
                        ? 'bg-white border-l-4 border-l-slate-900 shadow-sm'
                        : 'hover:bg-slate-100/70'
                    }`}
                  >
                    {/* Initials Avatar */}
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSelected
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {thread.full_name.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {thread.full_name}
                        </span>
                        {thread.last_message && (
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {formatMessageTime(thread.last_message.created_at)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 font-arabic truncate" dir="rtl">
                          {thread.arabic_name}
                        </span>
                        {thread.unread_count > 0 && (
                          <span className="bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                            {thread.unread_count}
                          </span>
                        )}
                      </div>

                      {thread.last_message ? (
                        <p className="text-[11px] text-slate-500 truncate mt-1 flex items-center gap-1">
                          {thread.last_message.sender_type === 'HR' &&
                            renderAckIcon(thread.last_message.ack_status, thread.last_message.status)}
                          <span className="truncate">{thread.last_message.content}</span>
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic mt-1">No messages yet</p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Area: Conversation Stream */}
        <div className={`flex-1 flex flex-col bg-[#F8FAFC] ${activeStudentId ? 'flex' : 'hidden sm:flex'}`}>
          {activeThread ? (
            <>
              {/* Active Conversation Top Header */}
              <div className="bg-white px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setActiveStudentId(null)}
                    className="sm:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 shrink-0"
                    aria-label="Back to conversations list"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {activeThread.full_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate">
                      <h3 className="text-xs font-bold text-slate-900 truncate">
                        {activeThread.full_name}
                      </h3>
                      <span className="text-xs text-slate-500 font-arabic shrink-0" dir="rtl">
                        ({activeThread.arabic_name})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 truncate">
                      <span className="font-mono">{activeThread.phone}</span>
                      <span>•</span>
                      <span>{activeThread.student_code}</span>
                      {activeThread.assigned_hr_name && (
                        <>
                          <span>•</span>
                          <span className="text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200 text-[10px] truncate">
                            HR: {activeThread.assigned_hr_name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleSyncChat}
                    disabled={syncing}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors border border-slate-200"
                    title="Sync with WhatsApp"
                    aria-label="Sync chat with WhatsApp"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-slate-900' : 'text-slate-500'}`} />
                    <span className="hidden md:inline">{syncing ? 'Syncing…' : 'Sync Chat'}</span>
                  </button>
                  <a
                    href={`tel:${activeThread.phone}`}
                    className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Direct Call"
                    aria-label={`Call ${activeThread.full_name}`}
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Message List Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full text-xs text-slate-400">
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    Loading conversation history…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 p-8 space-y-2">
                    <Shield className="w-8 h-8 text-slate-300" />
                    <p className="text-xs font-medium text-slate-600">
                      Start of conversation with {activeThread.full_name}
                    </p>
                    <p className="text-[11px] text-slate-400 max-w-sm">
                      Messages sent here are routed via the official OpenWA account. Strict access isolation ensures only you can view and respond to this thread.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isHR = msg.sender_type === 'HR';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col group ${isHR ? 'items-end' : 'items-start'}`}
                      >
                        {/* Bubble Container */}
                        <div
                          className={`relative max-w-md md:max-w-lg rounded-2xl p-3 text-xs leading-relaxed shadow-sm ${
                            isHR
                              ? 'bg-emerald-50 text-slate-900 border border-emerald-200 rounded-tr-none'
                              : 'bg-white text-slate-900 border border-slate-200 rounded-tl-none'
                          }`}
                        >
                          {/* Replied-to parent quote */}
                          {msg.reply_to_message_id && (
                            <div className="mb-2 p-2 rounded bg-black/5 border-l-2 border-slate-500 text-[11px] text-slate-600">
                              <span className="font-semibold block text-[10px]">Quoted message</span>
                              <span className="truncate block">Original message referenced</span>
                            </div>
                          )}

                          {/* Media preview */}
                          {msg.message_type === 'image' && msg.media_url && isSafeMediaUrl(msg.media_url) && (
                            <div className="mb-2 rounded-lg overflow-hidden border border-black/10 cursor-pointer">
                              <img
                                src={msg.media_url}
                                alt="Attachment"
                                className="max-h-60 w-full object-cover"
                                onClick={() => setActiveMediaModal(msg.media_url || null)}
                              />
                            </div>
                          )}

                          {msg.message_type === 'video' && msg.media_url && isSafeMediaUrl(msg.media_url) && (
                            <div className="mb-2 rounded-lg overflow-hidden border border-black/10">
                              <video src={msg.media_url} controls className="max-h-60 w-full" />
                            </div>
                          )}

                          {msg.message_type === 'audio' && msg.media_url && isSafeMediaUrl(msg.media_url) && (
                            <div className="mb-2 flex items-center gap-2 bg-black/5 p-2 rounded-lg">
                              <Volume2 className="w-4 h-4 text-slate-600" />
                              <audio src={msg.media_url} controls className="h-8 w-full" />
                            </div>
                          )}

                          {msg.message_type === 'document' && (
                            <a
                              href={isSafeMediaUrl(msg.media_url) ? (msg.media_url || '#') : '#'}
                              download={msg.media_filename || 'document'}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                if (!isSafeMediaUrl(msg.media_url)) {
                                  e.preventDefault();
                                }
                              }}
                              className="mb-2 flex items-center gap-2 p-2.5 rounded-lg bg-black/5 hover:bg-black/10 transition-colors border border-black/5 text-slate-800"
                            >
                              <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <span className="font-medium truncate block">
                                  {msg.media_filename || 'Document File'}
                                </span>
                                <span className="text-[10px] text-slate-500 uppercase">
                                  {msg.media_mimetype || 'PDF/DOC'}
                                </span>
                              </div>
                              <Download className="w-4 h-4 text-slate-500 shrink-0" />
                            </a>
                          )}

                          {/* Text content */}
                          <p dir="auto" className="whitespace-pre-wrap break-words">{msg.content}</p>

                          {/* Footer: time, status, edited */}
                          <div className="flex items-center justify-end gap-1.5 mt-1.5 text-[10px] text-slate-400">
                            {msg.is_edited && (
                              <span className="italic text-slate-400 mr-1">edited</span>
                            )}
                            <span>{formatMessageTime(msg.created_at)}</span>
                            {isHR && renderAckIcon(msg.ack_status, msg.status)}
                          </div>

                          {/* Reactions badges */}
                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className="absolute -bottom-2.5 right-2 flex items-center gap-1 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 shadow-sm text-[11px]">
                              {msg.reactions.map((r, i) => (
                                <span key={i} title={`From ${r.from}`}>
                                  {r.emoji}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Hover Actions: Reply, React, Edit */}
                        <div
                          className={`flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                            isHR ? 'mr-1' : 'ml-1'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setReplyToMsg(msg)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded"
                            title="Reply"
                            aria-label="Reply to message"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveReactionMsgId(
                                  activeReactionMsgId === msg.id ? null : msg.id
                                )
                              }
                              className="p-1 text-slate-400 hover:text-slate-600 rounded"
                              title="React"
                              aria-label="Add reaction"
                            >
                              <Smile className="w-3.5 h-3.5" />
                            </button>
                            {activeReactionMsgId === msg.id && (
                              <div className="absolute bottom-full mb-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg p-1.5 flex items-center gap-1.5 z-20">
                                {QUICK_REACTIONS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => handleToggleReaction(msg.id, emoji)}
                                    className="p-1 hover:bg-slate-100 rounded text-sm transition-transform hover:scale-125"
                                    aria-label={`React with ${emoji}`}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {isHR && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMsg(msg);
                                setInputText(msg.content);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-600 rounded"
                              title="Edit"
                              aria-label="Edit message"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply / Edit Banner */}
              {(replyToMsg || editingMsg || attachedFile) && (
                <div className="bg-slate-100 border-t border-slate-200 px-4 py-2 flex items-center justify-between text-xs text-slate-700">
                  <div className="flex items-center gap-2 truncate">
                    {replyToMsg && (
                      <>
                        <Reply className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="truncate">
                          Replying to: <strong>{replyToMsg.content}</strong>
                        </span>
                      </>
                    )}
                    {editingMsg && (
                      <>
                        <Edit2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="truncate">
                          Editing message…
                        </span>
                      </>
                    )}
                    {attachedFile && (
                      <>
                        <Paperclip className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate font-medium">
                          {attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyToMsg(null);
                      setEditingMsg(null);
                      setAttachedFile(null);
                      if (editingMsg) setInputText('');
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600"
                    aria-label="Cancel reply or attachment"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Message Input Bar */}
              <form
                onSubmit={handleSendMessage}
                className="bg-white p-3 border-t border-slate-200 flex items-end gap-2"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setAttachedFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                  title="Attach File"
                  aria-label="Attach file"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={
                    editingMsg
                      ? 'Edit message content…'
                      : attachedFile
                      ? 'Add a caption…'
                      : `Message ${activeThread.full_name}… (Shift+Enter for newline)`
                  }
                  rows={1}
                  className="flex-1 text-xs border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-slate-900 resize-none max-h-32 bg-slate-50/50"
                />

                <button
                  type="submit"
                  disabled={(!inputText.trim() && !attachedFile) || sending}
                  className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  aria-label="Send message"
                >
                  <Send className={`w-4 h-4 ${sending ? 'animate-pulse' : ''}`} />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
              Select an assigned member from the sidebar to open the chat window.
            </div>
          )}
        </div>
      </div>

      {/* Lightbox image preview modal */}
      {activeMediaModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setActiveMediaModal(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={activeMediaModal}
              alt="Expanded Preview"
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
            <button
              onClick={() => setActiveMediaModal(null)}
              className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-full hover:bg-black/90"
              aria-label="Close media preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
