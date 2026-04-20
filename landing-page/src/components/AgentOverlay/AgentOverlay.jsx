import { API_BASE_URL } from '../../config/apiBase';
import { NUNBA_CAMERA_CONSENT } from '../../constants/events';
import realtimeService from '../../services/realtimeService';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import InfoIcon from '@mui/icons-material/Info';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  Box, Typography, Button, IconButton, LinearProgress, TextField,
  Fade, Grow, Chip, Rating,
} from '@mui/material';
import DOMPurify from 'dompurify';
import React, { useState, useEffect, useRef, useCallback } from 'react';

const MAX_OVERLAYS = 3;
const AUTO_DISMISS_MS = 15000;
const PERSIST_TYPES = new Set(['checkout', 'approval', 'form']);

const GLASS = {
  background: 'rgba(20, 20, 30, 0.92)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  color: '#fff',
};

const ACCENT = '#6C63FF';
const INFO_BLUE = '#64C8FF';
const SUCCESS = '#2ECC71';
const ERROR_RED = '#FF6B6B';

let _overlayIdCounter = 0;

// ─── Type-specific renderers ─────────────────────────────────────────

function NotificationCard({ data }) {
  const colors = { info: INFO_BLUE, success: SUCCESS, error: ERROR_RED, warning: '#F39C12' };
  const accent = colors[data.severity] || INFO_BLUE;
  return (
    <Box>
      <Box sx={{ width: 4, height: '100%', position: 'absolute', left: 0, top: 0, borderRadius: '16px 0 0 16px', background: accent }} />
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>{data.title || 'Notification'}</Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>{data.message || data.content}</Typography>
    </Box>
  );
}

function ProductCardOverlay({ data }) {
  return (
    <Box>
      {data.image_url && (
        <Box component="img" src={data.image_url} alt={data.name}
          sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: '8px', mb: 1 }} />
      )}
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{data.name}</Typography>
      {data.description && (
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mb: 0.5 }}>
          {data.description}
        </Typography>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
        {data.price != null && <Typography sx={{ fontWeight: 700, color: ACCENT }}>{data.currency || '$'}{data.price}</Typography>}
        {data.rating != null && <Rating value={data.rating} precision={0.5} size="small" readOnly />}
      </Box>
      {data.buy_action && (
        <Button variant="contained" size="small" fullWidth
          sx={{ mt: 1, background: ACCENT, '&:hover': { background: '#5A52E0' } }}
          onClick={() => window.open(data.buy_action, '_blank')}>
          Buy
        </Button>
      )}
    </Box>
  );
}

function CartOverlay({ data }) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <ShoppingCartIcon sx={{ fontSize: 20, color: ACCENT }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Cart</Typography>
      </Box>
      {(data.items || []).map((item, i) => (
        <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.3 }}>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>{item.name}</Typography>
          <Typography variant="body2" sx={{ color: ACCENT }}>{item.price}</Typography>
        </Box>
      ))}
      <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.1)', mt: 1, pt: 1, display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>Total</Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, color: ACCENT }}>{data.total}</Typography>
      </Box>
      {data.checkout_action && (
        <Button variant="contained" size="small" fullWidth
          sx={{ mt: 1, background: ACCENT, '&:hover': { background: '#5A52E0' } }}>
          Checkout
        </Button>
      )}
    </Box>
  );
}

function CheckoutOverlay({ data }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Confirm Payment</Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1 }}>
        {data.items_count || 0} items &middot; {data.total || data.amount}
      </Typography>
      {data.payment_methods && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
          {data.payment_methods.map((m, i) => <Chip key={i} label={m} size="small" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }} variant="outlined" />)}
        </Box>
      )}
      <Button variant="contained" fullWidth
        sx={{ background: SUCCESS, '&:hover': { background: '#27AE60' } }}
        onClick={() => data.confirm_action && fetch(data.confirm_action, { method: 'POST' })}>
        Confirm Payment
      </Button>
    </Box>
  );
}

function PaymentStatusOverlay({ data }) {
  const icons = { success: <CheckCircleIcon sx={{ fontSize: 40, color: SUCCESS }} />, pending: <HourglassEmptyIcon sx={{ fontSize: 40, color: '#F39C12' }} />, error: <ErrorIcon sx={{ fontSize: 40, color: ERROR_RED }} /> };
  return (
    <Box sx={{ textAlign: 'center' }}>
      {icons[data.status] || icons.pending}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 1, textTransform: 'capitalize' }}>{data.status}</Typography>
      {data.amount && <Typography variant="h6" sx={{ fontWeight: 700, color: ACCENT }}>{data.amount}</Typography>}
      {data.method && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>via {data.method}</Typography>}
    </Box>
  );
}

