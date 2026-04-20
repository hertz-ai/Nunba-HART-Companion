import {settingsApi, chatApi} from '../../services/socialApi';

import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import HistoryIcon from '@mui/icons-material/History';
import ImageIcon from '@mui/icons-material/Image';
import MemoryIcon from '@mui/icons-material/Memory';
import SaveIcon from '@mui/icons-material/Save';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import {
  Typography,
  Card,
  CardContent,
  Button,
  Switch,
  FormControlLabel,
  TextField,
  Slider,
  Box,
  Tabs,
  Tab,
  Skeleton,
  Fade,
  Grow,
} from '@mui/material';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import React, {useState, useEffect} from 'react';

// Card style
const cardStyle = {
  background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 3,
};

// Input styles
const inputStyle = {
  '& .MuiOutlinedInput-root': {
    color: '#fff',
    background: 'rgba(0,0,0,0.2)',
    borderRadius: 2,
    '& fieldset': {borderColor: 'rgba(255,255,255,0.1)'},
    '&:hover fieldset': {borderColor: 'rgba(108, 99, 255, 0.3)'},
    '&.Mui-focused fieldset': {borderColor: '#6C63FF'},
  },
  '& .MuiInputLabel-root': {color: 'rgba(255,255,255,0.5)'},
  '& .MuiInputLabel-root.Mui-focused': {color: '#6C63FF'},
};

// Switch style
const switchStyle = {
  '& .MuiSwitch-switchBase.Mui-checked': {
    color: '#6C63FF',
  },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
    backgroundColor: '#6C63FF',
  },
};

// Slider style
const sliderStyle = {
  color: '#6C63FF',
  '& .MuiSlider-thumb': {
    '&:hover, &.Mui-focusVisible': {
      boxShadow: '0 0 0 8px rgba(108, 99, 255, 0.16)',
    },
  },
  '& .MuiSlider-rail': {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
};

// Button style
const saveButtonStyle = {
  background: 'linear-gradient(135deg, #6C63FF 0%, #FF6B6B 100%)',
  borderRadius: 2,
  textTransform: 'none',
  fontWeight: 600,
  px: 3,
  transition: 'all 0.3s ease',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 20px rgba(108, 99, 255, 0.3)',
  },
};

function TabPanel({children, value, index}) {
  return value === index ? (
    <Fade in={true} timeout={300}>
      <Box sx={{py: 3}}>{children}</Box>
    </Fade>
  ) : null;
}

