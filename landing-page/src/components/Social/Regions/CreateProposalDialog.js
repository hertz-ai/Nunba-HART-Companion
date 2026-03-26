import {regionsApi} from '../../../services/socialApi';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material';
import React, {useState} from 'react';

const CATEGORIES = [
  'governance',
  'policy',
  'event',
  'budget',
  'moderation',
  'feature',
  'other',
];

const DURATIONS = [
  {label: '3 days', value: 3},
  {label: '5 days', value: 5},
  {label: '7 days', value: 7},
  {label: '14 days', value: 14},
  {label: '30 days', value: 30},
];

export default function CreateProposalDialog({
  open,
  onClose,
  regionId,
  onCreated,
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('governance');
  const [duration, setDuration] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await regionsApi.update(regionId, {
        proposal: {
          title: title.trim(),
          description: description.trim(),
          category,
          duration_days: duration,
        },
      });
      setTitle('');
      setDescription('');
      setCategory('governance');
      setDuration(7);
      if (onCreated) onCreated();
    } catch (err) {
      setError(err.message || 'Failed to create proposal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{sx: {borderRadius: 3}}}
    >
      <DialogTitle sx={{fontWeight: 700}}>New Proposal</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{mt: 1}}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            required
            disabled={submitting}
            placeholder="What is this proposal about?"
          />

          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            required
            multiline
            rows={4}
            disabled={submitting}
            placeholder="Provide details about your proposal..."
          />

          <FormControl fullWidth>
            <InputLabel>Category</InputLabel>
            <Select
              value={category}
              label="Category"
              onChange={(e) => setCategory(e.target.value)}
              disabled={submitting}
            >
              {CATEGORIES.map((cat) => (
                <MenuItem key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Voting Duration</InputLabel>
            <Select
              value={duration}
              label="Voting Duration"
              onChange={(e) => setDuration(e.target.value)}
              disabled={submitting}
            >
              {DURATIONS.map((d) => (
                <MenuItem key={d.value} value={d.value}>
                  {d.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions sx={{px: 3, pb: 2}}>
        <Button onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !title.trim() || !description.trim()}
          startIcon={submitting ? <CircularProgress size={16} /> : null}
        >
          {submitting ? 'Submitting...' : 'Submit Proposal'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