function OrderTrackingOverlay({ data }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Order {data.order_id || ''}</Typography>
      {(data.steps || []).map((step, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
          {step.completed
            ? <CheckCircleIcon sx={{ fontSize: 16, color: SUCCESS }} />
            : <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)' }} />}
          <Typography variant="body2" sx={{ color: step.completed ? '#fff' : 'rgba(255,255,255,0.5)' }}>{step.label || step.name}</Typography>
        </Box>
      ))}
      {data.eta && <Typography variant="caption" sx={{ color: INFO_BLUE, mt: 1, display: 'block' }}>ETA: {data.eta}</Typography>}
    </Box>
  );
}

function ComparisonOverlay({ data }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Comparison</Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        {(data.apps || []).map((app, i) => (
          <Box key={i} sx={{ flex: 1, p: 1, borderRadius: '8px', background: 'rgba(255,255,255,0.05)', textAlign: 'center' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{app.name}</Typography>
            {app.rating != null && <Rating value={app.rating} precision={0.5} size="small" readOnly />}
          </Box>
        ))}
      </Box>
      {data.winner && <Typography variant="caption" sx={{ color: SUCCESS, mt: 1, display: 'block' }}>Winner: {data.winner}</Typography>}
    </Box>
  );
}

function ProgressOverlay({ data }) {
  const pct = data.percent ?? data.value ?? 0;
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2">{data.label || data.title || 'Progress'}</Typography>
        <Typography variant="body2" sx={{ color: ACCENT }}>{Math.round(pct)}%</Typography>
      </Box>
      <LinearProgress variant="determinate" value={pct}
        sx={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(108,99,255,0.15)',
          '& .MuiLinearProgress-bar': { borderRadius: 3, background: `linear-gradient(90deg, ${ACCENT}, #9B59B6)` } }} />
    </Box>
  );
}

function AgentActionOverlay({ data }) {
  const icons = { running: <PlayCircleIcon sx={{ color: INFO_BLUE }} />, completed: <CheckCircleIcon sx={{ color: SUCCESS }} />, error: <ErrorIcon sx={{ color: ERROR_RED }} /> };
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      {icons[data.status] || icons.running}
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.action || data.title || 'Agent Action'}</Typography>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>{data.description}</Typography>
        {data.result && <Typography variant="caption" sx={{ color: SUCCESS, display: 'block', mt: 0.5 }}>{data.result}</Typography>}
      </Box>
    </Box>
  );
}

function ApprovalOverlay({ data, onDismiss }) {
  const postDecision = (decision) => {
    fetch(`${API_BASE_URL}/api/agent/approval`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: data.agent_id, action: data.action, decision }),
    }).catch(() => {});

    // Camera consent → NunbaChatProvider listens for this event and
    // mounts useCameraFrameStream, which opens WS to VisionService
    // :5460 and pipes JPEG frames at ~1fps.  The server protocol is
    // (user_id digit, 'video_start', binary frames) — not JSON.
    const _action = String(data.action || '').toLowerCase();
    if (_action.includes('camera') || _action.includes('video')) {
      try {
        window.dispatchEvent(new CustomEvent(NUNBA_CAMERA_CONSENT, {
          detail: {
            approved: decision === 'approve',
            user_id: data.user_id || data.agent_id,
          },
        }));
      } catch { /* CustomEvent unavailable (older WebView) */ }
    }

    onDismiss();
  };
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>{data.title || 'Approval Required'}</Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1.5 }}>{data.description}</Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="contained" size="small" sx={{ background: SUCCESS, flex: 1, '&:hover': { background: '#27AE60' } }} onClick={() => postDecision('approve')}>Approve</Button>
        <Button variant="outlined" size="small" sx={{ color: ERROR_RED, borderColor: ERROR_RED, flex: 1 }} onClick={() => postDecision('deny')}>Deny</Button>
        <Button variant="outlined" size="small" sx={{ color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.2)' }} onClick={() => postDecision('later')}>Later</Button>
      </Box>
    </Box>
  );
}

