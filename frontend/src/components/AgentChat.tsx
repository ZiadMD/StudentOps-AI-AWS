import React, { useEffect, useState } from 'react';
import { CheckCircle2, Code, Send } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { AgentChatResponse } from '../types';

interface AgentChatProps {
  initialQuery?: string;
  onClearInitialQuery?: () => void;
}

export const AgentChat: React.FC<AgentChatProps> = ({ initialQuery, onClearInitialQuery }) => {
  const [toolName, setToolName] = useState('');
  const [payload, setPayload] = useState('{}');
  const [result, setResult] = useState<AgentChatResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialQuery) return;
    setPayload(JSON.stringify({ query: initialQuery }, null, 2));
    onClearInitialQuery?.();
  }, [initialQuery, onClearInitialQuery]);

  const execute = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setResult(null);

    let parsedPayload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(payload);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Payload must be a JSON object.');
      parsedPayload = parsed as Record<string, unknown>;
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Payload must be valid JSON.');
      return;
    }
    if (!toolName.trim()) {
      setError('Tool name is required.');
      return;
    }

    setLoading(true);
    try {
      setResult(await api.executeAgentTool(toolName.trim(), parsedPayload));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Tool execution failed.');
    } finally {
      setLoading(false);
    }
  };

  const approve = async () => {
    if (!result?.approval_id) return;
    setLoading(true);
    setError('');
    try {
      setResult(await api.confirmAction(result.approval_id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Approval failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2 text-slate-900">
          <Code className="w-5 h-5" />
          <h1 className="text-xl font-extrabold tracking-tight">Agent Tool Console</h1>
        </div>
        <p className="text-sm text-slate-500 mt-2">Execute only registered tools through the typed, audited backend boundary.</p>
      </div>

      <form onSubmit={execute} className="space-y-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="space-y-1.5">
          <label htmlFor="tool-name" className="text-xs font-semibold text-slate-700">Tool name</label>
          <input id="tool-name" value={toolName} onChange={(event) => setToolName(event.target.value)} placeholder="registered_tool_name" className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="tool-payload" className="text-xs font-semibold text-slate-700">Payload</label>
          <textarea id="tool-payload" value={payload} onChange={(event) => setPayload(event.target.value)} rows={8} className="w-full px-3 py-2.5 bg-slate-950 text-slate-100 border border-slate-800 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" spellCheck={false} />
        </div>
        {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={loading} className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
          <Send className="w-4 h-4" />
          {loading ? 'Executing...' : 'Execute tool'}
        </button>
      </form>

      {result && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><CheckCircle2 className="w-4 h-4 text-emerald-600" />{result.status === 'pending' ? 'Approval required' : 'Execution result'}</div>
          {result.message && <p className="text-sm text-slate-600">{result.message}</p>}
          {result.result !== undefined && <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg overflow-x-auto text-xs text-slate-700">{JSON.stringify(result.result, null, 2)}</pre>}
          {result.status === 'pending' && result.approval_id && <button onClick={approve} disabled={loading} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">Approve action</button>}
        </div>
      )}
    </div>
  );
};
