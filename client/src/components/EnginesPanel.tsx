import React, { useEffect, useState } from 'react';
import { Cpu, ShieldCheck, ShieldAlert, Zap } from 'lucide-react';

interface Endpoint { baseUrl: string; apiKey?: string; model: string; llamaCppExtras?: boolean }
interface Providers {
  chat: Endpoint;
  vision: Endpoint | null;
  classifier: { kind: 'none' | 'laya'; url?: string; apiKey?: string };
  allLocal: boolean;
}

const PRESETS: { label: string; chat: Partial<Endpoint> }[] = [
  { label: 'Local Gemma (llama.cpp)', chat: { baseUrl: 'http://127.0.0.1:8080/v1', model: 'gemma-4-E2B-it-Q4_K_M', llamaCppExtras: true } },
  { label: 'Ollama', chat: { baseUrl: 'http://127.0.0.1:11434/v1', model: 'gemma4:e2b', llamaCppExtras: false } },
  { label: 'LM Studio', chat: { baseUrl: 'http://127.0.0.1:1234/v1', model: 'gemma-4-e2b-it', llamaCppExtras: false } },
  { label: 'OpenAI-compatible cloud', chat: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', llamaCppExtras: false } }
];

const field = 'w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-100 text-xs';

/** "AI engines": point Sporeling at any OpenAI-compatible LLM and an optional Laya-style System-1 classifier. */
export const EnginesPanel: React.FC = () => {
  const [p, setP] = useState<Providers | null>(null);
  const [test, setTest] = useState<string | null>(null);

  useEffect(() => { fetch('/api/settings/providers').then((r) => r.json()).then(setP); }, []);
  if (!p) return null;

  const save = async (patch: any) => {
    const r = await fetch('/api/settings/providers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    setP(await r.json());
  };
  const runTest = async () => {
    setTest('Testing…');
    const r = await (await fetch('/api/settings/providers/test', { method: 'POST' })).json();
    setTest(`LLM ${r.llm ? '✓ reachable' : '✗ offline'} · Classifier ${r.classifier ? `✓ ${r.classifier.engine} → ${r.classifier.answer?.choice ?? '?'} (${r.classifier.latencyMs}ms)` : '✗'}`);
  };

  return (
    <div className="mt-5 pt-4 border-t border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-emerald-200 flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" />AI engines</h3>
        <span className={`text-[10px] flex items-center gap-1 ${p.allLocal ? 'text-emerald-400' : 'text-amber-400'}`}>
          {p.allLocal ? <><ShieldCheck className="w-3 h-3" />All on-device</> : <><ShieldAlert className="w-3 h-3" />Some data leaves this device</>}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {PRESETS.map((pr) => (
          <button key={pr.label} onClick={() => save({ chat: pr.chat })}
            className="px-2 py-1 rounded-full text-[10px] border border-slate-700 text-slate-300 hover:border-emerald-600">{pr.label}</button>
        ))}
      </div>

      <div className="space-y-1.5 text-[11px] text-slate-400">
        <label className="block">Chat / vision base URL (OpenAI-compatible)
          <input className={field} defaultValue={p.chat.baseUrl} onBlur={(e) => save({ chat: { baseUrl: e.target.value } })} />
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <label>Model<input className={field} defaultValue={p.chat.model} onBlur={(e) => save({ chat: { model: e.target.value } })} /></label>
          <label>API key<input className={field} type="password" defaultValue={p.chat.apiKey} placeholder="optional" onBlur={(e) => save({ chat: { apiKey: e.target.value } })} /></label>
        </div>

        <label className="block pt-2">
          <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-300" />System-1 classifier (Laya-style <code>/v1/predict</code>)</span>
          <input className={field} placeholder="e.g. https://laya.ahm-labs.com/v1/predict (blank = use the LLM)"
            defaultValue={p.classifier.url}
            onBlur={(e) => save({ classifier: e.target.value ? { kind: 'laya', url: e.target.value } : { kind: 'none' } })} />
        </label>
        <label className="block">Classifier key
          <input className={field} type="password" defaultValue={p.classifier.apiKey} placeholder="optional" onBlur={(e) => save({ classifier: { apiKey: e.target.value } })} />
        </label>
      </div>

      <button onClick={runTest} className="mt-2 w-full py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs hover:bg-slate-700">Test connection</button>
      {test && <p className="mt-1.5 text-[10.5px] text-slate-400">{test}</p>}
    </div>
  );
};