// Loading skeleton
function SettingsSkeleton() {
  return (
    <Card sx={cardStyle}>
      <CardContent sx={{p: 3}}>
        <Skeleton variant="text" width={150} height={32} sx={{bgcolor: 'rgba(255,255,255,0.05)', mb: 3}} />
        {[1, 2, 3].map((i) => (
          <Box key={i} sx={{mb: 3}}>
            <Skeleton variant="text" width={200} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
            <Skeleton variant="rounded" height={40} sx={{bgcolor: 'rgba(255,255,255,0.05)', mt: 1}} />
          </Box>
        ))}
        <Skeleton variant="rounded" width={120} height={40} sx={{bgcolor: 'rgba(255,255,255,0.05)', mt: 2}} />
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [security, setSecurity] = useState({});
  const [media, setMedia] = useState({});
  const [response, setResponse] = useState({});
  const [memory, setMemory] = useState({});
  const [embodied, setEmbodied] = useState({});
  const [embodiedStatus, setEmbodiedStatus] = useState(null);

  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', message: string }

  // AI Provider state
  const [llmConfig, setLlmConfig] = useState(null);
  const [aiProvider, setAiProvider] = useState('openai');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiEndpoint, setAiEndpoint] = useState('');
  const [aiApiVersion, setAiApiVersion] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);
  const [aiTesting, setAiTesting] = useState(false);

  // Chat Restore state (J207) — single source of truth is the
  // /api/admin/config/chat endpoint which reads desktop.chat_settings.
  // Defaults match the backend dataclass so the UI never flashes
  // stale values on first paint.
  const [chatRestore, setChatRestore] = useState({
    restore_policy: 'always',
    restore_scope: 'all_agents',
    cloud_sync_enabled: false,
  });
  const [forgetBusy, setForgetBusy] = useState(false);

  const CLOUD_PROVIDERS = {
    openai: {name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-3.5-turbo'], default: 'gpt-4o-mini', needsEndpoint: false, needsApiVersion: false},
    anthropic: {name: 'Anthropic Claude', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'], default: 'claude-sonnet-4-20250514', needsEndpoint: false, needsApiVersion: false},
    azure_openai: {name: 'Azure OpenAI', models: [], default: '', needsEndpoint: true, needsApiVersion: true},
    google_gemini: {name: 'Google Gemini', models: ['gemini-2.0-flash', 'gemini-2.5-pro'], default: 'gemini-2.0-flash', needsEndpoint: false, needsApiVersion: false},
    groq: {name: 'Groq', models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'], default: 'llama-3.3-70b-versatile', needsEndpoint: false, needsApiVersion: false},
    custom_openai: {name: 'Custom OpenAI-compatible', models: [], default: '', needsEndpoint: true, needsApiVersion: false},
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [sec, med, resp, mem, emb] = await Promise.all([
          settingsApi.getSecurity(),
          settingsApi.getMedia(),
          settingsApi.getResponse(),
          settingsApi.getMemory(),
          settingsApi.getEmbodiedAI(),
        ]);
        setSecurity(sec.data || {});
        setMedia(med.data || {});
        setResponse(resp.data || {});
        setMemory(mem.data || {});
        setEmbodied(emb.data || {});
      } catch (err) {
        console.error('[SettingsPage] Failed to load settings:', err);
        const msg = err?.error || err?.message || '';
        if (msg.includes('Authorization') || msg.includes('token')) {
          setFeedback({type: 'error', message: 'Authentication required. Please log in with an admin account.'});
        }
      }
      // Chat Restore (J207) — separate try/catch so a missing endpoint
      // on an older backend doesn't flash an auth error for the whole
      // page. Defaults already set in state; only overwrite on success.
      try {
        const cr = await settingsApi.getChat();
        if (cr?.data) setChatRestore((prev) => ({...prev, ...cr.data}));
      } catch (err) {
        console.warn('[SettingsPage] Chat restore config unavailable:', err?.message || err);
      }
      // Load LLM config separately (may not have backend running)
      try {
        const llm = await chatApi.getLlmConfig();
        const cfg = llm.data || {};
        setLlmConfig(cfg);
        if (cfg.provider) setAiProvider(cfg.provider);
        if (cfg.model) setAiModel(cfg.model);
        if (cfg.base_url) setAiEndpoint(cfg.base_url);
        if (cfg.api_version) setAiApiVersion(cfg.api_version);
      } catch (err) {
        console.warn('[SettingsPage] LLM config unavailable (backend may not be running):', err?.message || err);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async (section, data) => {
    setSaving(section);
    setFeedback(null);
    try {
      const api = {
        security: settingsApi.updateSecurity,
        media: settingsApi.updateMedia,
        response: settingsApi.updateResponse,
        memory: settingsApi.updateMemory,
        embodied: settingsApi.updateEmbodiedAI,
      };
      await api[section](data);
      setFeedback({type: 'success', message: `${section.charAt(0).toUpperCase() + section.slice(1)} settings saved`});
    } catch (err) {
      console.error(`[SettingsPage] Failed to save ${section}:`, err);
      setFeedback({type: 'error', message: `Failed to save ${section} settings. ${err?.message || ''}`});
    }
    setSaving(null);
  };

  const refreshEmbodiedStatus = async () => {
    try {
      const res = await settingsApi.getEmbodiedStatus();
      setEmbodiedStatus(res.data || null);
    } catch (err) {
      setEmbodiedStatus({hevolveai_health: {status: 'unreachable'}});
    }
  };

  const handleProviderChange = (providerId) => {
    setAiProvider(providerId);
    const prov = CLOUD_PROVIDERS[providerId];
    if (prov && prov.default) setAiModel(prov.default);
    else setAiModel('');
    setAiApiKey('');
    setAiEndpoint('');
    setAiApiVersion('');
    setAiTestResult(null);
  };

  const handleTestConnection = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await chatApi.testLlmConnection({
        provider: aiProvider,
        api_key: aiApiKey,
        model: aiModel,
        base_url: aiEndpoint || undefined,
        api_version: aiApiVersion || undefined,
      });
      setAiTestResult({success: true, message: res.data?.message || 'Connection successful'});
    } catch (err) {
      setAiTestResult({success: false, message: err.response?.data?.error || 'Connection failed'});
    }
    setAiTesting(false);
  };

  const handleSaveAiProvider = async () => {
    setSaving('ai_provider');
    try {
      await chatApi.updateLlmConfig({
        provider: aiProvider,
        api_key: aiApiKey,
        model: aiModel,
        base_url: aiEndpoint || undefined,
        api_version: aiApiVersion || undefined,
      });
      // Refresh config to show updated state
      const llm = await chatApi.getLlmConfig();
      setLlmConfig(llm.data || {});
      setFeedback({type: 'success', message: 'AI Provider saved successfully'});
    } catch (err) {
      console.error('[SettingsPage] Failed to save AI provider:', err);
      setFeedback({type: 'error', message: err.response?.data?.error || 'Failed to save AI provider'});
    }
    setSaving(null);
  };

  // Chat Restore (J207) — partial-update PUT: only send the field(s)
  // that changed so an older backend that doesn't know about
  // cloud_sync_enabled still accepts the policy/scope keys it does
  // understand.
  const handleSaveChatRestore = async (patch) => {
    setSaving('chat_restore');
    setFeedback(null);
    try {
      const res = await settingsApi.updateChat(patch);
      if (res?.data) setChatRestore((prev) => ({...prev, ...res.data}));
      setFeedback({type: 'success', message: 'Chat restore settings saved'});
    } catch (err) {
      console.error('[SettingsPage] Failed to save chat restore:', err);
      setFeedback({type: 'error', message: err.response?.data?.error || 'Failed to save chat restore settings'});
    }
    setSaving(null);
  };

  const handleForgetMe = async () => {
    // Destructive: wipes ~/Documents/Nunba/data/guest_id.json so the
    // next chat turn derives a fresh id. Confirm at the browser level
    // because no amount of server-side undo brings back the old id.
    const ok = window.confirm(
      'Forget this device? Your guest identity will be wiped and a new one ' +
      'derived on next chat. Agent history bound to the old identity will no ' +
      'longer be accessible. This cannot be undone.',
    );
    if (!ok) return;
    setForgetBusy(true);
    setFeedback(null);
    try {
      const res = await chatApi.forgetGuest();
      const prev = res?.data?.previous_guest_id || '(none)';
      setFeedback({type: 'success', message: `Device forgotten. Previous id: ${prev}`});
    } catch (err) {
      console.error('[SettingsPage] Failed to forget device:', err);
      setFeedback({type: 'error', message: err.response?.data?.error || 'Failed to forget device'});
    }
    setForgetBusy(false);
  };

  const tabs = [
    {icon: <SecurityIcon />, label: 'Security', color: '#ff9800'},
    {icon: <ImageIcon />, label: 'Media', color: '#9c27b0'},
    {icon: <ChatIcon />, label: 'Response', color: '#6C63FF'},
    {icon: <MemoryIcon />, label: 'Memory', color: '#7C4DFF'},
    {icon: <VisibilityIcon />, label: 'Embodied AI', color: '#e91e63'},
    {icon: <SmartToyIcon />, label: 'AI Provider', color: '#4CAF50'},
    {icon: <HistoryIcon />, label: 'Chat Restore', color: '#00BCD4'},
  ];

  return (
    <Fade in={true} timeout={300}>
      <Box>
        {/* Page Header */}
        <Box sx={{mb: 4}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
            <Box sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(255, 107, 107, 0.15) 100%)',
            }}>
              <SettingsIcon sx={{
                fontSize: 24,
                background: 'linear-gradient(135deg, #6C63FF 0%, #FF6B6B 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }} />
            </Box>
            <Box>
              <Typography variant="h4" sx={{
                fontWeight: 700,
                background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Settings
              </Typography>
              <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                Configure your agent's behavior and capabilities
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Tabs */}
        <Grow in={true} timeout={400}>
          <Box sx={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 3,
            p: 0.5,
            mb: 3,
            display: 'inline-flex',
          }}>
            <Tabs
              value={tab}
              onChange={(e, v) => setTab(v)}
              sx={{
                minHeight: 48,
                '& .MuiTabs-indicator': {
                  display: 'none',
                },
              }}
            >
              {tabs.map((t, index) => (
                <Tab
                  key={t.label}
                  icon={t.icon}
                  label={t.label}
                  iconPosition="start"
                  sx={{
                    minHeight: 48,
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 500,
                    color: tab === index ? '#fff' : 'rgba(255,255,255,0.5)',
                    background: tab === index
                      ? `linear-gradient(135deg, ${t.color}30 0%, ${t.color}10 100%)`
                      : 'transparent',
                    border: tab === index ? `1px solid ${t.color}40` : '1px solid transparent',
                    transition: 'all 0.3s ease',
                    mx: 0.5,
                    '&:hover': {
                      color: '#fff',
                      background: tab === index
                        ? `linear-gradient(135deg, ${t.color}30 0%, ${t.color}10 100%)`
                        : 'rgba(255,255,255,0.05)',
                    },
                    '& .MuiSvgIcon-root': {
                      color: tab === index ? t.color : 'inherit',
                    },
                  }}
                />
              ))}
            </Tabs>
          </Box>
        </Grow>

        {/* Feedback Banner */}
        {feedback && (
          <Fade in={true} timeout={200}>
            <Box sx={{
              mb: 2, p: 2, borderRadius: 2,
              background: feedback.type === 'success'
                ? 'linear-gradient(135deg, rgba(108,99,255,0.1) 0%, rgba(155,148,255,0.1) 100%)'
                : 'linear-gradient(135deg, rgba(255,68,68,0.1) 0%, rgba(255,100,100,0.1) 100%)',
              border: `1px solid ${feedback.type === 'success' ? 'rgba(108,99,255,0.3)' : 'rgba(255,68,68,0.3)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <Typography variant="body2" sx={{color: feedback.type === 'success' ? '#6C63FF' : '#ff4444'}}>
                {feedback.message}
              </Typography>
              <IconButton size="small" onClick={() => setFeedback(null)}
                sx={{color: feedback.type === 'success' ? 'rgba(108,99,255,0.7)' : 'rgba(255,68,68,0.7)'}}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Fade>
        )}

        {/* Tab Panels */}
        {loading ? (
          <SettingsSkeleton />
        ) : (
          <>
            <TabPanel value={tab} index={0}>
              <Grow in={true} timeout={500}>
                <Card sx={cardStyle}>
                  <CardContent sx={{p: 4}}>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 4}}>
                      <SecurityIcon sx={{color: '#ff9800'}} />
                      <Typography variant="h6" sx={{color: '#fff', fontWeight: 600}}>
                        Security Settings
                      </Typography>
                    </Box>

                    <Box sx={{mb: 3}}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={security.require_auth || false}
                            onChange={(e) =>
                              setSecurity({...security, require_auth: e.target.checked})
                            }
                            sx={switchStyle}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{color: '#fff', fontWeight: 500}}>
                              Require Authentication
                            </Typography>
                            <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                              Users must be authenticated to interact with the agent
                            </Typography>
                          </Box>
                        }
                        sx={{alignItems: 'flex-start', ml: 0}}
                      />
                    </Box>

                    <Box sx={{mb: 3}}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={security.rate_limiting || false}
                            onChange={(e) =>
                              setSecurity({...security, rate_limiting: e.target.checked})
                            }
                            sx={switchStyle}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{color: '#fff', fontWeight: 500}}>
                              Enable Rate Limiting
                            </Typography>
                            <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                              Protect against abuse by limiting request frequency
                            </Typography>
                          </Box>
                        }
                        sx={{alignItems: 'flex-start', ml: 0}}
                      />
                    </Box>

                    <TextField
                      fullWidth
                      label="Rate Limit (requests/min)"
                      type="number"
                      value={security.rate_limit || 60}
                      onChange={(e) =>
                        setSecurity({...security, rate_limit: parseInt(e.target.value)})
                      }
                      sx={{...inputStyle, mb: 3}}
                    />

                    <Button
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={() => handleSave('security', security)}
                      disabled={saving === 'security'}
                      sx={saveButtonStyle}
                    >
                      {saving === 'security' ? 'Saving...' : 'Save Security'}
                    </Button>
                  </CardContent>
                </Card>
              </Grow>
            </TabPanel>

            <TabPanel value={tab} index={1}>
              <Grow in={true} timeout={500}>
                <Card sx={cardStyle}>
                  <CardContent sx={{p: 4}}>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 4}}>
                      <ImageIcon sx={{color: '#9c27b0'}} />
                      <Typography variant="h6" sx={{color: '#fff', fontWeight: 600}}>
                        Media Settings
                      </Typography>
                    </Box>

                    <Box sx={{mb: 3}}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={media.image_generation_enabled || false}
                            onChange={(e) =>
                              setMedia({...media, image_generation_enabled: e.target.checked})
                            }
                            sx={switchStyle}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{color: '#fff', fontWeight: 500}}>
                              Enable Image Generation
                            </Typography>
                            <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                              Allow the agent to generate images using AI
                            </Typography>
                          </Box>
                        }
                        sx={{alignItems: 'flex-start', ml: 0}}
                      />
                    </Box>

                    <Box sx={{mb: 3}}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={media.tts_enabled || false}
                            onChange={(e) =>
                              setMedia({...media, tts_enabled: e.target.checked})
                            }
                            sx={switchStyle}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{color: '#fff', fontWeight: 500}}>
                              Enable Text-to-Speech
                            </Typography>
                            <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                              Convert agent responses to audio
                            </Typography>
                          </Box>
                        }
                        sx={{alignItems: 'flex-start', ml: 0}}
                      />
                    </Box>

                    <TextField
                      fullWidth
                      label="Max File Size (MB)"
                      type="number"
                      value={media.max_file_size_mb || 25}
                      onChange={(e) =>
                        setMedia({...media, max_file_size_mb: parseInt(e.target.value)})
                      }
                      sx={{...inputStyle, mb: 3}}
                    />

                    <Button
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={() => handleSave('media', media)}
                      disabled={saving === 'media'}
                      sx={saveButtonStyle}
                    >
                      {saving === 'media' ? 'Saving...' : 'Save Media'}
                    </Button>
                  </CardContent>
                </Card>
              </Grow>
            </TabPanel>

            <TabPanel value={tab} index={2}>
              <Grow in={true} timeout={500}>
                <Card sx={cardStyle}>
                  <CardContent sx={{p: 4}}>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 4}}>
                      <ChatIcon sx={{color: '#6C63FF'}} />
                      <Typography variant="h6" sx={{color: '#fff', fontWeight: 600}}>
                        Response Settings
                      </Typography>
                    </Box>

                    <Box sx={{mb: 4}}>
                      <Box sx={{display: 'flex', justifyContent: 'space-between', mb: 1}}>
                        <Typography sx={{color: '#fff', fontWeight: 500}}>Temperature</Typography>
                        <Typography sx={{
                          color: '#6C63FF',
                          fontWeight: 600,
                          background: 'rgba(108, 99, 255, 0.1)',
                          px: 1.5,
                          py: 0.25,
                          borderRadius: 1,
                        }}>
                          {response.temperature || 0.7}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)', mb: 2}}>
                        Controls randomness: lower is more focused, higher is more creative
                      </Typography>
                      <Slider
                        value={response.temperature || 0.7}
                        min={0}
                        max={2}
                        step={0.1}
                        onChange={(e, v) => setResponse({...response, temperature: v})}
                        sx={sliderStyle}
                      />
                    </Box>

                    <Box sx={{mb: 4}}>
                      <Box sx={{display: 'flex', justifyContent: 'space-between', mb: 1}}>
                        <Typography sx={{color: '#fff', fontWeight: 500}}>Max Tokens</Typography>
                        <Typography sx={{
                          color: '#6C63FF',
                          fontWeight: 600,
                          background: 'rgba(108, 99, 255, 0.1)',
                          px: 1.5,
                          py: 0.25,
                          borderRadius: 1,
                        }}>
                          {response.max_tokens || 2048}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)', mb: 2}}>
                        Maximum length of generated responses
                      </Typography>
                      <Slider
                        value={response.max_tokens || 2048}
                        min={256}
                        max={8192}
                        step={256}
                        onChange={(e, v) => setResponse({...response, max_tokens: v})}
                        sx={sliderStyle}
                      />
                    </Box>

                    <Button
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={() => handleSave('response', response)}
                      disabled={saving === 'response'}
                      sx={saveButtonStyle}
                    >
                      {saving === 'response' ? 'Saving...' : 'Save Response'}
                    </Button>
                  </CardContent>
                </Card>
              </Grow>
            </TabPanel>

            <TabPanel value={tab} index={3}>
              <Grow in={true} timeout={500}>
                <Card sx={cardStyle}>
                  <CardContent sx={{p: 4}}>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 4}}>
                      <MemoryIcon sx={{color: '#7C4DFF'}} />
                      <Typography variant="h6" sx={{color: '#fff', fontWeight: 600}}>
                        Memory Settings
                      </Typography>
                    </Box>

                    <Box sx={{mb: 3}}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={memory.long_term || false}
                            onChange={(e) =>
                              setMemory({...memory, long_term: e.target.checked})
                            }
                            sx={switchStyle}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{color: '#fff', fontWeight: 500}}>
                              Enable Long-term Memory
                            </Typography>
                            <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                              Agent remembers information across conversations
                            </Typography>
                          </Box>
                        }
                        sx={{alignItems: 'flex-start', ml: 0}}
                      />
                    </Box>

                    <TextField
                      fullWidth
                      label="Context Window Size"
                      type="number"
                      value={memory.context_window || 10}
                      onChange={(e) =>
                        setMemory({...memory, context_window: parseInt(e.target.value)})
                      }
                      sx={{...inputStyle, mb: 3}}
                      helperText="Number of recent messages to include in context"
                      FormHelperTextProps={{sx: {color: 'rgba(255,255,255,0.4)'}}}
                    />

                    <TextField
                      fullWidth
                      label="Memory Retention (days)"
                      type="number"
                      value={memory.retention_days || 30}
                      onChange={(e) =>
                        setMemory({...memory, retention_days: parseInt(e.target.value)})
                      }
                      sx={{...inputStyle, mb: 3}}
                      helperText="How long to retain long-term memories"
                      FormHelperTextProps={{sx: {color: 'rgba(255,255,255,0.4)'}}}
                    />

                    <Button
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={() => handleSave('memory', memory)}
                      disabled={saving === 'memory'}
                      sx={saveButtonStyle}
                    >
                      {saving === 'memory' ? 'Saving...' : 'Save Memory'}
                    </Button>
                  </CardContent>
                </Card>
              </Grow>
            </TabPanel>

            <TabPanel value={tab} index={4}>
              <Grow in={true} timeout={500}>
                <Card sx={cardStyle}>
                  <CardContent sx={{p: 4}}>
                    <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4}}>
                      <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
                        <VisibilityIcon sx={{color: '#e91e63'}} />
                        <Typography variant="h6" sx={{color: '#fff', fontWeight: 600}}>
                          Embodied AI Settings
                        </Typography>
                      </Box>
                      {embodiedStatus && (
                        <Chip
                          label={embodiedStatus.hevolveai_health?.status === 'healthy' ? 'Connected' : 'Offline'}
                          size="small"
                          sx={{
                            bgcolor: embodiedStatus.hevolveai_health?.status === 'healthy'
                              ? 'rgba(108,99,255,0.15)' : 'rgba(244,67,54,0.15)',
                            color: embodiedStatus.hevolveai_health?.status === 'healthy'
                              ? '#6C63FF' : '#f44336',
                            fontWeight: 600,
                          }}
                        />
                      )}
                    </Box>

                    <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)', mb: 3}}>
                      Configure HevolveAI's continuous learning feeds — screen capture, camera, microphone, and learning modes. Changes propagate to the learning engine.
                    </Typography>

                    {/* Master toggle */}
                    <Box sx={{mb: 3, p: 2, borderRadius: 2, background: 'rgba(233,30,99,0.08)', border: '1px solid rgba(233,30,99,0.2)'}}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={embodied.enabled !== false}
                            onChange={(e) =>
                              setEmbodied({...embodied, enabled: e.target.checked})
                            }
                            sx={switchStyle}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{color: '#fff', fontWeight: 500}}>
                              Enable Embodied Learning
                            </Typography>
                            <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                              Master switch for all sensory feeds and continuous learning
                            </Typography>
                          </Box>
                        }
                        sx={{alignItems: 'flex-start', ml: 0}}
                      />
                    </Box>

                    {/* Screen Capture */}
                    <Typography variant="subtitle2" sx={{color: '#e91e63', fontWeight: 600, mb: 2, mt: 3}}>
                      Screen Capture
                    </Typography>
                    <Box sx={{mb: 2}}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={embodied.screen_capture_enabled !== false}
                            onChange={(e) =>
                              setEmbodied({...embodied, screen_capture_enabled: e.target.checked})
                            }
                            sx={switchStyle}
                            disabled={!embodied.enabled}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{color: '#fff', fontWeight: 500}}>Enable Screen Capture</Typography>
                            <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                              Captures screenshots for reality-grounded learning
                            </Typography>
                          </Box>
                        }
                        sx={{alignItems: 'flex-start', ml: 0}}
                      />
                    </Box>
                    <Box sx={{mb: 3}}>
                      <Box sx={{display: 'flex', justifyContent: 'space-between', mb: 1}}>
                        <Typography sx={{color: '#fff', fontWeight: 500}}>Screen Capture FPS</Typography>
                        <Typography sx={{
                          color: '#e91e63', fontWeight: 600,
                          background: 'rgba(233,30,99,0.1)', px: 1.5, py: 0.25, borderRadius: 1,
                        }}>
                          {embodied.screen_capture_fps || 0.5}
                        </Typography>
                      </Box>
                      <Slider
                        value={embodied.screen_capture_fps || 0.5}
                        min={0.1} max={5} step={0.1}
                        onChange={(e, v) => setEmbodied({...embodied, screen_capture_fps: v})}
                        sx={sliderStyle}
                        disabled={!embodied.enabled || !embodied.screen_capture_enabled}
                      />
                    </Box>

                    {/* Camera */}
                    <Typography variant="subtitle2" sx={{color: '#e91e63', fontWeight: 600, mb: 2}}>
                      Camera Feed
                    </Typography>
                    <Box sx={{mb: 2}}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={embodied.camera_enabled !== false}
                            onChange={(e) =>
                              setEmbodied({...embodied, camera_enabled: e.target.checked})
                            }
                            sx={switchStyle}
                            disabled={!embodied.enabled}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{color: '#fff', fontWeight: 500}}>Enable Camera</Typography>
                            <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                              Webcam feed for embodied visual learning
                            </Typography>
                          </Box>
                        }
                        sx={{alignItems: 'flex-start', ml: 0}}
                      />
                    </Box>
                    <Box sx={{display: 'flex', gap: 2, mb: 3}}>
                      <Box sx={{flex: 1}}>
                        <Box sx={{display: 'flex', justifyContent: 'space-between', mb: 1}}>
                          <Typography sx={{color: '#fff', fontWeight: 500}}>Camera FPS</Typography>
                          <Typography sx={{
                            color: '#e91e63', fontWeight: 600,
                            background: 'rgba(233,30,99,0.1)', px: 1.5, py: 0.25, borderRadius: 1,
                          }}>
                            {embodied.camera_fps || 2.0}
                          </Typography>
                        </Box>
                        <Slider
                          value={embodied.camera_fps || 2.0}
                          min={0.5} max={30} step={0.5}
                          onChange={(e, v) => setEmbodied({...embodied, camera_fps: v})}
                          sx={sliderStyle}
                          disabled={!embodied.enabled || !embodied.camera_enabled}
                        />
                      </Box>
                      <TextField
                        label="Camera ID"
                        type="number"
                        value={embodied.camera_id || 0}
                        onChange={(e) =>
                          setEmbodied({...embodied, camera_id: parseInt(e.target.value)})
                        }
                        sx={{...inputStyle, width: 120}}
                        disabled={!embodied.enabled || !embodied.camera_enabled}
                      />
                    </Box>

                    {/* Audio */}
                    <Typography variant="subtitle2" sx={{color: '#e91e63', fontWeight: 600, mb: 2}}>
                      Microphone
                    </Typography>
                    <Box sx={{mb: 2}}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={embodied.audio_enabled !== false}
                            onChange={(e) =>
                              setEmbodied({...embodied, audio_enabled: e.target.checked})
                            }
                            sx={switchStyle}
                            disabled={!embodied.enabled}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{color: '#fff', fontWeight: 500}}>Enable Microphone</Typography>
                            <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                              Audio-visual correlation learning (typing sounds, system sounds)
                            </Typography>
                          </Box>
                        }
                        sx={{alignItems: 'flex-start', ml: 0}}
                      />
                    </Box>
                    <Box sx={{display: 'flex', gap: 2, mb: 3}}>
                      <TextField
                        label="Sample Rate (Hz)"
                        type="number"
                        value={embodied.audio_sample_rate || 16000}
                        onChange={(e) =>
                          setEmbodied({...embodied, audio_sample_rate: parseInt(e.target.value)})
                        }
                        sx={{...inputStyle, flex: 1}}
                        disabled={!embodied.enabled || !embodied.audio_enabled}
                      />
                      <Box sx={{flex: 1}}>
                        <Box sx={{display: 'flex', justifyContent: 'space-between', mb: 1}}>
                          <Typography sx={{color: '#fff', fontWeight: 500}}>Chunk Duration (s)</Typography>
                          <Typography sx={{
                            color: '#e91e63', fontWeight: 600,
                            background: 'rgba(233,30,99,0.1)', px: 1.5, py: 0.25, borderRadius: 1,
                          }}>
                            {embodied.audio_chunk_duration || 1.0}
                          </Typography>
                        </Box>
                        <Slider
                          value={embodied.audio_chunk_duration || 1.0}
                          min={0.1} max={5} step={0.1}
                          onChange={(e, v) => setEmbodied({...embodied, audio_chunk_duration: v})}
                          sx={sliderStyle}
                          disabled={!embodied.enabled || !embodied.audio_enabled}
                        />
                      </Box>
                    </Box>

                    {/* Learning Mode */}
                    <Typography variant="subtitle2" sx={{color: '#e91e63', fontWeight: 600, mb: 2}}>
                      Learning Configuration
                    </Typography>
                    <Box sx={{display: 'flex', gap: 2, mb: 3}}>
                      <FormControl sx={{flex: 1}} disabled={!embodied.enabled}>
                        <InputLabel sx={{color: 'rgba(255,255,255,0.5)', '&.Mui-focused': {color: '#e91e63'}}}>
                          Learning Mode
                        </InputLabel>
                        <Select
                          value={embodied.learning_mode || 'hybrid'}
                          onChange={(e) =>
                            setEmbodied({...embodied, learning_mode: e.target.value})
                          }
                          label="Learning Mode"
                          sx={{
                            color: '#fff',
                            background: 'rgba(0,0,0,0.2)',
                            '& .MuiOutlinedInput-notchedOutline': {borderColor: 'rgba(255,255,255,0.1)'},
                            '&:hover .MuiOutlinedInput-notchedOutline': {borderColor: 'rgba(233,30,99,0.3)'},
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {borderColor: '#e91e63'},
                            '& .MuiSvgIcon-root': {color: 'rgba(255,255,255,0.5)'},
                          }}
                        >
                          <MenuItem value="passive">Passive (observe only)</MenuItem>
                          <MenuItem value="active">Active (explore + act)</MenuItem>
                          <MenuItem value="hybrid">Hybrid (observe + explore)</MenuItem>
                        </Select>
                      </FormControl>
                      <FormControl sx={{flex: 1}} disabled={!embodied.enabled}>
                        <InputLabel sx={{color: 'rgba(255,255,255,0.5)', '&.Mui-focused': {color: '#e91e63'}}}>
                          Visual Source
                        </InputLabel>
                        <Select
                          value={embodied.visual_source_mode || 'auto'}
                          onChange={(e) =>
                            setEmbodied({...embodied, visual_source_mode: e.target.value})
                          }
                          label="Visual Source"
                          sx={{
                            color: '#fff',
                            background: 'rgba(0,0,0,0.2)',
                            '& .MuiOutlinedInput-notchedOutline': {borderColor: 'rgba(255,255,255,0.1)'},
                            '&:hover .MuiOutlinedInput-notchedOutline': {borderColor: 'rgba(233,30,99,0.3)'},
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {borderColor: '#e91e63'},
                            '& .MuiSvgIcon-root': {color: 'rgba(255,255,255,0.5)'},
                          }}
                        >
                          <MenuItem value="auto">Auto (intelligent switching)</MenuItem>
                          <MenuItem value="screen">Screen only</MenuItem>
                          <MenuItem value="camera">Camera only</MenuItem>
                        </Select>
                      </FormControl>
                    </Box>

                    {/* Exploration Safety */}
                    <Typography variant="subtitle2" sx={{color: '#e91e63', fontWeight: 600, mb: 2}}>
                      Exploration Safety
                    </Typography>
                    <Box sx={{mb: 2}}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={embodied.exploration_safe_mode !== false}
                            onChange={(e) =>
                              setEmbodied({...embodied, exploration_safe_mode: e.target.checked})
                            }
                            sx={switchStyle}
                            disabled={!embodied.enabled}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{color: '#fff', fontWeight: 500}}>Safe Mode</Typography>
                            <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                              Restricts exploration actions (no file writes, limited rate)
                            </Typography>
                          </Box>
                        }
                        sx={{alignItems: 'flex-start', ml: 0}}
                      />
                    </Box>
                    <TextField
                      fullWidth
                      label="Max Actions Per Minute"
                      type="number"
                      value={embodied.exploration_max_actions_per_min || 10}
                      onChange={(e) =>
                        setEmbodied({...embodied, exploration_max_actions_per_min: parseInt(e.target.value)})
                      }
                      sx={{...inputStyle, mb: 3}}
                      helperText="Rate limit for active exploration actions"
                      FormHelperTextProps={{sx: {color: 'rgba(255,255,255,0.4)'}}}
                      disabled={!embodied.enabled}
                    />

                    {/* HevolveAI URL */}
                    <Typography variant="subtitle2" sx={{color: '#e91e63', fontWeight: 600, mb: 2}}>
                      Connection
                    </Typography>
                    <TextField
                      fullWidth
                      label="HevolveAI API URL"
                      value={embodied.hevolveai_url || 'http://localhost:8000'}
                      onChange={(e) =>
                        setEmbodied({...embodied, hevolveai_url: e.target.value})
                      }
                      sx={{...inputStyle, mb: 3}}
                      helperText="Base URL for the HevolveAI embodied learning server"
                      FormHelperTextProps={{sx: {color: 'rgba(255,255,255,0.4)'}}}
                    />

                    <Box sx={{display: 'flex', gap: 2}}>
                      <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={() => handleSave('embodied', embodied)}
                        disabled={saving === 'embodied'}
                        sx={saveButtonStyle}
                      >
                        {saving === 'embodied' ? 'Saving...' : 'Save Embodied AI'}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={refreshEmbodiedStatus}
                        sx={{
                          borderColor: 'rgba(233,30,99,0.4)',
                          color: '#e91e63',
                          textTransform: 'none',
                          '&:hover': {
                            borderColor: '#e91e63',
                            background: 'rgba(233,30,99,0.08)',
                          },
                        }}
                      >
                        Check Status
                      </Button>
                    </Box>

                    {/* ── HART Identity Reset ── */}
                    <Box sx={{mt: 4, pt: 3, borderTop: '1px solid rgba(255,255,255,0.08)'}}>
                      <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 1}}>
                        <Typography variant="h6" sx={{color: '#fff', fontWeight: 600, fontSize: 15}}>
                          HART Identity
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)', mb: 2}}>
                        Your HART name: <strong style={{color: '#6C63FF'}}>{localStorage.getItem('hart_name') || 'Not set'}</strong>
                        {localStorage.getItem('hart_language') && (
                          <> &middot; Language: <strong style={{color: '#6C63FF'}}>{localStorage.getItem('hart_language')}</strong></>
                        )}
                      </Typography>
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={() => {
                          if (window.confirm('Reset your HART name? You will go through the naming ceremony again.')) {
                            localStorage.removeItem('hart_sealed');
                            localStorage.removeItem('hart_name');
                            localStorage.removeItem('hart_emoji');
                            localStorage.removeItem('hart_language');
                            window.location.href = '/local';
                          }
                        }}
                        sx={{
                          borderColor: 'rgba(244,67,54,0.3)',
                          color: '#f44336',
                          textTransform: 'none',
                          '&:hover': { borderColor: '#f44336', bgcolor: 'rgba(244,67,54,0.08)' },
                        }}
                      >
                        Reset HART Name
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grow>
            </TabPanel>

            {/* ── AI Provider Tab ── */}
            <TabPanel value={tab} index={5}>
              <Grow in={true} timeout={400}>
                <Card sx={cardStyle}>
                  <CardContent sx={{p: 3}}>
                    <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3}}>
                      <Typography variant="h6" sx={{color: '#fff', fontWeight: 600}}>
                        AI Provider Configuration
                      </Typography>
                      {llmConfig?.provider && (
                        <Chip
                          label={`Active: ${CLOUD_PROVIDERS[llmConfig.provider]?.name || llmConfig.provider}`}
                          size="small"
                          sx={{
                            background: 'rgba(76,175,80,0.15)',
                            color: '#4CAF50',
                            border: '1px solid rgba(76,175,80,0.3)',
                            fontWeight: 600,
                          }}
                        />
                      )}
                    </Box>

                    {llmConfig?.llm_mode && (
                      <Alert
                        severity="info"
                        sx={{
                          mb: 3,
                          background: 'rgba(108,99,255,0.08)',
                          border: '1px solid rgba(108,99,255,0.2)',
                          color: '#fff',
                          '& .MuiAlert-icon': {color: '#6C63FF'},
                        }}
                      >
                        Current mode: <strong>{llmConfig.llm_mode}</strong>
                        {llmConfig.model && <> &middot; Model: <strong>{llmConfig.model}</strong></>}
                      </Alert>
                    )}

                    <FormControl fullWidth sx={{mb: 3}}>
                      <InputLabel sx={{color: 'rgba(255,255,255,0.5)'}}>Provider</InputLabel>
                      <Select
                        value={aiProvider}
                        label="Provider"
                        onChange={(e) => handleProviderChange(e.target.value)}
                        sx={{
                          color: '#fff',
                          '& .MuiOutlinedInput-notchedOutline': {borderColor: 'rgba(255,255,255,0.1)'},
                          '&:hover .MuiOutlinedInput-notchedOutline': {borderColor: 'rgba(255,255,255,0.3)'},
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {borderColor: '#4CAF50'},
                          '& .MuiSvgIcon-root': {color: 'rgba(255,255,255,0.5)'},
                        }}
                        MenuProps={{
                          PaperProps: {
                            sx: {background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)'},
                          },
                        }}
                      >
                        {Object.entries(CLOUD_PROVIDERS).map(([id, p]) => (
                          <MenuItem key={id} value={id} sx={{color: '#fff', '&:hover': {background: 'rgba(108,99,255,0.15)'}}}>
                            {p.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <TextField
                      fullWidth
                      label="API Key"
                      type={showApiKey ? 'text' : 'password'}
                      value={aiApiKey}
                      onChange={(e) => setAiApiKey(e.target.value)}
                      placeholder={llmConfig?.has_key ? '••••••••  (key saved — enter new to replace)' : 'Enter API key'}
                      sx={{...inputStyle, mb: 3}}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowApiKey(!showApiKey)}
                              edge="end"
                              sx={{color: 'rgba(255,255,255,0.5)'}}
                            >
                              {showApiKey ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />

                    {CLOUD_PROVIDERS[aiProvider]?.models?.length > 0 ? (
                      <FormControl fullWidth sx={{mb: 3}}>
                        <InputLabel sx={{color: 'rgba(255,255,255,0.5)'}}>Model</InputLabel>
                        <Select
                          value={aiModel}
                          label="Model"
                          onChange={(e) => setAiModel(e.target.value)}
                          sx={{
                            color: '#fff',
                            '& .MuiOutlinedInput-notchedOutline': {borderColor: 'rgba(255,255,255,0.1)'},
                            '&:hover .MuiOutlinedInput-notchedOutline': {borderColor: 'rgba(255,255,255,0.3)'},
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {borderColor: '#4CAF50'},
                            '& .MuiSvgIcon-root': {color: 'rgba(255,255,255,0.5)'},
                          }}
                          MenuProps={{
                            PaperProps: {
                              sx: {background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)'},
                            },
                          }}
                        >
                          {CLOUD_PROVIDERS[aiProvider].models.map((m) => (
                            <MenuItem key={m} value={m} sx={{color: '#fff', '&:hover': {background: 'rgba(108,99,255,0.15)'}}}>
                              {m}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <TextField
                        fullWidth
                        label="Model / Deployment Name"
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        placeholder="e.g. gpt-4o or your deployment name"
                        sx={{...inputStyle, mb: 3}}
                      />
                    )}

                    {CLOUD_PROVIDERS[aiProvider]?.needsEndpoint && (
                      <TextField
                        fullWidth
                        label="Endpoint URL"
                        value={aiEndpoint}
                        onChange={(e) => setAiEndpoint(e.target.value)}
                        placeholder={aiProvider === 'azure_openai' ? 'https://your-resource.openai.azure.com' : 'https://api.example.com/v1'}
                        sx={{...inputStyle, mb: 3}}
                        helperText={aiProvider === 'azure_openai' ? 'Your Azure OpenAI resource endpoint' : 'Base URL for the OpenAI-compatible API'}
                        FormHelperTextProps={{sx: {color: 'rgba(255,255,255,0.4)'}}}
                      />
                    )}

                    {CLOUD_PROVIDERS[aiProvider]?.needsApiVersion && (
                      <TextField
                        fullWidth
                        label="API Version"
                        value={aiApiVersion}
                        onChange={(e) => setAiApiVersion(e.target.value)}
                        placeholder="2024-02-15-preview"
                        sx={{...inputStyle, mb: 3}}
                        helperText="Azure API version string"
                        FormHelperTextProps={{sx: {color: 'rgba(255,255,255,0.4)'}}}
                      />
                    )}

                    {aiTestResult && (
                      <Alert
                        severity={aiTestResult.success ? 'success' : 'error'}
                        sx={{
                          mb: 3,
                          background: aiTestResult.success ? 'rgba(76,175,80,0.08)' : 'rgba(244,67,54,0.08)',
                          border: `1px solid ${aiTestResult.success ? 'rgba(76,175,80,0.3)' : 'rgba(244,67,54,0.3)'}`,
                          color: '#fff',
                          '& .MuiAlert-icon': {color: aiTestResult.success ? '#4CAF50' : '#f44336'},
                        }}
                      >
                        {aiTestResult.message}
                      </Alert>
                    )}

                    <Box sx={{display: 'flex', gap: 2}}>
                      <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={handleSaveAiProvider}
                        disabled={saving === 'ai_provider' || !aiApiKey}
                        sx={saveButtonStyle}
                      >
                        {saving === 'ai_provider' ? 'Saving...' : 'Save AI Provider'}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={handleTestConnection}
                        disabled={aiTesting || !aiApiKey}
                        sx={{
                          borderColor: 'rgba(76,175,80,0.4)',
                          color: '#4CAF50',
                          textTransform: 'none',
                          '&:hover': {
                            borderColor: '#4CAF50',
                            background: 'rgba(76,175,80,0.08)',
                          },
                        }}
                      >
                        {aiTesting ? 'Testing...' : 'Test Connection'}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grow>
            </TabPanel>

            {/* ============ Tab 6: Chat Restore (J207) ============ */}
            <TabPanel value={tab} index={6}>
              <Grow in={true} timeout={400}>
                <Card sx={cardStyle}>
                  <CardContent sx={{p: 3}}>
                    <Typography variant="h6" sx={{color: '#fff', fontWeight: 600, mb: 1}}>
                      Chat Restore Across Restarts
                    </Typography>
                    <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)', mb: 3}}>
                      Control what happens to your conversation history when
                      Nunba restarts or is reinstalled on the same device.
                      Guest identity persists under
                      ~/Documents/Nunba/data/guest_id.json.
                    </Typography>

                    {/* Restore policy */}
                    <FormControl component="fieldset" sx={{mb: 3, width: '100%'}}>
                      <FormLabel sx={{color: '#fff', fontWeight: 500, mb: 1, '&.Mui-focused': {color: '#00BCD4'}}}>
                        When should past messages restore?
                      </FormLabel>
                      <RadioGroup
                        value={chatRestore.restore_policy}
                        onChange={(e) => setChatRestore((p) => ({...p, restore_policy: e.target.value}))}
                        sx={{color: 'rgba(255,255,255,0.8)'}}
                      >
                        <FormControlLabel
                          value="always"
                          control={<Radio sx={{color: 'rgba(255,255,255,0.4)', '&.Mui-checked': {color: '#00BCD4'}}} />}
                          label={<><b>Always</b> — restore every past message on open (default).</>}
                        />
                        <FormControlLabel
                          value="prompt"
                          control={<Radio sx={{color: 'rgba(255,255,255,0.4)', '&.Mui-checked': {color: '#00BCD4'}}} />}
                          label={<><b>Prompt</b> — ask me each time I open the chat.</>}
                        />
                        <FormControlLabel
                          value="session"
                          control={<Radio sx={{color: 'rgba(255,255,255,0.4)', '&.Mui-checked': {color: '#00BCD4'}}} />}
                          label={<><b>Session</b> — keep within one session; wipe on close.</>}
                        />
                        <FormControlLabel
                          value="never"
                          control={<Radio sx={{color: 'rgba(255,255,255,0.4)', '&.Mui-checked': {color: '#00BCD4'}}} />}
                          label={<><b>Never</b> — always start with a blank slate.</>}
                        />
                      </RadioGroup>
                    </FormControl>

                    <Divider sx={{borderColor: 'rgba(255,255,255,0.08)', mb: 3}} />

                    {/* Restore scope */}
                    <FormControl component="fieldset" sx={{mb: 3, width: '100%'}}>
                      <FormLabel sx={{color: '#fff', fontWeight: 500, mb: 1, '&.Mui-focused': {color: '#00BCD4'}}}>
                        Which agents should restore?
                      </FormLabel>
                      <RadioGroup
                        value={chatRestore.restore_scope}
                        onChange={(e) => setChatRestore((p) => ({...p, restore_scope: e.target.value}))}
                        sx={{color: 'rgba(255,255,255,0.8)'}}
                      >
                        <FormControlLabel
                          value="all_agents"
                          control={<Radio sx={{color: 'rgba(255,255,255,0.4)', '&.Mui-checked': {color: '#00BCD4'}}} />}
                          label={<><b>All agents</b> — restore every agent's history (default).</>}
                        />
                        <FormControlLabel
                          value="active_only"
                          control={<Radio sx={{color: 'rgba(255,255,255,0.4)', '&.Mui-checked': {color: '#00BCD4'}}} />}
                          label={<><b>Active agent only</b> — only the agent I'm chatting with.</>}
                        />
                        <FormControlLabel
                          value="manual"
                          control={<Radio sx={{color: 'rgba(255,255,255,0.4)', '&.Mui-checked': {color: '#00BCD4'}}} />}
                          label={<><b>Manual</b> — show the restore banner; nothing loads by itself.</>}
                        />
                      </RadioGroup>
                    </FormControl>

                    <Divider sx={{borderColor: 'rgba(255,255,255,0.08)', mb: 3}} />

                    {/* Cloud sync */}
                    <Box sx={{mb: 3}}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={!!chatRestore.cloud_sync_enabled}
                            onChange={(e) => setChatRestore((p) => ({...p, cloud_sync_enabled: e.target.checked}))}
                            sx={switchStyle}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{color: '#fff', fontWeight: 500}}>
                              Sync chat across devices (cloud)
                            </Typography>
                            <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                              Opt-in. Requires sign-in. When off, history stays on this device only.
                            </Typography>
                          </Box>
                        }
                      />
                    </Box>

                    {/* Save button */}
                    <Box sx={{display: 'flex', gap: 2, alignItems: 'center', mb: 3}}>
                      <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        disabled={saving === 'chat_restore'}
                        onClick={() => handleSaveChatRestore({
                          restore_policy: chatRestore.restore_policy,
                          restore_scope: chatRestore.restore_scope,
                          cloud_sync_enabled: !!chatRestore.cloud_sync_enabled,
                        })}
                        sx={saveButtonStyle}
                      >
                        {saving === 'chat_restore' ? 'Saving...' : 'Save Chat Restore Settings'}
                      </Button>
                    </Box>

                    <Divider sx={{borderColor: 'rgba(255,68,68,0.2)', mb: 3}} />

                    {/* Forget Me — destructive */}
                    <Box sx={{
                      p: 2,
                      borderRadius: 2,
                      background: 'rgba(255,68,68,0.05)',
                      border: '1px solid rgba(255,68,68,0.2)',
                    }}>
                      <Typography variant="h6" sx={{color: '#ff6666', fontWeight: 600, mb: 1}}>
                        Forget this device
                      </Typography>
                      <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.6)', mb: 2}}>
                        Wipes ~/Documents/Nunba/data/guest_id.json. Your next
                        chat starts from a fresh guest identity; agent history
                        keyed to the old identity will no longer be accessible
                        from this device. Cannot be undone.
                      </Typography>
                      <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteForeverIcon />}
                        disabled={forgetBusy}
                        onClick={handleForgetMe}
                        sx={{
                          borderColor: 'rgba(255,68,68,0.4)',
                          color: '#ff6666',
                          textTransform: 'none',
                          fontWeight: 600,
                          '&:hover': {
                            borderColor: '#ff4444',
                            background: 'rgba(255,68,68,0.1)',
                          },
                        }}
                      >
                        {forgetBusy ? 'Forgetting...' : 'Forget this device'}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grow>
            </TabPanel>
          </>
        )}
      </Box>
    </Fade>
  );
}
