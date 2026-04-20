/* eslint-disable no-unused-vars */
import {useNunbaTheme} from '../../../contexts/ThemeContext';
import {themeApi} from '../../../services/socialApi';
import {
  THEME_PRESETS,
  DEFAULT_THEME_CONFIG,
  mergeThemeConfig,
} from '../../../theme/themePresets';

import {
  Palette,
  Check,
  FormatSize,
  Contrast,
  AutoAwesome,
  ColorLens,
  Animation,
  Tune,
  RestartAlt,
  ExpandMore,
  ExpandLess,
  BlurOn,
  Gradient,
  WaterDrop,
  Save,
} from '@mui/icons-material';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Slider,
  Select,
  MenuItem,
  FormControl,
  Switch,
  Button,
  TextField,
  Popover,
  Collapse,
  IconButton,
  Tooltip,
} from '@mui/material';
import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {HexColorPicker, HexColorInput} from 'react-colorful';

const glass = {
  bgcolor: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 2,
};

const sectionLabel = {
  color: 'rgba(255,255,255,0.5)',
  mb: 1.5,
  textTransform: 'uppercase',
  letterSpacing: 1,
};

// ── Color Swatch with Picker ────────────────────────────────────────────────

function ColorSwatch({label, color, onChange}) {
  const [anchor, setAnchor] = useState(null);
  // Normalize color for picker (strip rgba → show as hex)
  const hexColor = color?.startsWith('#') ? color : '#FFFFFF';

  return (
    <>
      <Box
        sx={{textAlign: 'center', cursor: 'pointer'}}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: '12px',
            mx: 'auto',
            mb: 0.5,
            bgcolor: color,
            border: '2px solid rgba(255,255,255,0.15)',
            transition: 'transform 0.2s',
            '&:hover': {
              transform: 'scale(1.1)',
              borderColor: 'rgba(255,255,255,0.4)',
            },
          }}
        />
        <Typography
          variant="caption"
          sx={{color: 'rgba(255,255,255,0.5)', fontSize: 10}}
        >
          {label}
        </Typography>
      </Box>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
        transformOrigin={{vertical: 'top', horizontal: 'center'}}
        PaperProps={{
          sx: {
            p: 2,
            bgcolor: '#1a1a2e',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
          },
        }}
      >
        <HexColorPicker
          color={hexColor}
          onChange={onChange}
          style={{width: 200, height: 160}}
        />
        <Box sx={{mt: 1.5, display: 'flex', alignItems: 'center', gap: 1}}>
          <Typography variant="caption" sx={{color: 'rgba(255,255,255,0.5)'}}>
            #
          </Typography>
          <HexColorInput
            color={hexColor}
            onChange={onChange}
            prefixed={false}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              padding: '6px 8px',
              color: '#fff',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </Box>
      </Popover>
    </>
  );
}

// ── Animation Section Row ───────────────────────────────────────────────────

