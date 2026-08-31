import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ChevronDown, ChevronRight, Code, Paperclip, CheckCircle2 } from 'lucide-react';
import { ToolCallExecution, PendingConfirmation } from '../types';
import { api } from '../api/client';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { MarkdownRenderer } from './ui/MarkdownRenderer';
import { AgentMascot } from './AgentMascot';
import { useAgentMascotState } from '../hooks/useAgentMascotState';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  tool_traces?: ToolCallExecution[];
  needs_confirmation?: boolean;
  pending_action?: PendingConfirmation;
  streaming?: boolean;
}

interface AgentChatProps {
  initialQuery?: string;
  onClearInitialQuery?: () => void;
}

const API_BASE = '/api';

export const AgentChat: React.FC<AgentChatProps> = ({ initialQuery, onClearInitialQuery }) => {
  const [messages, setMessages]     = useState<AgentMessage[]>([]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const messagesEndRef              = useRef<HTMLDivElement>(null);
  const abortRef                    = useRef<AbortController | null>(null);
  const conversationId              = useRef(`conv_${Date.now()}`);
  const textareaRef                 = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => { scrollToBottom(); }, [messages, loading]);

  useEffect(() => {
    if (initialQuery) {
      handleSend(initialQuery);
      onClearInitialQuery?.();
    }
  }, [initialQuery]);

  // Find index of the latest assistant message
  const latestAssistantIndex = messages.map(m => m.role).lastIndexOf('assistant');
  const latestAssistantMsg = latestAssistantIndex >= 0 ? messages[latestAssistantIndex] : null;

  const isLatestStreaming = Boolean(loading && latestAssistantMsg?.streaming);
  const hasActiveTool = Boolean(
    isLatestStreaming &&
    latestAssistantMsg?.tool_traces &&
    latestAssistantMsg.tool_traces.length > 0
  );
  const hasError = Boolean(
    latestAssistantMsg?.content?.startsWith('**Error:**') ||
    latestAssistantMsg?.content?.startsWith('**Connection error.**')
  );

  const mascotState = useAgentMascotState({
    isStreaming: isLatestStreaming,
    hasActiveTool,
    isTyping: input.trim().length > 0,
    hasError,
  });

  const handleSend = useCallback(async (queryOverride?: string) => {
    const q = (queryOverride ?? input).trim();
    if (!q || loading) return;

    setInput('');
    setLoading(true);

    // Add the user message
    setMessages(prev => [...prev, { role: 'user', content: q }]);

    // Add a blank streaming assistant message
    const assistantIdx = await new Promise<number>(resolve => {
      setMessages(prev => {
        resolve(prev.length); // index of the new assistant message
        return [...prev, { role: 'assistant', content: '', streaming: true, tool_traces: [] }];
      });
    });

    abortRef.current = new AbortController();
    const token = api.getToken();
    const authHeaders: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    try {
      const res = await fetch(`${API_BASE}/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ query: q, conversation_id: conversationId.current }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        if (res.status === 401) {
          throw new Error('Authentication required or session expired. Please sign in again.');
        }
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: any;
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === 'token') {
            setMessages(prev => {
              const next = [...prev];
              next[assistantIdx] = {
                ...next[assistantIdx],
                content: next[assistantIdx].content + event.content,
              };
              return next;
            });
          } else if (event.type === 'tool') {
            const trace: ToolCallExecution = {
              tool_name: event.tool_name,
              parameters: event.result?.params ?? {},
              result: event.result,
              status: event.status,
              reasoning_summary: event.reasoning_summary,
            };
            setMessages(prev => {
              const next = [...prev];
              next[assistantIdx] = {
                ...next[assistantIdx],
                tool_traces: [...(next[assistantIdx].tool_traces ?? []), trace],
              };
              return next;
            });
          } else if (event.type === 'done') {
            setMessages(prev => {
              const next = [...prev];
              next[assistantIdx] = {
                ...next[assistantIdx],
                streaming: false,
                needs_confirmation: event.requires_confirmation,
                pending_action: event.pending_confirmation ?? undefined,
              };
              return next;
            });
          } else if (event.type === 'error') {
            setMessages(prev => {
              const next = [...prev];
              next[assistantIdx] = {
                ...next[assistantIdx],
                content: `**Error:** ${event.message}`,
                streaming: false,
              };
              return next;
            });
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setMessages(prev => {
        const next = [...prev];
        next[assistantIdx] = {
          ...next[assistantIdx],
          content: err?.message
            ? `**Error:** ${err.message}`
            : '**Connection error.** Please check the backend is running and try again.',
          streaming: false,
        };
        return next;
      });
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      {/* Message stream */}
      <div className="flex-1 overflow-y-auto w-full px-4 pt-6 pb-36">
        <div className="max-w-3xl mx-auto space-y-8">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center mt-20 text-center space-y-4 opacity-90">
              <div className="w-14 h-14 flex items-center justify-center overflow-visible">
                <AgentMascot
                  size="lg"
                  state={mascotState.state}
                  expression={mascotState.expression}
                  shape={mascotState.shape}
                  color={mascotState.color}
                  follow={true}
                  targetRef={input.trim().length > 0 ? textareaRef : undefined}
                  paper="#F8FAFC"
                />
              </div>
              <h2 className="text-xl font-medium text-slate-900 tracking-tight">How can I help you today?</h2>
              <p className="text-sm text-slate-500 max-w-xs">
                Ask about attendance, member scores, pending tasks, or upcoming events.
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            const isLatestAssistant = i === latestAssistantIndex;

            return (
              <div
                key={i}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
              >
                {msg.role === 'user' ? (
                  <div className="max-w-[80%] bg-slate-100/80 px-4 py-3 rounded-2xl text-slate-900 text-[15px] leading-relaxed shadow-sm">
                    {msg.content}
                  </div>
                ) : (
                  <div className="w-full max-w-3xl flex space-x-4">
                    {isLatestAssistant ? (
                      <div className="w-8 h-8 flex items-center justify-center shrink-0 mt-1 overflow-visible">
                        <AgentMascot
                          size="sm"
                          state={mascotState.state}
                          expression={mascotState.expression}
                          shape={mascotState.shape}
                          color={mascotState.color}
                          follow={mascotState.followPointer}
                          targetRef={input.trim().length > 0 ? textareaRef : undefined}
                          paper="#F8FAFC"
                        />
                      </div>
                    ) : (
                      <div className="w-8 shrink-0" aria-hidden="true" />
                    )}
                    <div className="flex-1 space-y-3 min-w-0">
                      {/* Tool traces */}
                      {msg.tool_traces && msg.tool_traces.length > 0 && (
                        <div className="flex flex-col gap-2 mb-2">
                          {msg.tool_traces.map((trace, idx) => (
                            <ToolAccordion key={idx} trace={trace} />
                          ))}
                        </div>
                      )}

                      {/* Response Markdown preview with streaming cursor */}
                      <MarkdownRenderer
                        content={msg.content}
                        streaming={msg.streaming}
                      />

                      {/* Confirmation card */}
                      {msg.needs_confirmation && msg.pending_action && !msg.streaming && (
                        <Card className="mt-4 border-emerald-200 bg-emerald-50/30">
                          <div className="p-4 flex items-start space-x-3">
                            <div className="space-y-3 flex-1">
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900">Authorization Required</h4>
                                <p className="text-xs text-slate-500 mt-0.5">Review and confirm before dispatching.</p>
                              </div>
                              <pre className="p-3 bg-white border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700 whitespace-pre-wrap overflow-x-auto">
                                {JSON.stringify(msg.pending_action, null, 2)}
                              </pre>
                              <div className="flex space-x-2">
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => api.confirmAction(msg.pending_action!.action_id, true)}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                  Confirm & Send
                                </Button>
                                <Button variant="secondary" size="sm"
                                  onClick={() => api.confirmAction(msg.pending_action!.action_id, false)}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </div>
                        </Card>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="fixed bottom-0 left-64 right-0 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC] to-transparent pt-10 pb-6 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative bg-white border border-slate-200 shadow-[0_2px_10px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden focus-within:border-slate-300 focus-within:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all flex flex-col">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="Ask about attendance, scores, tasks, or type anything…"
              className="w-full max-h-48 min-h-[56px] resize-none bg-transparent py-4 px-4 pr-12 text-[15px] outline-none text-slate-900 placeholder-slate-400 disabled:opacity-60"
              rows={1}
            />
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100">
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className={`p-2 rounded-xl transition-all flex items-center justify-center ${
                  input.trim() && !loading
                    ? 'bg-black text-white hover:bg-slate-800 active:scale-[0.98]'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ToolAccordion: React.FC<{ trace: ToolCallExecution }> = ({ trace }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200/60 bg-slate-50/50 rounded-lg overflow-hidden text-sm w-fit min-w-[280px]">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full p-2.5 hover:bg-slate-100/50 transition-colors text-slate-600"
      >
        <div className="flex items-center space-x-2">
          <Code className="w-4 h-4 text-slate-400" />
          <span className="font-medium text-xs">
            Used tool:{' '}
            <span className="font-mono text-[11px] text-slate-700 bg-white px-1 py-0.5 rounded border border-slate-200 ml-1">
              {trace.tool_name}
            </span>
          </span>
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
      </button>
      {open && (
        <div className="p-3 border-t border-slate-200/60 bg-white space-y-3">
          {trace.reasoning_summary && (
            <p className="text-[11px] text-slate-500 italic">{trace.reasoning_summary}</p>
          )}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Result</span>
            <pre className="mt-1 p-2 bg-slate-50 rounded border border-slate-100 font-mono text-[10px] text-slate-600 whitespace-pre-wrap max-h-40 overflow-y-auto">
              {JSON.stringify(trace.result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