function ChartOverlay({ data }) {
  const items = data.data || data.items || [];
  const max = Math.max(...items.map(d => d.value || 0), 1);
  return (
    <Box>
      {data.title && <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{data.title}</Typography>}
      {items.map((d, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="caption" sx={{ width: 60, textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>{d.label}</Typography>
          <Box sx={{ flex: 1, height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
            <Box sx={{ width: `${(d.value / max) * 100}%`, height: '100%', borderRadius: 6, background: `linear-gradient(90deg, ${ACCENT}, #9B59B6)` }} />
          </Box>
          <Typography variant="caption" sx={{ width: 30, color: ACCENT }}>{d.value}</Typography>
        </Box>
      ))}
    </Box>
  );
}

function CodeOverlay({ data }) {
  return (
    <Box>
      {data.filename && <Typography variant="caption" sx={{ color: ACCENT, mb: 0.5, display: 'block' }}>{data.filename}</Typography>}
      <Box component="pre" sx={{ background: '#1a1a2e', p: 1.5, borderRadius: '8px', overflowX: 'auto', fontSize: '0.75rem', fontFamily: 'monospace', color: '#e0e0e0', m: 0, maxHeight: 200 }}>
        <code>{data.code || data.content}</code>
      </Box>
    </Box>
  );
}

function MarkdownOverlay({ data }) {
  const text = data.content || data.text || '';
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" style="color:#64C8FF">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n/g, '<br/>');
  return <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}

function MediaOverlay({ data }) {
  const t = data.media_type || (data.url?.match(/\.(mp4|webm)/) ? 'video' : data.url?.match(/\.(mp3|wav|ogg)/) ? 'audio' : 'image');
  if (t === 'video') return <Box component="video" controls src={data.url} sx={{ width: '100%', borderRadius: '8px' }} />;
  if (t === 'audio') return <Box component="audio" controls src={data.url} sx={{ width: '100%' }} />;
  return <Box component="img" src={data.url} alt={data.alt || ''} sx={{ width: '100%', borderRadius: '8px' }} />;
}

function MetricOverlay({ data }) {
  const arrows = { up: <TrendingUpIcon sx={{ color: SUCCESS }} />, down: <TrendingDownIcon sx={{ color: ERROR_RED }} />, flat: <TrendingFlatIcon sx={{ color: 'rgba(255,255,255,0.4)' }} /> };
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography sx={{ fontSize: 32, fontWeight: 700, color: ACCENT }}>{data.value}</Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>{data.label}</Typography>
      {data.trend && <Box sx={{ mt: 0.5 }}>{arrows[data.trend] || arrows.flat}</Box>}
    </Box>
  );
}

function FormOverlay({ data, onDismiss }) {
  const [values, setValues] = useState({});
  const handleSubmit = () => {
    if (data.action) {
      fetch(data.action.startsWith('http') ? data.action : `${API_BASE_URL}${data.action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      }).catch(() => {});
    }
    onDismiss();
  };
  return (
    <Box>
      {data.title && <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{data.title}</Typography>}
      {(data.fields || []).map((f, i) => (
        <TextField key={i} label={f.label || f.name} size="small" fullWidth
          type={f.type || 'text'} required={f.required}
          value={values[f.name] || ''} onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
          sx={{ mb: 1, '& .MuiInputBase-root': { color: '#fff', background: 'rgba(255,255,255,0.05)' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' } }} />
      ))}
      <Button variant="contained" size="small" fullWidth sx={{ background: ACCENT, '&:hover': { background: '#5A52E0' } }} onClick={handleSubmit}>
        {data.submit_label || 'Submit'}
      </Button>
    </Box>
  );
}

function ListOverlay({ data }) {
  const Tag = data.ordered ? 'ol' : 'ul';
  return (
    <Box>
      {data.title && <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>{data.title}</Typography>}
      <Box component={Tag} sx={{ pl: 2, m: 0, color: 'rgba(255,255,255,0.8)', '& li': { mb: 0.3, fontSize: '0.85rem' } }}>
        {(data.items || []).map((item, i) => <li key={i}>{typeof item === 'string' ? item : item.text || item.label}</li>)}
      </Box>
    </Box>
  );
}

function LayoutOverlay({ data }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: data.direction || 'column', gap: data.gap || 1 }}>
      {(data.children || []).map((child, i) => (
        <Box key={i}><OverlayContent data={child} /></Box>
      ))}
    </Box>
  );
}

// ─── Router: picks the right renderer ────────────────────────────────

function OverlayContent({ data, onDismiss }) {
  const type = data.type || data.component_type || 'notification';
  switch (type) {
    case 'notification': return <NotificationCard data={data} />;
    case 'product_card': return <ProductCardOverlay data={data} />;
    case 'cart': return <CartOverlay data={data} />;
    case 'checkout': return <CheckoutOverlay data={data} />;
    case 'payment_status': return <PaymentStatusOverlay data={data} />;
    case 'order_tracking': return <OrderTrackingOverlay data={data} />;
    case 'comparison': return <ComparisonOverlay data={data} />;
    case 'progress': return <ProgressOverlay data={data} />;
    case 'agent_action': return <AgentActionOverlay data={data} />;
    case 'approval': return <ApprovalOverlay data={data} onDismiss={onDismiss} />;
    case 'chart': return <ChartOverlay data={data} />;
    case 'code': return <CodeOverlay data={data} />;
    case 'markdown': return <MarkdownOverlay data={data} />;
    case 'media': return <MediaOverlay data={data} />;
    case 'metric': return <MetricOverlay data={data} />;
    case 'form': return <FormOverlay data={data} onDismiss={onDismiss} />;
    case 'list': return <ListOverlay data={data} />;
    case 'layout': return <LayoutOverlay data={data} />;
    default:
      return (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{data.title || type}</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>{data.message || data.content || JSON.stringify(data)}</Typography>
        </Box>
      );
  }
}

// ─── Main Overlay Manager ────────────────────────────────────────────

export default function AgentOverlay({ navigate, onInlineChatCard }) {
  const [overlays, setOverlays] = useState([]);
  const timersRef = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setOverlays(prev => prev.filter(o => o._id !== id));
  }, []);

  const handleEvent = useCallback((payload) => {
    if (!payload) return;
    const type = payload.type || payload.component_type || 'notification';

    // Navigate type: orchestrate page navigation, don't render overlay
    if (type === 'navigate' && navigate && payload.target) {
      navigate(payload.target);
      return;
    }

    // Inline chat card types: forward to Demopage message list AND show overlay
    if (onInlineChatCard && ['product_card', 'cart', 'checkout', 'comparison'].includes(type)) {
      onInlineChatCard(payload);
    }

    const id = ++_overlayIdCounter;
    const entry = { ...payload, _id: id, _type: type };

    setOverlays(prev => {
      const next = [...prev, entry];
      // FIFO eviction if over max
      while (next.length > MAX_OVERLAYS) {
        const evicted = next.shift();
        clearTimeout(timersRef.current[evicted._id]);
        delete timersRef.current[evicted._id];
      }
      return next;
    });

    // Auto-dismiss (except persistent types)
    if (!PERSIST_TYPES.has(type)) {
      timersRef.current[id] = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    }
  }, [navigate, onInlineChatCard, dismiss]);

  useEffect(() => {
    // Single subscription — realtimeService handles all transports
    // (WAMP primary, SSE fallback with auto-reconnect and dedup).
    // No transport-specific code here.
    const unsub = realtimeService.on('agent.ui.update', handleEvent);

    return () => {
      unsub();
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, [handleEvent]);

  if (overlays.length === 0) return null;

  return (
    <Box sx={{
      position: 'fixed', bottom: { xs: 16, md: 80 }, right: { xs: 8, md: 16 },
      zIndex: 9998, display: 'flex', flexDirection: 'column-reverse', gap: 1.5,
      width: { xs: 'calc(100% - 16px)', sm: 340 }, maxHeight: '80vh', pointerEvents: 'none',
    }}>
      {overlays.map((overlay) => (
        <Grow in key={overlay._id} timeout={300}>
          <Box sx={{
            ...GLASS, p: 2, position: 'relative', pointerEvents: 'auto',
            animation: 'agentSlideUp 0.3s ease',
            '@keyframes agentSlideUp': { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
          }}>
            {/* Agent badge */}
            {overlay.agent_id && (
              <Chip label={overlay.agent_id} size="small"
                sx={{ position: 'absolute', top: 8, left: 12, fontSize: '0.65rem', height: 20,
                  background: 'rgba(108,99,255,0.2)', color: ACCENT, border: '1px solid rgba(108,99,255,0.3)' }} />
            )}
            {/* Close button */}
            <IconButton size="small" onClick={() => dismiss(overlay._id)}
              sx={{ position: 'absolute', top: 4, right: 4, color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#fff' } }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <Box sx={{ mt: overlay.agent_id ? 2.5 : 0 }}>
              <OverlayContent data={overlay} onDismiss={() => dismiss(overlay._id)} />
            </Box>
          </Box>
        </Grow>
      ))}
    </Box>
  );
}
