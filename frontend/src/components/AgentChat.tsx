import React, { useState, useEffect, useRef } from 'react';
import { Send, ChevronDown, ChevronRight, Activity, Code, Sparkles, Paperclip, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { ToolCallExecution, PendingConfirmation } from '../types';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  tool_traces?: ToolCallExecution[];
  needs_confirmation?: boolean;
  pending_action?: PendingConfirmation;
}

interface AgentChatProps {
  initialQuery?: string;
  onClearInitialQuery?: () => void;
}

export const AgentChat: React.FC<AgentChatProps> = ({ initialQuery, onClearInitialQuery }) => {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    if (initialQuery) {
      setInput(initialQuery);
      handleSend(initialQuery);
      if (onClearInitialQuery) onClearInitialQuery();
    }
  }, [initialQuery]);

  const handleSend = async (queryToSend?: string) => {
    const q = queryToSend || input;
    if (!q.trim() || loading) return;

    const userMsg: AgentMessage = { role: 'user', content: q };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await api.sendAgentQuery(q);
      const aiMsg: AgentMessage = {
        role: 'assistant',
        content: response.response,
        tool_traces: response.tool_executions,
        needs_confirmation: response.requires_confirmation,
        pending_action: response.pending_confirmation
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      const errorMsg: AgentMessage = {
        role: 'assistant',
        content: '**Error:** The agent connection was interrupted. Please try again.',
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      <div className="flex-1 overflow-y-auto w-full px-4 pt-6 pb-32">
        <div className="max-w-3xl mx-auto space-y-8">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center mt-20 text-center space-y-4 opacity-60">
              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-slate-800" />
              </div>
              <h2 className="text-xl font-medium text-slate-900 tracking-tight">How can I help you today?</h2>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              {msg.role === 'user' ? (
                <div className="max-w-[80%] bg-slate-100/80 px-4 py-3 rounded-2xl text-slate-900 text-[15px] leading-relaxed shadow-sm">
                  {msg.content}
                </div>
              ) : (
                <div className="w-full max-w-3xl flex space-x-4">
                  <div className="w-8 h-8 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0 mt-1">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 space-y-3">
                    {msg.tool_traces && msg.tool_traces.length > 0 && (
                      <div className="flex flex-col gap-2 mb-2">
                        {msg.tool_traces.map((trace, idx) => (
                          <ToolAccordion key={idx} trace={trace} />
                        ))}
                      </div>
                    )}
                    <div className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap font-normal">
                      {msg.content}
                    </div>
                    {msg.needs_confirmation && msg.pending_action && (
                      <Card className="mt-4 border-emerald-200 bg-emerald-50/30">
                        <div className="p-4 flex items-start space-x-3">
                          <Activity className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                          <div className="space-y-3 flex-1">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-900">Action Authorization Required</h4>
                              <p className="text-xs text-slate-500 mt-0.5">Please review the payload before dispatching.</p>
                            </div>
                            <div className="p-3 bg-white border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                              {JSON.stringify(msg.pending_action, null, 2)}
                            </div>
                            <div className="flex space-x-2 pt-2">
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                Approve & Execute
                              </Button>
                              <Button variant="secondary" size="sm">Cancel</Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex w-full max-w-3xl space-x-4 animate-in fade-in duration-300">
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0 mt-1">
                <Sparkles className="w-4 h-4 text-blue-600 animate-pulse" />
              </div>
              <div className="flex-1">
                <div className="h-4 w-4 bg-slate-300 rounded-full animate-bounce mt-3"></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="fixed bottom-0 left-64 right-0 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC] to-transparent pt-10 pb-6 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative bg-white border border-slate-200 shadow-[0_2px_10px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden focus-within:border-slate-300 focus-within:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all flex flex-col">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the Agent to manage attendance, check scores, or send reminders..."
              className="w-full max-h-48 min-h-[56px] resize-none bg-transparent py-4 px-4 pr-12 text-[15px] outline-none text-slate-900 placeholder-slate-400"
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
                    ? 'bg-black text-white hover:bg-slate-800 hover:scale-[0.98]'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="text-center mt-3">
            <span className="text-[10px] text-slate-400">StudentOps AI can make mistakes. Check important generated content.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ToolAccordion: React.FC<{ trace: ToolCallExecution }> = ({ trace }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-slate-200/60 bg-slate-50/50 rounded-lg overflow-hidden transition-all text-sm w-fit min-w-[280px]">
      <button 
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full p-2.5 hover:bg-slate-100/50 transition-colors text-slate-600"
      >
        <div className="flex items-center space-x-2">
          <Code className="w-4 h-4 text-slate-400" />
          <span className="font-medium text-xs">Used tool: <span className="font-mono text-[11px] text-slate-700 bg-white px-1 py-0.5 rounded border border-slate-200 ml-1">{trace.tool_name}</span></span>
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
      </button>
      
      {open && (
        <div className="p-3 border-t border-slate-200/60 bg-white space-y-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Parameters</span>
            <pre className="mt-1 p-2 bg-slate-50 rounded border border-slate-100 font-mono text-[10px] text-slate-600 whitespace-pre-wrap">
              {JSON.stringify(trace.parameters, null, 2)}
            </pre>
          </div>
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
