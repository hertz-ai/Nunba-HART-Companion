/* eslint-disable no-unused-vars */
import HFInstallModal from '../../components/shared/HFInstallModal';

import React, {useState, useEffect, useCallback} from 'react';

// Error codes emitted by /api/admin/models/hub/install that require
// tokenized UX (see commit 7b0e312).  Anything else still falls through
// to inline error text.
const STRUCTURED_HF_ERROR_CODES = new Set([
  'invalid_hf_id',
  'unverified_org',
  'unsafe_weights_format',
  'hf_timeout',
]);

const MODEL_TYPE_LABELS = {
  llm: 'LLM',
  tts: 'TTS',
  stt: 'STT',
  vlm: 'Vision',
  image_gen: 'Image Gen',
  video_gen: 'Video Gen',
  audio_gen: 'Audio Gen',
  embedding: 'Embedding',
};

const DEVICE_COLORS = {
  gpu: '#4CAF50',
  cpu: '#FF9800',
  cpu_offload: '#FFC107',
  unloaded: '#666',
  api: '#6C63FF',
};

// Universal — not gated by model_type.  Kept in sync with backend
// ModelCatalog.ALL_PURPOSES.  A single model (Qwen3.5-0.8B) can serve
// multiple (draft + caption + grounding); a multimodal omni model could
// serve main + tts + stt simultaneously.
const ALL_PURPOSES = [
  'draft',
  'main',
  'vision',
  'caption',
  'grounding',
  'tts',
  'stt',
  'diarization',
  'vad',
  'embedding',
  'rerank',
  'ocr',
  'music',
  'image-gen',
  'video-gen',
  'translate',
];

const PURPOSE_COLORS = {
  draft: '#FF9800',
  main: '#4CAF50',
  vision: '#9C27B0',
  caption: '#00BCD4',
  grounding: '#E91E63',
  tts: '#03A9F4',
  stt: '#FF5722',
  diarization: '#795548',
  vad: '#607D8B',
  embedding: '#CDDC39',
  rerank: '#FFEB3B',
  ocr: '#8BC34A',
  music: '#F06292',
  'image-gen': '#BA68C8',
  'video-gen': '#7E57C2',
  translate: '#26A69A',
};

// Categories for the "Browse HuggingFace" tab.  Each entry drives the
// HF Hub search filter (backend maps to pipeline_tag).  Order matters —
// most-used tasks first so users see relevant models quickly.
const HUB_CATEGORIES = [
  {key: 'llm', label: 'LLM (main/chat)'},
  {key: 'draft', label: 'Draft LLM'},
  {key: 'vision', label: 'Vision (VLM)'},
  {key: 'caption', label: 'Image captioning'},
  {key: 'tts', label: 'Text-to-speech'},
  {key: 'stt', label: 'Speech-to-text'},
  {key: 'diarization', label: 'Diarization'},
  {key: 'vad', label: 'VAD'},
  {key: 'embedding', label: 'Embeddings'},
  {key: 'rerank', label: 'Rerankers'},
  {key: 'ocr', label: 'OCR'},
  {key: 'music', label: 'Music gen'},
  {key: 'image-gen', label: 'Image gen'},
  {key: 'video-gen', label: 'Video gen'},
  {key: 'translate', label: 'Translation'},
];