function AnimationRow({
  icon,
  label,
  description,
  enabled,
  intensity,
  onToggle,
  onIntensity,
}) {
  return (
    <Box sx={{py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
          {icon}
          <Box>
            <Typography variant="body2" sx={{color: '#fff', fontWeight: 500}}>
              {label}
            </Typography>
            <Typography variant="caption" sx={{color: 'rgba(255,255,255,0.4)'}}>
              {description}
            </Typography>
          </Box>
        </Box>
        <Switch
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          size="small"
          sx={{
            '& .MuiSwitch-switchBase.Mui-checked': {
              color: 'var(--nunba-primary, #6C63FF)',
            },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
              backgroundColor: 'var(--nunba-primary, #6C63FF)',
            },
          }}
        />
      </Box>
      <Collapse in={enabled}>
        <Box sx={{mt: 1.5, pl: 5}}>
          <Typography variant="caption" sx={{color: 'rgba(255,255,255,0.5)'}}>
            Intensity: {intensity}%
          </Typography>
          <Slider
            value={intensity}
            min={0}
            max={100}
            step={5}
            onChange={(_, v) => onIntensity(v)}
            sx={{
              color: 'var(--nunba-primary, #6C63FF)',
              '& .MuiSlider-thumb': {width: 14, height: 14},
            }}
          />
        </Box>
      </Collapse>
    </Box>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function ThemeSettingsPage() {
  const {
    themeConfig,
    ownTheme,
    applyPreset,
    saveCustom,
    resetToDefault,
    setPreviewTheme,
    clearPreview,
  } = useNunbaTheme();

  const [fonts, setFonts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(null);
  const [message, setMessage] = useState(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [expandedSection, setExpandedSection] = useState({
    presets: true,
    ai: false,
    colors: false,
    animations: false,
    font: false,
  });

  // Local draft for live preview (before save)
  const [draft, setDraft] = useState(null);
  const effectiveConfig = draft || ownTheme;
  const hasUnsaved = !!draft;

  // Fetch fonts on mount
  useEffect(() => {
    themeApi
      .getFonts()
      .then((res) => setFonts(res?.data?.fonts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Clean up preview on unmount
  useEffect(() => () => clearPreview(), [clearPreview]);

  const toggleSection = (key) => {
    setExpandedSection((prev) => ({...prev, [key]: !prev[key]}));
  };

  // Apply draft change with live preview
  const updateDraft = useCallback(
    (overrides) => {
      setDraft((prev) => {
        const base = prev || ownTheme;
        const merged = mergeThemeConfig(base, overrides);
        merged.id = 'custom';
        merged.name = 'Custom';
        merged.metadata = {...merged.metadata, is_preset: false};
        setPreviewTheme(merged);
        return merged;
      });
    },
    [ownTheme, setPreviewTheme]
  );

  const handleSave = async () => {
    if (!draft) return;
    setApplying('save');
    try {
      await saveCustom(draft);
      setDraft(null);
      setMessage({type: 'success', text: 'Theme saved'});
    } catch {
      setMessage({type: 'error', text: 'Failed to save theme'});
    }
    setApplying(null);
  };

  const handleDiscard = () => {
    setDraft(null);
    clearPreview();
  };

  const handleApplyPreset = async (presetId) => {
    setApplying(presetId);
    setDraft(null);
    try {
      await applyPreset(presetId);
      setMessage({type: 'success', text: 'Theme applied'});
    } catch {
      setMessage({type: 'error', text: 'Failed to apply theme'});
    }
    setApplying(null);
  };

  const handleReset = async () => {
    setApplying('reset');
    setDraft(null);
    try {
      await resetToDefault();
      setMessage({type: 'success', text: 'Reset to default theme'});
    } catch {
      setMessage({type: 'error', text: 'Failed to reset'});
    }
    setApplying(null);
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setAiResult(null);
    try {
      const res = await themeApi.generate(aiPrompt.trim());
      const generated = res?.data?.theme;
      if (generated) {
        setAiResult(generated);
        setPreviewTheme(generated);
      } else {
        setMessage({type: 'error', text: 'Could not generate theme'});
      }
    } catch {
      setMessage({type: 'error', text: 'AI generation failed — try again'});
    }
    setAiGenerating(false);
  };

  const handleApplyAiTheme = () => {
    if (!aiResult) return;
    setDraft(aiResult);
    setPreviewTheme(aiResult);
    setAiResult(null);
    setExpandedSection((prev) => ({...prev, ai: false, colors: true}));
  };

  const activeId = effectiveConfig?.id || 'hart-default';

  // Section header component
  const SectionHeader = ({icon, title, sectionKey}) => (
    <Box
      onClick={() => toggleSection(sectionKey)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        py: 1,
        mb: expandedSection[sectionKey] ? 1.5 : 0,
        '&:hover': {opacity: 0.8},
      }}
    >
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
        {icon}
        <Typography variant="subtitle2" sx={sectionLabel}>
          {title}
        </Typography>
      </Box>
      {expandedSection[sectionKey] ? (
        <ExpandLess sx={{color: 'rgba(255,255,255,0.4)'}} />
      ) : (
        <ExpandMore sx={{color: 'rgba(255,255,255,0.4)'}} />
      )}
    </Box>
  );

  if (loading) {
    return (
      <Box sx={{p: 3, textAlign: 'center'}}>
        <CircularProgress
          size={24}
          sx={{color: 'var(--nunba-primary, #6C63FF)'}}
        />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        maxWidth: 700,
        mx: 'auto',
        p: {xs: 2, md: 3},
        pb: hasUnsaved ? 10 : 3,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
        }}
      >
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
          <Palette sx={{color: 'var(--nunba-primary, #6C63FF)'}} />
          <Typography variant="h5" sx={{color: '#fff', fontWeight: 600}}>
            Appearance
          </Typography>
        </Box>
        <Tooltip title="Reset to default theme">
          <IconButton
            onClick={handleReset}
            disabled={applying === 'reset'}
            size="small"
            sx={{color: 'rgba(255,255,255,0.4)', '&:hover': {color: '#FF6B6B'}}}
          >
            {applying === 'reset' ? (
              <CircularProgress size={18} />
            ) : (
              <RestartAlt />
            )}
          </IconButton>
        </Tooltip>
      </Box>

      {message && (
        <Alert
          severity={message.type}
          onClose={() => setMessage(null)}
          sx={{mb: 2}}
        >
          {message.text}
        </Alert>
      )}

      {/* ── Section 1: Theme Presets ── */}
      <SectionHeader
        icon={
          <Palette
            sx={{color: 'var(--nunba-primary, #6C63FF)', fontSize: 18}}
          />
        }
        title="Theme Presets"
        sectionKey="presets"
      />
      <Collapse in={expandedSection.presets}>
        <Grid container spacing={1.5} sx={{mb: 3}}>
          {THEME_PRESETS.map((preset) => {
            const isActive = preset.id === activeId;
            const c = preset.colors;
            return (
              <Grid item xs={6} sm={4} key={preset.id}>
                <Paper
                  onClick={() => handleApplyPreset(preset.id)}
                  sx={{
                    ...glass,
                    p: 2,
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.2s',
                    borderColor: isActive
                      ? c.primary
                      : 'rgba(255,255,255,0.08)',
                    '&:hover': {
                      borderColor: c.primary,
                      transform: 'translateY(-2px)',
                      boxShadow: `0 4px 20px ${c.primary}33`,
                    },
                  }}
                >
                  {isActive && (
                    <Chip
                      icon={<Check sx={{fontSize: 14}} />}
                      label="Active"
                      size="small"
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        bgcolor: c.primary,
                        color: '#fff',
                        fontSize: 10,
                        height: 20,
                        '& .MuiChip-icon': {color: '#fff'},
                      }}
                    />
                  )}
                  {applying === preset.id && (
                    <CircularProgress
                      size={16}
                      sx={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        color: c.primary,
                      }}
                    />
                  )}
                  {/* 4-color swatches */}
                  <Box sx={{display: 'flex', gap: 0.5, mb: 1.5}}>
                    {[c.background, c.paper, c.primary, c.secondary].map(
                      (clr, i) => (
                        <Box
                          key={i}
                          sx={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            bgcolor: clr,
                            border: '1px solid rgba(255,255,255,0.1)',
                          }}
                        />
                      )
                    )}
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{color: '#fff', fontWeight: 600, fontSize: 13}}
                  >
                    {preset.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'rgba(255,255,255,0.4)',
                      display: 'block',
                      lineHeight: 1.3,
                      mt: 0.3,
                    }}
                  >
                    {preset.description}
                  </Typography>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      </Collapse>

      {/* ── Section 2: AI Theme Generator ── */}
      <SectionHeader
        icon={
          <AutoAwesome
            sx={{color: 'var(--nunba-primary, #6C63FF)', fontSize: 18}}
          />
        }
        title="AI Theme Generator"
        sectionKey="ai"
      />
      <Collapse in={expandedSection.ai}>
        <Paper sx={{...glass, p: 2.5, mb: 3}}>
          <Typography
            variant="body2"
            sx={{color: 'rgba(255,255,255,0.6)', mb: 1.5}}
          >
            Describe your ideal theme and AI will generate colors for you.
          </Typography>
          <Box sx={{display: 'flex', gap: 1}}>
            <TextField
              fullWidth
              size="small"
              placeholder="e.g. calm ocean at twilight, minimalist..."
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiGenerate()}
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: '#fff',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255,255,255,0.15)',
                  },
                },
              }}
            />
            <Button
              variant="contained"
              onClick={handleAiGenerate}
              disabled={aiGenerating || !aiPrompt.trim()}
              sx={{
                minWidth: 100,
                background:
                  'linear-gradient(135deg, var(--nunba-primary, #6C63FF), var(--nunba-secondary, #FF6B6B))',
              }}
            >
              {aiGenerating ? (
                <CircularProgress size={20} sx={{color: '#fff'}} />
              ) : (
                'Generate'
              )}
            </Button>
          </Box>
          {aiResult && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                borderRadius: '12px',
                bgcolor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <Typography
                variant="body2"
                sx={{color: '#fff', fontWeight: 500, mb: 1}}
              >
                {aiResult.name || 'Generated Theme'}
              </Typography>
              <Box sx={{display: 'flex', gap: 0.5, mb: 1.5}}>
                {[
                  aiResult.colors?.background,
                  aiResult.colors?.paper,
                  aiResult.colors?.primary,
                  aiResult.colors?.secondary,
                  aiResult.colors?.accent,
                ]
                  .filter(Boolean)
                  .map((clr, i) => (
                    <Box
                      key={i}
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '8px',
                        bgcolor: clr,
                        border: '1px solid rgba(255,255,255,0.15)',
                      }}
                    />
                  ))}
              </Box>
              <Button
                size="small"
                variant="outlined"
                onClick={handleApplyAiTheme}
                sx={{
                  borderColor: 'var(--nunba-primary, #6C63FF)',
                  color: 'var(--nunba-primary, #6C63FF)',
                }}
              >
                Apply This Theme
              </Button>
            </Box>
          )}
        </Paper>
      </Collapse>

      {/* ── Section 3: Color Palette ── */}
      <SectionHeader
        icon={
          <ColorLens
            sx={{color: 'var(--nunba-primary, #6C63FF)', fontSize: 18}}
          />
        }
        title="Color Palette"
        sectionKey="colors"
      />
      <Collapse in={expandedSection.colors}>
        <Paper sx={{...glass, p: 2.5, mb: 3}}>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2.5,
              justifyContent: 'center',
            }}
          >
            <ColorSwatch
              label="Background"
              color={effectiveConfig?.colors?.background || '#0F0E17'}
              onChange={(c) => updateDraft({colors: {background: c}})}
            />
            <ColorSwatch
              label="Paper"
              color={effectiveConfig?.colors?.paper || '#1A1932'}
              onChange={(c) => updateDraft({colors: {paper: c}})}
            />
            <ColorSwatch
              label="Primary"
              color={effectiveConfig?.colors?.primary || '#6C63FF'}
              onChange={(c) => updateDraft({colors: {primary: c}})}
            />
            <ColorSwatch
              label="Secondary"
              color={effectiveConfig?.colors?.secondary || '#FF6B6B'}
              onChange={(c) => updateDraft({colors: {secondary: c}})}
            />
            <ColorSwatch
              label="Accent"
              color={effectiveConfig?.colors?.accent || '#2ECC71'}
              onChange={(c) => updateDraft({colors: {accent: c}})}
            />
            <ColorSwatch
              label="Text"
              color={effectiveConfig?.colors?.text_primary || '#FFFFFE'}
              onChange={(c) => updateDraft({colors: {text_primary: c}})}
            />
          </Box>
        </Paper>
      </Collapse>

      {/* ── Section 4: Animation Controls ── */}
      <SectionHeader
        icon={
          <Animation
            sx={{color: 'var(--nunba-primary, #6C63FF)', fontSize: 18}}
          />
        }
        title="Animation Controls"
        sectionKey="animations"
      />
      <Collapse in={expandedSection.animations}>
        <Paper sx={{...glass, p: 2.5, mb: 3}}>
          <AnimationRow
            icon={
              <BlurOn
                sx={{color: 'var(--nunba-primary, #6C63FF)', fontSize: 20}}
              />
            }
            label="Glassmorphism"
            description="Frosted glass blur and transparency"
            enabled={
              effectiveConfig?.animations?.glassmorphism?.enabled !== false
            }
            intensity={
              effectiveConfig?.animations?.glassmorphism?.intensity ?? 70
            }
            onToggle={(v) =>
              updateDraft({animations: {glassmorphism: {enabled: v}}})
            }
            onIntensity={(v) =>
              updateDraft({animations: {glassmorphism: {intensity: v}}})
            }
          />
          <AnimationRow
            icon={
              <Gradient
                sx={{color: 'var(--nunba-primary, #6C63FF)', fontSize: 20}}
              />
            }
            label="Animated Gradients"
            description="Gradient shifts on buttons and surfaces"
            enabled={effectiveConfig?.animations?.gradients?.enabled !== false}
            intensity={effectiveConfig?.animations?.gradients?.intensity ?? 50}
            onToggle={(v) =>
              updateDraft({animations: {gradients: {enabled: v}}})
            }
            onIntensity={(v) =>
              updateDraft({animations: {gradients: {intensity: v}}})
            }
          />
          <AnimationRow
            icon={
              <WaterDrop
                sx={{color: 'var(--nunba-primary, #6C63FF)', fontSize: 20}}
              />
            }
            label="Liquid Motion"
            description="Micro-animations, hover effects, transitions"
            enabled={
              effectiveConfig?.animations?.liquid_motion?.enabled !== false
            }
            intensity={
              effectiveConfig?.animations?.liquid_motion?.intensity ?? 60
            }
            onToggle={(v) =>
              updateDraft({animations: {liquid_motion: {enabled: v}}})
            }
            onIntensity={(v) =>
              updateDraft({animations: {liquid_motion: {intensity: v}}})
            }
          />
        </Paper>
      </Collapse>

      {/* ── Section 5: Font & Shell ── */}
      <SectionHeader
        icon={
          <Tune sx={{color: 'var(--nunba-primary, #6C63FF)', fontSize: 18}} />
        }
        title="Font & Shell"
        sectionKey="font"
      />
      <Collapse in={expandedSection.font}>
        <Paper sx={{...glass, p: 2.5, mb: 3}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 2}}>
            <FormatSize
              sx={{color: 'var(--nunba-primary, #6C63FF)', fontSize: 20}}
            />
            <Typography variant="body2" sx={{color: '#fff', fontWeight: 500}}>
              Font Family
            </Typography>
          </Box>
          {fonts.length > 0 && (
            <FormControl fullWidth size="small" sx={{mb: 2}}>
              <Select
                value={effectiveConfig?.font?.family || 'Inter'}
                onChange={(e) => updateDraft({font: {family: e.target.value}})}
                sx={{
                  color: '#fff',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255,255,255,0.15)',
                  },
                  '& .MuiSvgIcon-root': {color: 'rgba(255,255,255,0.5)'},
                }}
              >
                {fonts.map((f) => (
                  <MenuItem key={f.family} value={f.family}>
                    <span style={{fontFamily: f.family}}>{f.family}</span>
                    {f.category && (
                      <Typography
                        variant="caption"
                        sx={{ml: 1, color: 'rgba(255,255,255,0.4)'}}
                      >
                        {f.category}
                      </Typography>
                    )}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Typography
            variant="body2"
            sx={{color: 'rgba(255,255,255,0.5)', mb: 1}}
          >
            Font Size: {effectiveConfig?.font?.size || 13}px
          </Typography>
          <Slider
            value={effectiveConfig?.font?.size || 13}
            min={10}
            max={20}
            step={1}
            onChange={(_, v) => updateDraft({font: {size: v}})}
            sx={{
              color: 'var(--nunba-primary, #6C63FF)',
              mb: 3,
              '& .MuiSlider-thumb': {width: 16, height: 16},
            }}
          />

          <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 2}}>
            <Contrast
              sx={{color: 'var(--nunba-primary, #6C63FF)', fontSize: 20}}
            />
            <Typography variant="body2" sx={{color: '#fff', fontWeight: 500}}>
              Glass Transparency
            </Typography>
          </Box>
          <Slider
            value={Math.round(
              (effectiveConfig?.shell?.panel_opacity || 0.65) * 100
            )}
            min={30}
            max={95}
            step={5}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${v}%`}
            onChange={(_, v) => updateDraft({shell: {panel_opacity: v / 100}})}
            sx={{
              color: 'var(--nunba-primary, #6C63FF)',
              '& .MuiSlider-thumb': {width: 16, height: 16},
            }}
          />

          <Typography
            variant="body2"
            sx={{color: 'rgba(255,255,255,0.5)', mt: 2, mb: 1}}
          >
            Blur: {effectiveConfig?.shell?.blur_radius || 20}px
          </Typography>
          <Slider
            value={effectiveConfig?.shell?.blur_radius || 20}
            min={0}
            max={40}
            step={2}
            onChange={(_, v) => updateDraft({shell: {blur_radius: v}})}
            sx={{
              color: 'var(--nunba-primary, #6C63FF)',
              '& .MuiSlider-thumb': {width: 16, height: 16},
            }}
          />

          <Typography
            variant="body2"
            sx={{color: 'rgba(255,255,255,0.5)', mt: 2, mb: 1}}
          >
            Corner Radius: {effectiveConfig?.shell?.border_radius || 16}px
          </Typography>
          <Slider
            value={effectiveConfig?.shell?.border_radius || 16}
            min={0}
            max={24}
            step={2}
            onChange={(_, v) => updateDraft({shell: {border_radius: v}})}
            sx={{
              color: 'var(--nunba-primary, #6C63FF)',
              '& .MuiSlider-thumb': {width: 16, height: 16},
            }}
          />
        </Paper>
      </Collapse>

      {/* ── Unsaved Changes Bar ── */}
      {hasUnsaved && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1100,
            bgcolor: 'rgba(15, 14, 23, 0.95)',
            backdropFilter: 'blur(12px)',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            py: 1.5,
            px: 3,
          }}
        >
          <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.7)'}}>
            Unsaved changes
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={handleDiscard}
            sx={{
              borderColor: 'rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            Discard
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={handleSave}
            disabled={applying === 'save'}
            startIcon={
              applying === 'save' ? <CircularProgress size={14} /> : <Save />
            }
            sx={{
              background:
                'linear-gradient(135deg, var(--nunba-primary, #6C63FF), var(--nunba-accent, #2ECC71))',
            }}
          >
            Save Theme
          </Button>
        </Box>
      )}
    </Box>
  );
}
