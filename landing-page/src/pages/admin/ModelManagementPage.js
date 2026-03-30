/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback } from 'react';

const MODEL_TYPE_LABELS = {
  llm: 'LLM', tts: 'TTS', stt: 'STT', vlm: 'Vision',
  image_gen: 'Image Gen', video_gen: 'Video Gen', audio_gen: 'Audio Gen',
  embedding: 'Embedding',
};

const DEVICE_COLORS = {
  gpu: '#4CAF50', cpu: '#FF9800', cpu_offload: '#FFC107',
  unloaded: '#666', api: '#6C63FF',
};

function VRAMBar({ compute }) {
  if (!compute || !compute.vram_total_gb) return null;
  const used = compute.vram_total_gb - compute.vram_free_gb;
  const pct = Math.round((used / compute.vram_total_gb) * 100);
  const allocs = compute.allocations || {};
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#aaa', marginBottom: 4 }}>
        <span>VRAM: {used.toFixed(1)} / {compute.vram_total_gb.toFixed(1)} GB ({pct}%)</span>
        <span>Free: {compute.vram_free_gb.toFixed(1)} GB</span>
      </div>
      <div style={{ height: 8, background: '#333', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4, transition: 'width 0.3s',
          width: `${pct}%`,
          background: pct > 85 ? '#f44336' : pct > 60 ? '#FF9800' : '#4CAF50',
        }} />
      </div>
      {Object.keys(allocs).length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {Object.entries(allocs).map(([name, info]) => {
            const isRich = typeof info === 'object' && info !== null;
            const gb = isRich ? info.gb : info;
            const device = isRich ? info.device : null;
            const quant = isRich ? info.quant : null;
            const ctx = isRich ? info.context : null;
            const vision = isRich ? info.vision : false;
            const mmproj = isRich ? info.mmproj : null;
            const deviceColor = device === 'gpu' ? '#4CAF50' : device === 'cpu' ? '#FF9800' : '#8899aa';
            return (
              <div key={name} style={{
                fontSize: 11, background: '#1a2332', padding: '4px 8px',
                borderRadius: 6, border: '1px solid #2a3a4a',
                display: 'flex', flexDirection: 'column', gap: 2,
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: '#ccc', fontWeight: 600 }}>{name}</span>
                  <span style={{ color: deviceColor, fontWeight: 600 }}>{gb?.toFixed?.(1) || gb}GB</span>
                  {device && <span style={{ color: deviceColor, fontSize: 10 }}>{device.toUpperCase()}</span>}
                </div>
                {(quant || ctx || vision || mmproj) && (
                  <div style={{ display: 'flex', gap: 6, fontSize: 10, color: '#667' }}>
                    {quant && <span style={{ background: '#6C63FF22', color: '#9990ff', padding: '0 4px', borderRadius: 3 }}>{quant}</span>}
                    {ctx && <span>ctx: {typeof ctx === 'number' && ctx >= 1000 ? `${Math.round(ctx/1024)}K` : ctx}</span>}
                    {vision && <span style={{ color: '#4CAF50' }}>VLM</span>}
                    {mmproj && <span>mmproj: {mmproj}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModelCard({ model, onLoad, onUnload, onDownload }) {
  const isLoaded = model.loaded;
  const isDownloaded = model.downloaded;
  const typeLabel = MODEL_TYPE_LABELS[model.model_type] || model.model_type;
  const deviceColor = DEVICE_COLORS[model.device] || '#666';

  return (
    <div style={{
      background: '#1a2332', borderRadius: 8, padding: 16, border: '1px solid #2a3a4a',
      opacity: model.enabled === false ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{model.name}</div>
          <div style={{ fontSize: 12, color: '#8899aa', marginTop: 2 }}>{model.id}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: '#6C63FF22', color: '#6C63FF', fontWeight: 600,
          }}>
            {typeLabel}
          </span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: deviceColor + '22', color: deviceColor, fontWeight: 600,
          }}>
            {model.device || 'unloaded'}
          </span>
        </div>
      </div>

      {/* Specs row */}
      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#8899aa', marginBottom: 8, flexWrap: 'wrap' }}>
        {model.vram_gb > 0 && <span>VRAM: {model.vram_gb}GB</span>}
        {model.ram_gb > 0 && <span>RAM: {model.ram_gb}GB</span>}
        {model.disk_gb > 0 && <span>Disk: {model.disk_gb}GB</span>}
        <span>Backend: {model.backend}</span>
        {model.languages?.length > 0 && (
          <span>Lang: {model.languages.slice(0, 5).join(', ')}{model.languages.length > 5 ? '...' : ''}</span>
        )}
      </div>

      {/* Quality/Speed bars */}
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#667', marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <span>Quality</span>
          <div style={{ height: 4, background: '#333', borderRadius: 2, marginTop: 2 }}>
            <div style={{ height: '100%', borderRadius: 2, width: `${(model.quality_score || 0) * 100}%`, background: '#6C63FF' }} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <span>Speed</span>
          <div style={{ height: 4, background: '#333', borderRadius: 2, marginTop: 2 }}>
            <div style={{ height: '100%', borderRadius: 2, width: `${(model.speed_score || 0) * 100}%`, background: '#4CAF50' }} />
          </div>
        </div>
      </div>

      {/* Error */}
      {model.error && (
        <div style={{ fontSize: 12, color: '#f44336', marginBottom: 8 }}>{model.error}</div>
      )}

      {/* Tags */}
      {model.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
          {model.tags.map(tag => (
            <span key={tag} style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 4,
              background: '#2a3a4a', color: '#8899aa',
            }}>{tag}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        {!isDownloaded && model.source !== 'api' && model.source !== 'pip' && (
          <button onClick={() => onDownload(model.id)} style={btnStyle('#FF9800')}>
            Download
          </button>
        )}
        {!isLoaded && (isDownloaded || model.source === 'api' || model.source === 'pip') && (
          <button onClick={() => onLoad(model.id)} style={btnStyle('#4CAF50')}>
            Load
          </button>
        )}
        {isLoaded && (
          <button onClick={() => onUnload(model.id)} style={btnStyle('#f44336')}>
            Unload
          </button>
        )}
      </div>
    </div>
  );
}

const btnStyle = (color) => ({
  padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: 12, fontWeight: 600, color: '#fff', background: color,
});

function AddModelDialog({ onClose, onSave }) {
  const [form, setForm] = useState({
    id: '', name: '', model_type: 'llm', source: 'huggingface',
    repo_id: '', backend: 'llama.cpp', vram_gb: 0, ram_gb: 1,
    disk_gb: 0, supports_gpu: true, supports_cpu: true,
    quality_score: 0.7, speed_score: 0.7, priority: 50,
    languages: '', tags: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const entry = {
      ...form,
      vram_gb: parseFloat(form.vram_gb) || 0,
      ram_gb: parseFloat(form.ram_gb) || 1,
      disk_gb: parseFloat(form.disk_gb) || 0,
      quality_score: parseFloat(form.quality_score) || 0.5,
      speed_score: parseFloat(form.speed_score) || 0.5,
      priority: parseInt(form.priority) || 50,
      languages: form.languages ? form.languages.split(',').map(s => s.trim()) : [],
      tags: form.tags ? form.tags.split(',').map(s => s.trim()) : [],
      enabled: true,
    };
    onSave(entry);
  };

  const inputStyle = {
    width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #2a3a4a',
    background: '#0d1520', color: '#fff', fontSize: 13, boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 12, color: '#8899aa', marginBottom: 2, display: 'block' };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#1a2332', borderRadius: 12, padding: 24, width: 480, maxHeight: '80vh',
        overflow: 'auto', border: '1px solid #2a3a4a',
      }}>
        <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>Register New Model</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>ID (slug)</label>
            <input style={inputStyle} value={form.id} required
              onChange={e => setForm(f => ({ ...f, id: e.target.value }))} placeholder="my-custom-tts" />
          </div>
          <div>
            <label style={labelStyle}>Display Name</label>
            <input style={inputStyle} value={form.name} required
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Custom TTS" />
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={form.model_type}
              onChange={e => setForm(f => ({ ...f, model_type: e.target.value }))}>
              {Object.entries(MODEL_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Source</label>
            <select style={inputStyle} value={form.source}
              onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
              <option value="huggingface">HuggingFace</option>
              <option value="ollama">Ollama</option>
              <option value="pip">pip package</option>
              <option value="api">Remote API</option>
              <option value="local">Local file</option>
              <option value="github">GitHub release</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Repo / Package / URL</label>
            <input style={inputStyle} value={form.repo_id}
              onChange={e => setForm(f => ({ ...f, repo_id: e.target.value }))}
              placeholder="unsloth/Qwen3.5-4B-GGUF or chatterbox-tts" />
          </div>
          <div>
            <label style={labelStyle}>Backend</label>
            <select style={inputStyle} value={form.backend}
              onChange={e => setForm(f => ({ ...f, backend: e.target.value }))}>
              <option value="llama.cpp">llama.cpp</option>
              <option value="torch">PyTorch</option>
              <option value="onnx">ONNX</option>
              <option value="piper">Piper</option>
              <option value="api">API</option>
              <option value="sidecar">Sidecar</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>VRAM (GB)</label>
            <input style={inputStyle} type="number" step="0.1" value={form.vram_gb}
              onChange={e => setForm(f => ({ ...f, vram_gb: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>RAM (GB)</label>
            <input style={inputStyle} type="number" step="0.1" value={form.ram_gb}
              onChange={e => setForm(f => ({ ...f, ram_gb: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Disk (GB)</label>
            <input style={inputStyle} type="number" step="0.1" value={form.disk_gb}
              onChange={e => setForm(f => ({ ...f, disk_gb: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Quality (0-1)</label>
            <input style={inputStyle} type="number" step="0.05" min="0" max="1" value={form.quality_score}
              onChange={e => setForm(f => ({ ...f, quality_score: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Speed (0-1)</label>
            <input style={inputStyle} type="number" step="0.05" min="0" max="1" value={form.speed_score}
              onChange={e => setForm(f => ({ ...f, speed_score: e.target.value }))} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Languages (comma-separated)</label>
            <input style={inputStyle} value={form.languages}
              onChange={e => setForm(f => ({ ...f, languages: e.target.value }))}
              placeholder="en, zh, hi, ja" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Tags (comma-separated)</label>
            <input style={inputStyle} value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="local, recommended, vision, cpu-friendly" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{
            ...btnStyle('#555'), padding: '8px 16px',
          }}>Cancel</button>
          <button type="submit" style={{
            ...btnStyle('#6C63FF'), padding: '8px 16px',
          }}>Register</button>
        </div>
      </form>
    </div>
  );
}

export default function ModelManagementPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/models');
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const doAction = async (modelId, action) => {
    setActionInProgress(modelId);
    try {
      await fetch(`/api/admin/models/${modelId}/${action}`, { method: 'POST' });
      await fetchModels();
    } catch { /* ignore */ }
    setActionInProgress(null);
  };

  const handleSaveNew = async (entry) => {
    try {
      await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      setShowAdd(false);
      await fetchModels();
    } catch { /* ignore */ }
  };

  if (loading) return <div style={{ color: '#fff', padding: 40, textAlign: 'center' }}>Loading model catalog...</div>;
  if (!data) return <div style={{ color: '#f44336', padding: 40, textAlign: 'center' }}>Failed to load model catalog</div>;

  const types = Object.keys(data.models_by_type || {});
  const models = filter === 'all'
    ? (data.all_models || [])
    : (data.models_by_type?.[filter] || []);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ color: '#fff', margin: 0, fontSize: 20 }}>Model Management</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#8899aa' }}>
            {data.loaded_count} loaded / {data.downloaded_count} downloaded / {data.total_models} total
          </span>
          <button onClick={() => setShowAdd(true)} style={{ ...btnStyle('#6C63FF'), padding: '6px 14px' }}>
            + Add Model
          </button>
        </div>
      </div>

      {/* VRAM bar */}
      <VRAMBar compute={data.compute} />

      {/* RAM info */}
      {data.compute?.ram_free_gb > 0 && (
        <div style={{ fontSize: 13, color: '#8899aa', marginBottom: 16 }}>
          RAM free: {data.compute.ram_free_gb} GB
          {data.compute.gpu_type !== 'none' && ` | GPU: ${data.compute.gpu_type.toUpperCase()}`}
        </div>
      )}

      {/* Type filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('all')} style={{
          ...btnStyle(filter === 'all' ? '#6C63FF' : '#2a3a4a'),
          padding: '4px 12px',
        }}>All ({data.total_models})</button>
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            ...btnStyle(filter === t ? '#6C63FF' : '#2a3a4a'),
            padding: '4px 12px',
          }}>
            {MODEL_TYPE_LABELS[t] || t} ({(data.models_by_type[t] || []).length})
          </button>
        ))}
      </div>

      {/* Model grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 12 }}>
        {models.map(model => (
          <ModelCard
            key={model.id}
            model={model}
            onLoad={(id) => doAction(id, 'load')}
            onUnload={(id) => doAction(id, 'unload')}
            onDownload={(id) => doAction(id, 'download')}
          />
        ))}
      </div>

      {models.length === 0 && (
        <div style={{ textAlign: 'center', color: '#667', padding: 40 }}>
          No models found for this filter.
        </div>
      )}

      {showAdd && <AddModelDialog onClose={() => setShowAdd(false)} onSave={handleSaveNew} />}
    </div>
  );
}
