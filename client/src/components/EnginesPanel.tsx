import React, { useEffect, useState } from 'react';
import { Cpu, ShieldCheck, ShieldAlert, Zap, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';

type Kind = 'none' | 'laya' | 'hf_zero_shot' | 'rerank' | 'embeddings';
interface Endpoint { baseUrl: string; apiKey?: string; model: string; llamaCppExtras?: boolean }
interface ChatPreset extends Endpoint { id: string; label: string; local: boolean }
interface ClsPreset { id: string; label: string; kind: Kind; url: string; model: string; local: boolean }
interface Providers {
  chat: Endpoint;
  vision: Endpoint | null;
  classifier: { kind: Kind; url?: string; apiKey?: string; model?: string };
  allLocal: boolean;
  presets: { chat: ChatPreset[]; classifier: ClsPreset[] };
}

const KIND_INFO: Record<Kind, string> = {
  none: 'The chat LLM answers classification questions (JSON mode). Simplest, fully local.',
  laya: 'Native Laya /v1/predict: noul, choice and score in one call. ~300ms.',
  rerank: 'Cohere/Jina-style /v1/rerank (llama.cpp --reranking, vLLM, TEI). Local-friendly.',
  embeddings: 'OpenAI-style /v1/embeddings + cosine similarity. Works with EmbeddingGemma.',
  hf_zero_shot: 'Hugging Face zero-shot-classification (NLI models such as DeBERTa).'
};

const field = 'w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-100 text-xs';
const api = (path: string, init?: RequestInit) =>
  fetch(`/api/settings${path}`, { headers: { 'Content-Type': 'application/json' }, ...init }).then((r) => r.json());

/** Setup tab: choose chat/vision LLM + System-1 classifier, test them, or restore the standard setup. */
export const EnginesPanel: React.FC<{ onResetAll?: () => void }> = ({ onResetAll }) => {
  const [p, setP] = useState<Providers | null>(null);
  const [test, setTest] = useState<{ llm: boolean; classifier: any } | 'loading' | null>(null);

  useEffect(() => { api('/providers').then(setP); }, []);
  if (!p) return <p className="text-xs text-slate-400">Loading…</p>;

  const save = async (patch: any) => { setP(await api('/providers', { method: 'PUT', body: JSON.stringify(patch) })); setTest(null); };
  const runTest = async () => { setTest('loading'); setTest(await api('/providers/test', { method: 'POST', body: '{}' })); };
  const resetAll = async () => {
    setP(await api('/providers/reset', { method: 'POST', body: '{}' }));
    await api('/reset', { method: 'POST', body: '{}' });
    setTest(null);
    onResetAll?.();
  };

  const chatPreset = p.presets.chat.find((x) => x.baseUrl === p.chat.baseUrl && x.model === p.chat.model)?.id ?? 'custom';
  const clsPreset = p.presets.classifier.find((x) => x.kind === p.classifier.kind && (x.kind === 'none' || x.url === p.classifier.url))?.id ?? 'custom';
  // Remount inputs when the underlying config changes so defaultValue refreshes.
  const k = JSON.stringify([p.chat.baseUrl, p.chat.model, p.classifier.kind, p.classifier.url, p.classifier.model]);

  return (
    <div key={k} className="space-y-4 text-[11px] text-slate-400">
      <div className={`flex items-center gap-2 rounded-xl p-2.5 border ${p.allLocal ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300' : 'border-amber-800/60 bg-amber-950/30 text-amber-300'}`}>
        {p.allLocal ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
        <span>{p.allLocal ? 'Everything runs on this device. Nothing leaves it.' : 'Some requests go to a remote service. Your photos/GPS only leave if the vision/chat engine is remote.'}</span>
      </div>

      {/* Chat / vision */}
      <section>
        <h3 className="text-xs font-bold text-emerald-200 flex items-center gap-1.5 mb-1.5"><Cpu className="w-3.5 h-3.5" />Brain (chat + vision)</h3>
        <select className={field} value={chatPreset}
          onChange={(e) => { const pr = p.presets.chat.find((x) => x.id === e.target.value); if (pr) save({ chat: { baseUrl: pr.baseUrl, model: pr.model, llamaCppExtras: pr.llamaCppExtras } }); }}>
          {p.presets.chat.map((pr) => <option key={pr.id} value={pr.id}>{pr.label}{pr.id === 'standard' ? ' (standard)' : ''}</option>)}
          {chatPreset === 'custom' && <option value="custom">Custom</option>}
        </select>
        <div className="mt-1.5 space-y-1.5">
          <label className="block">Base URL (OpenAI-compatible)
            <input className={field} defaultValue={p.chat.baseUrl} onBlur={(e) => e.target.value !== p.chat.baseUrl && save({ chat: { baseUrl: e.target.value } })} />
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label>Model<input className={field} defaultValue={p.chat.model} onBlur={(e) => e.target.value !== p.chat.model && save({ chat: { model: e.target.value } })} /></label>
            <label>API key<input className={field} type="password" defaultValue={p.chat.apiKey} placeholder="not needed locally" onBlur={(e) => e.target.value !== p.chat.apiKey && save({ chat: { apiKey: e.target.value } })} /></label>
          </div>
          <p className="text-[10px] text-slate-500">Vision uses the same model, so it must accept images (Gemma 4 + mmproj does).</p>
        </div>
      </section>

      {/* Classifier */}
      <section>
        <h3 className="text-xs font-bold text-emerald-200 flex items-center gap-1.5 mb-1.5"><Zap className="w-3.5 h-3.5 text-amber-300" />Reflexes (System-1 classifier)</h3>
        <select className={field} value={clsPreset}
          onChange={(e) => { const pr = p.presets.classifier.find((x) => x.id === e.target.value); if (pr) save({ classifier: { kind: pr.kind, url: pr.url, model: pr.model } }); }}>
          {p.presets.classifier.map((pr) => <option key={pr.id} value={pr.id}>{pr.label}{pr.id === 'standard' ? ' (standard)' : ''}</option>)}
          {clsPreset === 'custom' && <option value="custom">Custom</option>}
        </select>
        <p className="mt-1 text-[10px] text-slate-500">{KIND_INFO[p.classifier.kind]}</p>

        {p.classifier.kind !== 'none' && (
          <div className="mt-1.5 space-y-1.5">
            <div className="grid grid-cols-3 gap-1.5">
              <label className="col-span-1">API style
                <select className={field} value={p.classifier.kind} onChange={(e) => save({ classifier: { kind: e.target.value } })}>
                  <option value="laya">Laya</option><option value="rerank">Rerank</option>
                  <option value="embeddings">Embeddings</option><option value="hf_zero_shot">HF zero-shot</option>
                </select>
              </label>
              <label className="col-span-2">Endpoint URL
                <input className={field} defaultValue={p.classifier.url} onBlur={(e) => e.target.value !== p.classifier.url && save({ classifier: { url: e.target.value } })} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label>Model<input className={field} defaultValue={p.classifier.model} placeholder="if required" onBlur={(e) => save({ classifier: { model: e.target.value } })} /></label>
              <label>API key<input className={field} type="password" defaultValue={p.classifier.apiKey} placeholder="optional" onBlur={(e) => e.target.value !== p.classifier.apiKey && save({ classifier: { apiKey: e.target.value } })} /></label>
            </div>
          </div>
        )}
      </section>

      {/* Test + reset */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={runTest} className="py-2 rounded-lg bg-emerald-500/15 border border-emerald-700 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/25">Test connection</button>
        <button onClick={resetAll} className="py-2 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 flex items-center justify-center gap-1">
          <RotateCcw className="w-3 h-3" />Standard setup
        </button>
      </div>
      {test && (
        <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-2 space-y-1">
          {test === 'loading' ? <span>Testing…</span> : (
            <>
              <div className="flex items-center gap-1.5">{test.llm ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-rose-400" />}Brain {test.llm ? 'reachable' : 'offline'}</div>
              <div className="flex items-center gap-1.5">
                {test.classifier ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                {test.classifier
                  ? <>Reflexes via <b className="text-slate-200">{test.classifier.engine}</b>: "rain in Leeds?" → {test.classifier.answer?.choice} in {test.classifier.latencyMs}ms
                      {test.classifier.engine === 'llm' && p.classifier.kind !== 'none' && <span className="text-amber-400"> (endpoint failed, fell back)</span>}</>
                  : 'Reflexes unavailable'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