function VRAMBar({compute}) {
  if (!compute || !compute.vram_total_gb) return null;
  const used = compute.vram_total_gb - compute.vram_free_gb;
  const pct = Math.round((used / compute.vram_total_gb) * 100);
  const allocs = compute.allocations || {};
  return (
    <div style={{marginBottom: 16}}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 13,
          color: '#aaa',
          marginBottom: 4,
        }}
      >
        <span>
          VRAM: {used.toFixed(1)} / {compute.vram_total_gb.toFixed(1)} GB ({pct}
          %)
        </span>
        <span>Free: {compute.vram_free_gb.toFixed(1)} GB</span>
      </div>
      <div
        style={{
          height: 8,
          background: '#333',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: 4,
            transition: 'width 0.3s',
            width: `${pct}%`,
            background: pct > 85 ? '#f44336' : pct > 60 ? '#FF9800' : '#4CAF50',
          }}
        />
      </div>
      {Object.keys(allocs).length > 0 && (
        <div style={{display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap'}}>
          {Object.entries(allocs).map(([name, info]) => {
            const isRich = typeof info === 'object' && info !== null;
            const gb = isRich ? info.gb : info;
            const device = isRich ? info.device : null;
            const quant = isRich ? info.quant : null;
            const ctx = isRich ? info.context : null;
            const vision = isRich ? info.vision : false;
            const mmproj = isRich ? info.mmproj : null;
            const deviceColor =
              device === 'gpu'
                ? '#4CAF50'
                : device === 'cpu'
                  ? '#FF9800'
                  : '#8899aa';
            return (
              <div
                key={name}
                style={{
                  fontSize: 11,
                  background: '#1a2332',
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid #2a3a4a',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                  <span style={{color: '#ccc', fontWeight: 600}}>{name}</span>
                  <span style={{color: deviceColor, fontWeight: 600}}>
                    {gb?.toFixed?.(1) || gb}GB
                  </span>
                  {device && (
                    <span style={{color: deviceColor, fontSize: 10}}>
                      {device.toUpperCase()}
                    </span>
                  )}
                </div>
                {(quant || ctx || vision || mmproj) && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      fontSize: 10,
                      color: '#99a',
                    }}
                  >
                    {quant && (
                      <span
                        style={{
                          background: '#6C63FF22',
                          color: '#9990ff',
                          padding: '0 4px',
                          borderRadius: 3,
                        }}
                      >
                        {quant}
                      </span>
                    )}
                    {ctx && (
                      <span>
                        ctx:{' '}
                        {typeof ctx === 'number' && ctx >= 1000
                          ? `${Math.round(ctx / 1024)}K`
                          : ctx}
                      </span>
                    )}
                    {vision && <span style={{color: '#4CAF50'}}>VLM</span>}
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

function ModelCard({model, onLoad, onUnload, onDownload, onSetPurpose}) {
  const isLoaded = model.loaded;
  const isDownloaded = model.downloaded;
  // LLMs with vision capability are multimodal — label as MLLM
  const typeLabel =
    model.model_type === 'llm' && (model.tags || []).includes('vision')
      ? 'MLLM'
      : MODEL_TYPE_LABELS[model.model_type] || model.model_type;
  const deviceColor = DEVICE_COLORS[model.device] || '#666';
  const [dlStatus, setDlStatus] = useState(null); // {status, percent, message}
  const [staleOpen, setStaleOpen] = useState(false);
  const validPurposes = ALL_PURPOSES;
  const activePurposes = model.purposes || [];
  const staleReasons = (model.stale_reasons || []).join(' | ') || 'stale state';
  const staleReasonId = `stale-reason-${model.id}`;

  // Poll download progress when downloading
  useEffect(() => {
    if (!dlStatus || dlStatus.status !== 'downloading') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/admin/models/${model.id}/download/status`
        );
        if (res.ok) {
          const data = await res.json();
          setDlStatus(data);
          if (data.status === 'complete' || data.status === 'error') {
            clearInterval(interval);
            if (data.status === 'complete') {
              // Refresh parent to update downloaded state
              setTimeout(() => window.location.reload(), 1000);
            }
          }
        }
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [dlStatus, model.id]);

  const handleDownload = () => {
    setDlStatus({status: 'downloading', percent: 0, message: 'Starting...'});
    onDownload(model.id);
  };

  return (
    <div
      style={{
        background: '#1a2332',
        borderRadius: 8,
        padding: 16,
        border: '1px solid #2a3a4a',
        opacity: model.enabled === false ? 0.5 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{fontWeight: 600, fontSize: 14, color: '#fff'}}>
            {model.name}
          </div>
          <div style={{fontSize: 12, color: '#8899aa', marginTop: 2}}>
            {model.id}
          </div>
        </div>
        <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
          {model.stale && (
            <>
              <button
                type="button"
                aria-describedby={staleReasonId}
                aria-expanded={staleOpen}
                onClick={() => setStaleOpen((v) => !v)}
                title={staleReasons}
                style={{
                  fontSize: 11,
                  padding: '6px 10px',
                  minHeight: 32,
                  borderRadius: 10,
                  background: '#f4433644',
                  color: '#f44336',
                  fontWeight: 600,
                  border: '1px solid #f44336',
                  cursor: 'pointer',
                }}
              >
                ⚠ stale
              </button>
              <span
                id={staleReasonId}
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: 'hidden',
                  clip: 'rect(0,0,0,0)',
                  whiteSpace: 'nowrap',
                  border: 0,
                }}
              >
                {staleReasons}
              </span>
              {staleOpen && (
                <div
                  role="note"
                  style={{
                    fontSize: 11,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: '#2a1a1a',
                    color: '#ffcdd2',
                    border: '1px solid #f44336',
                    maxWidth: 260,
                  }}
                >
                  {staleReasons}
                </div>
              )}
            </>
          )}
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 10,
              background: '#6C63FF22',
              color: '#6C63FF',
              fontWeight: 600,
            }}
          >
            {typeLabel}
          </span>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 10,
              background: deviceColor + '22',
              color: deviceColor,
              fontWeight: 600,
            }}
          >
            {model.device || 'unloaded'}
          </span>
          {activePurposes.map((p) => (
            <span
              key={p}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 10,
                background: (PURPOSE_COLORS[p] || '#6C63FF') + '22',
                color: PURPOSE_COLORS[p] || '#6C63FF',
                fontWeight: 600,
              }}
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* Purpose selector — multi-toggle */}
      <div
        style={{display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center'}}
      >
        <span style={{fontSize: 11, color: '#99a'}}>Purpose:</span>
        {validPurposes.map((p) => {
          const isOn = activePurposes.includes(p);
          return (
            <button
              key={p}
              onClick={() => onSetPurpose(model.id, p, !isOn)}
              style={{
                ...btnStyle(isOn ? PURPOSE_COLORS[p] || '#6C63FF' : '#2a3a4a'),
                padding: '2px 10px',
                fontSize: 11,
              }}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* Specs row */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          fontSize: 12,
          color: '#8899aa',
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        {model.vram_gb > 0 && <span>VRAM: {model.vram_gb}GB</span>}
        {model.ram_gb > 0 && <span>RAM: {model.ram_gb}GB</span>}
        {model.disk_gb > 0 && <span>Disk: {model.disk_gb}GB</span>}
        <span>Backend: {model.backend}</span>
        {model.cost_per_1k > 0 && (
          <span style={{color: '#FF9800'}}>
            ${model.cost_per_1k.toFixed(4)}/1K tok
          </span>
        )}
        {model.languages?.length > 0 && (
          <span>
            Lang: {model.languages.slice(0, 5).join(', ')}
            {model.languages.length > 5 ? '...' : ''}
          </span>
        )}
      </div>

      {/* Quality/Speed bars */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          fontSize: 11,
          color: '#99a',
          marginBottom: 10,
        }}
      >
        <div style={{flex: 1}}>
          <span>Quality</span>
          <div
            style={{
              height: 4,
              background: '#333',
              borderRadius: 2,
              marginTop: 2,
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 2,
                width: `${(model.quality_score || 0) * 100}%`,
                background: '#6C63FF',
              }}
            />
          </div>
        </div>
        <div style={{flex: 1}}>
          <span>Speed</span>
          <div
            style={{
              height: 4,
              background: '#333',
              borderRadius: 2,
              marginTop: 2,
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 2,
                width: `${(model.speed_score || 0) * 100}%`,
                background: '#4CAF50',
              }}
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {model.error && (
        <div style={{fontSize: 12, color: '#f44336', marginBottom: 8}}>
          {model.error}
        </div>
      )}

      {/* Tags */}
      {model.tags?.length > 0 && (
        <div
          style={{display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap'}}
        >
          {model.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 4,
                background: '#2a3a4a',
                color: '#8899aa',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Download progress bar */}
      {dlStatus && dlStatus.status === 'downloading' && (
        <div style={{marginBottom: 10}}>
          <div style={{fontSize: 11, color: '#FF9800', marginBottom: 4}}>
            {dlStatus.message || 'Downloading...'}
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(dlStatus.percent || 0)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Download progress"
            aria-valuetext={`${Math.round(dlStatus.percent || 0)}% — ${dlStatus.message || 'downloading'}`}
            style={{height: 4, background: '#333', borderRadius: 2}}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 2,
                background: '#FF9800',
                width: `${Math.max(5, dlStatus.percent || 0)}%`,
                transition: 'width 0.5s',
                animation:
                  dlStatus.percent === 0 ? 'pulse 1.5s infinite' : 'none',
              }}
            />
          </div>
        </div>
      )}
      {dlStatus && dlStatus.status === 'complete' && (
        <div style={{fontSize: 12, color: '#4CAF50', marginBottom: 8}}>
          Download complete
        </div>
      )}
      {dlStatus && dlStatus.status === 'error' && (
        <div style={{fontSize: 12, color: '#f44336', marginBottom: 8}}>
          {dlStatus.message}
        </div>
      )}

      {/* Actions */}
      <div style={{display: 'flex', gap: 8}}>
        {!isDownloaded && model.source !== 'api' && model.source !== 'pip' && (
          <button
            onClick={handleDownload}
            disabled={dlStatus?.status === 'downloading'}
            style={btnStyle(
              dlStatus?.status === 'downloading' ? '#555' : '#FF9800'
            )}
          >
            {dlStatus?.status === 'downloading' ? 'Downloading...' : 'Download'}
          </button>
        )}
        {!isLoaded &&
          (isDownloaded ||
            model.source === 'api' ||
            model.source === 'pip') && (
            <button
              onClick={() => onLoad(model.id)}
              style={btnStyle('#4CAF50')}
            >
              Load
            </button>
          )}
        {isLoaded && (
          <button
            onClick={() => onUnload(model.id)}
            style={btnStyle('#f44336')}
          >
            Unload
          </button>
        )}
      </div>
    </div>
  );
}

const btnStyle = (color) => ({
  padding: '4px 12px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  color: '#fff',
  background: color,
});

function AddModelDialog({onClose, onSave}) {
  const [form, setForm] = useState({
    id: '',
    name: '',
    model_type: 'llm',
    source: 'huggingface',
    repo_id: '',
    backend: 'llama.cpp',
    vram_gb: 0,
    ram_gb: 1,
    disk_gb: 0,
    supports_gpu: true,
    supports_cpu: true,
    quality_score: 0.7,
    speed_score: 0.7,
    priority: 50,
    languages: '',
    tags: '',
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
      languages: form.languages
        ? form.languages.split(',').map((s) => s.trim())
        : [],
      tags: form.tags ? form.tags.split(',').map((s) => s.trim()) : [],
      enabled: true,
    };
    onSave(entry);
  };

  const inputStyle = {
    width: '100%',
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #2a3a4a',
    background: '#0d1520',
    color: '#fff',
    fontSize: 13,
    boxSizing: 'border-box',
  };
  const labelStyle = {
    fontSize: 12,
    color: '#8899aa',
    marginBottom: 2,
    display: 'block',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#1a2332',
          borderRadius: 12,
          padding: 24,
          width: 480,
          maxHeight: '80vh',
          overflow: 'auto',
          border: '1px solid #2a3a4a',
        }}
      >
        <h3 style={{color: '#fff', margin: '0 0 16px', fontSize: 16}}>
          Register New Model
        </h3>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
          <div>
            <label style={labelStyle}>ID (slug)</label>
            <input
              style={inputStyle}
              value={form.id}
              required
              onChange={(e) => setForm((f) => ({...f, id: e.target.value}))}
              placeholder="my-custom-tts"
            />
          </div>
          <div>
            <label style={labelStyle}>Display Name</label>
            <input
              style={inputStyle}
              value={form.name}
              required
              onChange={(e) => setForm((f) => ({...f, name: e.target.value}))}
              placeholder="My Custom TTS"
            />
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select
              style={inputStyle}
              value={form.model_type}
              onChange={(e) =>
                setForm((f) => ({...f, model_type: e.target.value}))
              }
            >
              {Object.entries(MODEL_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Source</label>
            <select
              style={inputStyle}
              value={form.source}
              onChange={(e) => setForm((f) => ({...f, source: e.target.value}))}
            >
              <option value="huggingface">HuggingFace</option>
              <option value="ollama">Ollama</option>
              <option value="pip">pip package</option>
              <option value="api">Remote API</option>
              <option value="local">Local file</option>
              <option value="github">GitHub release</option>
            </select>
          </div>
          <div style={{gridColumn: '1 / -1'}}>
            <label style={labelStyle}>Repo / Package / URL</label>
            <input
              style={inputStyle}
              value={form.repo_id}
              onChange={(e) =>
                setForm((f) => ({...f, repo_id: e.target.value}))
              }
              placeholder="unsloth/Qwen3.5-4B-GGUF or chatterbox-tts"
            />
          </div>
          <div>
            <label style={labelStyle}>Backend</label>
            <select
              style={inputStyle}
              value={form.backend}
              onChange={(e) =>
                setForm((f) => ({...f, backend: e.target.value}))
              }
            >
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
            <input
              style={inputStyle}
              type="number"
              step="0.1"
              value={form.vram_gb}
              onChange={(e) =>
                setForm((f) => ({...f, vram_gb: e.target.value}))
              }
            />
          </div>
          <div>
            <label style={labelStyle}>RAM (GB)</label>
            <input
              style={inputStyle}
              type="number"
              step="0.1"
              value={form.ram_gb}
              onChange={(e) => setForm((f) => ({...f, ram_gb: e.target.value}))}
            />
          </div>
          <div>
            <label style={labelStyle}>Disk (GB)</label>
            <input
              style={inputStyle}
              type="number"
              step="0.1"
              value={form.disk_gb}
              onChange={(e) =>
                setForm((f) => ({...f, disk_gb: e.target.value}))
              }
            />
          </div>
          <div>
            <label style={labelStyle}>Quality (0-1)</label>
            <input
              style={inputStyle}
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={form.quality_score}
              onChange={(e) =>
                setForm((f) => ({...f, quality_score: e.target.value}))
              }
            />
          </div>
          <div>
            <label style={labelStyle}>Speed (0-1)</label>
            <input
              style={inputStyle}
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={form.speed_score}
              onChange={(e) =>
                setForm((f) => ({...f, speed_score: e.target.value}))
              }
            />
          </div>
          <div style={{gridColumn: '1 / -1'}}>
            <label style={labelStyle}>Languages (comma-separated)</label>
            <input
              style={inputStyle}
              value={form.languages}
              onChange={(e) =>
                setForm((f) => ({...f, languages: e.target.value}))
              }
              placeholder="en, zh, hi, ja"
            />
          </div>
          <div style={{gridColumn: '1 / -1'}}>
            <label style={labelStyle}>Tags (comma-separated)</label>
            <input
              style={inputStyle}
              value={form.tags}
              onChange={(e) => setForm((f) => ({...f, tags: e.target.value}))}
              placeholder="local, recommended, vision, cpu-friendly"
            />
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 16,
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              ...btnStyle('#555'),
              padding: '8px 16px',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              ...btnStyle('#6C63FF'),
              padding: '8px 16px',
            }}
          >
            Register
          </button>
        </div>
      </form>
    </div>
  );
}

function BrowseHuggingFaceTab({onInstalled}) {
  const [category, setCategory] = useState('llm');
  const [lang, setLang] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('downloads');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [installing, setInstalling] = useState(null);
  // Structured install rejection (400/403/415/504) → modal/banner.
  // Shape: { code, hf_id, publisher?, reason? } — see HFInstallModal.
  const [installError, setInstallError] = useState(null);
  const [timeoutAttempt, setTimeoutAttempt] = useState(0);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({category, sort, limit: '20'});
      if (lang) params.set('lang', lang);
      if (search) params.set('search', search);
      const res = await fetch(
        `/api/admin/models/hub/search?${params.toString()}`
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'search failed');
      setResults(body.results || []);
    } catch (e) {
      setError(String(e.message || e));
      setResults([]);
    }
    setLoading(false);
  }, [category, lang, sort, search]);

  useEffect(() => {
    runSearch();
  }, [runSearch]);

  // Core install — accepts optional `extra` body fields (e.g.
  // { confirm_unverified: true } after the 403 override).  Structured
  // rejections with a known code are surfaced via installError → modal.
  const install = useCallback(
    async (m, extra = {}) => {
      setInstalling(m.id);
      try {
        const res = await fetch('/api/admin/models/hub/install', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            hf_id: m.id,
            category,
            purposes: [category].filter((p) => ALL_PURPOSES.includes(p)),
            languages: lang ? [lang] : [],
            ...extra,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const code = body.code || body.error_code;
          if (code && STRUCTURED_HF_ERROR_CODES.has(code)) {
            setInstallError({
              code,
              hf_id: m.id,
              publisher:
                body.publisher ||
                (m.id.includes('/') ? m.id.split('/')[0] : null),
              reason: body.reason || body.message || body.error,
            });
            if (code !== 'hf_timeout') setTimeoutAttempt(0);
            setInstalling(null);
            return;
          }
          // Unknown error shape — still no alert(); inline error text.
          setError(
            `Install failed: ${body.error || body.message || res.status}`
          );
          setInstalling(null);
          return;
        }
        // Success — clear any lingering banner state.
        setInstallError(null);
        setTimeoutAttempt(0);
        if (onInstalled) onInstalled(body.model_id);
      } catch (e) {
        // Network-level failure (CORS, offline) — inline, not modal.
        setError(`Install failed: ${e.message || e}`);
      }
      setInstalling(null);
    },
    [category, lang, onInstalled]
  );

  // 403 override — retry with confirm_unverified flag.
  const handleConfirmUnverified = useCallback(
    (hfId, extra) => {
      setInstallError(null);
      install({id: hfId}, extra);
    },
    [install]
  );

  // 415 deep-link — pre-fill search with safetensors hint, dismiss modal.
  const handleFindSafetensors = useCallback((hfId) => {
    const base = hfId.includes('/') ? hfId.split('/')[1] : hfId;
    setSearch(`${base} safetensors`);
    setInstallError(null);
  }, []);

  // 504 retry — exponential backoff owned by the banner; we just re-fire.
  const handleRetryTimeout = useCallback(
    (hfId, nextAttempt) => {
      setTimeoutAttempt(nextAttempt);
      install({id: hfId});
    },
    [install]
  );

  const dismissInstallError = useCallback(() => {
    setInstallError(null);
    setTimeoutAttempt(0);
  }, []);

  // 504 → inline banner at top of tab; all other codes → modal overlay.
  const showTimeoutBanner =
    installError && installError.code === 'hf_timeout';
  const showModal =
    installError && installError.code !== 'hf_timeout';

  return (
    <div>
      {showTimeoutBanner && (
        <HFInstallModal.TimeoutBanner
          hfId={installError.hf_id}
          attempt={timeoutAttempt}
          onRetry={(next) => handleRetryTimeout(installError.hf_id, next)}
          onDismiss={dismissInstallError}
        />
      )}
      {showModal && (
        <HFInstallModal
          error={installError}
          onConfirmUnverified={handleConfirmUnverified}
          onFindSafetensors={handleFindSafetensors}
          onRetryTimeout={handleRetryTimeout}
          onDismiss={dismissInstallError}
          timeoutAttempt={timeoutAttempt}
        />
      )}
      <div
        style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12}}
      >
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            padding: '6px 10px',
            background: '#1a2430',
            color: '#fff',
            border: '1px solid #2a3a4a',
            borderRadius: 6,
          }}
        >
          {HUB_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          placeholder="Language (e.g. ta, hi, zh)"
          value={lang}
          onChange={(e) => setLang(e.target.value.toLowerCase().trim())}
          style={{
            padding: '6px 10px',
            background: '#1a2430',
            color: '#fff',
            border: '1px solid #2a3a4a',
            borderRadius: 6,
            width: 150,
          }}
        />
        <input
          placeholder="Search (e.g. qwen, whisper)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '6px 10px',
            background: '#1a2430',
            color: '#fff',
            border: '1px solid #2a3a4a',
            borderRadius: 6,
            width: 200,
          }}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{
            padding: '6px 10px',
            background: '#1a2430',
            color: '#fff',
            border: '1px solid #2a3a4a',
            borderRadius: 6,
          }}
        >
          <option value="downloads">Most downloaded</option>
          <option value="trending-score">Trending</option>
          <option value="likes">Most liked</option>
        </select>
        <button
          onClick={runSearch}
          style={{...btnStyle('#6C63FF'), padding: '6px 14px'}}
        >
          Refresh
        </button>
      </div>
      {error && <div style={{color: '#f44336', marginBottom: 8}}>{error}</div>}
      {loading && (
        <div style={{color: '#8899aa'}}>Querying HuggingFace Hub…</div>
      )}
      {!loading && !error && results.length === 0 && (
        <div style={{color: '#99a', padding: 20}}>No models found.</div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
          gap: 10,
        }}
      >
        {results.map((m) => (
          <div
            key={m.id}
            style={{
              background: '#0e1620',
              border: '1px solid #1e2a38',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div
              style={{display: 'flex', justifyContent: 'space-between', gap: 8}}
            >
              <div style={{minWidth: 0, flex: 1}}>
                <div
                  style={{
                    fontWeight: 600,
                    color: '#fff',
                    fontSize: 13,
                    wordBreak: 'break-all',
                  }}
                >
                  {m.id}
                </div>
                <div style={{fontSize: 11, color: '#8899aa', marginTop: 2}}>
                  ⬇ {m.downloads.toLocaleString()} · ♥{' '}
                  {m.likes.toLocaleString()}
                  {m.pipeline_tag && ` · ${m.pipeline_tag}`}
                </div>
              </div>
              <button
                onClick={() => install(m)}
                disabled={installing === m.id}
                aria-label={
                  installing === m.id
                    ? `Installing ${m.id}`
                    : `Install ${m.id}`
                }
                aria-busy={installing === m.id}
                style={{
                  ...btnStyle(installing === m.id ? '#666' : '#4CAF50'),
                  padding: '10px 16px',
                  minHeight: 44,
                  minWidth: 44,
                  fontSize: 12,
                }}
              >
                {installing === m.id ? '...' : 'Install'}
              </button>
            </div>
            {m.tags && m.tags.length > 0 && (
              <div
                style={{
                  marginTop: 6,
                  display: 'flex',
                  gap: 4,
                  flexWrap: 'wrap',
                }}
              >
                {m.tags.slice(0, 6).map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 8,
                      background: '#1a2430',
                      color: '#8899aa',
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ModelManagementPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [mode, setMode] = useState('installed'); // 'installed' | 'browse'
  const [showAdd, setShowAdd] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [providerCaps, setProviderCaps] = useState(null);

  const fetchModels = useCallback(async () => {
    try {
      const [modelsRes, capsRes] = await Promise.all([
        fetch('/api/admin/models').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/admin/providers/capabilities').then((r) =>
          r.ok ? r.json() : null
        ),
      ]);
      if (modelsRes) setData(modelsRes);
      if (capsRes) setProviderCaps(capsRes.capabilities);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const doAction = async (modelId, action) => {
    setActionInProgress(modelId);
    try {
      await fetch(`/api/admin/models/${modelId}/${action}`, {method: 'POST'});
      await fetchModels();
    } catch {
      /* ignore */
    }
    setActionInProgress(null);
  };

  const handleSetPurpose = async (modelId, purpose, enabled) => {
    try {
      await fetch(`/api/admin/models/${modelId}/set-purpose`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({purpose, enabled}),
      });
      await fetchModels();
    } catch {
      /* ignore */
    }
  };

  const handleSaveNew = async (entry) => {
    try {
      await fetch('/api/admin/models', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(entry),
      });
      setShowAdd(false);
      await fetchModels();
    } catch {
      /* ignore */
    }
  };

  if (loading)
    return (
      <div style={{color: '#fff', padding: 40, textAlign: 'center'}}>
        Loading model catalog...
      </div>
    );
  if (!data)
    return (
      <div style={{color: '#f44336', padding: 40, textAlign: 'center'}}>
        Failed to load model catalog
      </div>
    );

  const types = Object.keys(data.models_by_type || {});
  const models =
    filter === 'all'
      ? data.all_models || []
      : data.models_by_type?.[filter] || [];

  return (
    <div style={{padding: '24px 32px', maxWidth: 1200, margin: '0 auto'}}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h2 style={{color: '#fff', margin: 0, fontSize: 20}}>
          Model Management
        </h2>
        <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
          <span style={{fontSize: 13, color: '#8899aa'}}>
            {data.loaded_count} loaded / {data.downloaded_count} downloaded /{' '}
            {data.total_models} total
            {data.stale_count > 0 && (
              <span style={{color: '#f44336', marginLeft: 8}}>
                · {data.stale_count} stale
              </span>
            )}
            {providerCaps && Object.keys(providerCaps).length > 0 && (
              <span style={{color: '#6C63FF', marginLeft: 8}}>
                ·{' '}
                {
                  Object.values(providerCaps)
                    .flat()
                    .filter((v, i, a) => a.indexOf(v) === i).length
                }{' '}
                cloud providers
              </span>
            )}
          </span>
          <button
            onClick={() => setShowAdd(true)}
            style={{...btnStyle('#6C63FF'), padding: '6px 14px'}}
          >
            + Add Model
          </button>
        </div>
      </div>

      {/* Mode toggle: Installed catalog vs Browse HuggingFace Hub */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          borderBottom: '1px solid #1e2a38',
        }}
      >
        <button
          onClick={() => setMode('installed')}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            color: mode === 'installed' ? '#6C63FF' : '#8899aa',
            border: 'none',
            borderBottom:
              mode === 'installed'
                ? '2px solid #6C63FF'
                : '2px solid transparent',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Installed ({data.total_models})
        </button>
        <button
          onClick={() => setMode('browse')}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            color: mode === 'browse' ? '#6C63FF' : '#8899aa',
            border: 'none',
            borderBottom:
              mode === 'browse' ? '2px solid #6C63FF' : '2px solid transparent',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Browse HuggingFace
        </button>
      </div>

      {mode === 'browse' ? (
        <BrowseHuggingFaceTab onInstalled={fetchModels} />
      ) : (
        <>
          {/* VRAM bar */}
          <VRAMBar compute={data.compute} />

          {/* RAM info */}
          {data.compute?.ram_free_gb > 0 && (
            <div style={{fontSize: 13, color: '#8899aa', marginBottom: 16}}>
              RAM free: {data.compute.ram_free_gb} GB
              {data.compute.gpu_type !== 'none' &&
                ` | GPU: ${data.compute.gpu_type.toUpperCase()}`}
            </div>
          )}

          {/* Type filter tabs */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 20,
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={() => setFilter('all')}
              style={{
                ...btnStyle(filter === 'all' ? '#6C63FF' : '#2a3a4a'),
                padding: '4px 12px',
              }}
            >
              All ({data.total_models})
            </button>
            {types.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  ...btnStyle(filter === t ? '#6C63FF' : '#2a3a4a'),
                  padding: '4px 12px',
                }}
              >
                {MODEL_TYPE_LABELS[t] || t} (
                {(data.models_by_type[t] || []).length})
              </button>
            ))}
          </div>

          {/* Model grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: 12,
            }}
          >
            {models.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                onLoad={(id) => doAction(id, 'load')}
                onUnload={(id) => doAction(id, 'unload')}
                onDownload={(id) => doAction(id, 'download')}
                onSetPurpose={handleSetPurpose}
              />
            ))}
          </div>

          {models.length === 0 && (
            <div style={{textAlign: 'center', color: '#99a', padding: 40}}>
              No models found for this filter.
            </div>
          )}
        </>
      )}

      {showAdd && (
        <AddModelDialog
          onClose={() => setShowAdd(false)}
          onSave={handleSaveNew}
        />
      )}
    </div>
  );
}
