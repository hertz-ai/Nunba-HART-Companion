/**
 * VariableInjectionDialog - God's-eye variable injection into an agent's experiment.
 *
 * Allows injecting a constraint, info snippet, or question into an active experiment.
 * Uses trackerApi.inject(postId, {variable, injection_type}).
 */

import { trackerApi } from '../../../services/socialApi';
import { socialTokens, RADIUS } from '../../../theme/socialTokens';

import TuneIcon from '@mui/icons-material/Tune';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Select, MenuItem, FormControl, InputLabel,
  Typography, Box, CircularProgress, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useState } from 'react';

const INJECTION_TYPES = [
  { value: 'constraint', label: 'Constraint', desc: 'Add a hard boundary the agent must respect' },
  { value: 'info', label: 'Information', desc: 'Provide new facts or context' },
  { value: 'question', label: 'Question', desc: 'Ask the agent to explore a specific angle' },
];

export default function VariableInjectionDialog({ open, onClose, postId, onSuccess }) {
  const theme = useTheme();
  const [variable, setVariable] = useState('');
  const [injectionType, setInjectionType] = useState('info');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!variable.trim() || !postId) return;
    setSubmitting(true);
    setError(null);
    try {
      await trackerApi.inject(postId, { variable: variable.trim(), injection_type: injectionType });
      setVariable('');
      setInjectionType('info');
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Injection failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setVariable('');
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          ...socialTokens.glass.elevated(theme),
          borderRadius: RADIUS.lg,
          bgcolor: '#0F0E17',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <TuneIcon sx={{ color: '#6C63FF' }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>Inject Variable</Typography>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 2 }}>
          Inject a variable into the agent's experiment context. The agent will incorporate
          this into its next iteration.
        </Typography>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="inject-type-label">Type</InputLabel>
          <Select
            labelId="inject-type-label"
            value={injectionType}
            label="Type"
            onChange={(e) => setInjectionType(e.target.value)}
            disabled={submitting}
            sx={{ borderRadius: RADIUS.sm }}
          >
            {INJECTION_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.label}</Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {t.desc}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          fullWidth
          multiline
          rows={4}
          label="Variable content"
          placeholder="Enter the variable to inject..."
          value={variable}
          onChange={(e) => setVariable(e.target.value)}
          disabled={submitting}
          sx={{
            '& .MuiOutlinedInput-root': { borderRadius: RADIUS.sm },
          }}
        />

        {error && (
          <Typography variant="caption" sx={{ color: '#FF6B6B', mt: 1, display: 'block' }}>
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={submitting}
          sx={{ color: theme.palette.text.secondary, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!variable.trim() || submitting}
          variant="contained"
          startIcon={submitting ? <CircularProgress size={16} /> : <TuneIcon />}
          sx={{
            bgcolor: '#6C63FF',
            '&:hover': { bgcolor: '#5A52E0' },
            borderRadius: RADIUS.sm,
            textTransform: 'none',
            fontWeight: 600,
          }}
        >
          Inject
        </Button>
      </DialogActions>
    </Dialog>
  );
}
