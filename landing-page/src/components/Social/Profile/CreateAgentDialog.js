/* eslint-disable react/jsx-no-comment-textnodes */
import {usersApi, agentApi, chatApi} from '../../../services/socialApi';

import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Chip,
  Typography,
  Box,
  CircularProgress,
  IconButton,
} from '@mui/material';
import React, {useState, useEffect, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';

// Internal storage format uses dots: swift.falcon
const LOCAL_NAME_REGEX = /^[a-z]{2,15}\.[a-z]{2,15}$/;

// Convert between display (space-separated) and storage (dot-separated)
const toDisplay = (dotName) => dotName.replace(/\./g, ' ');
const toStorage = (displayName) =>
  displayName.trim().replace(/\s+/g, '.').toLowerCase();

export default function CreateAgentDialog({
  open,
  onClose,
  userId,
  userHandle: initialHandle,
  onCreated,
}) {
  const navigate = useNavigate();
  // displayName is what the user sees/types (space-separated)
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [personality, setPersonality] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Handle state
  const [handle, setHandle] = useState(initialHandle || '');
  const [handleSaved, setHandleSaved] = useState(!!initialHandle);
  const [handleChecking, setHandleChecking] = useState(false);
  const [handleAvailable, setHandleAvailable] = useState(null);
  const [handleError, setHandleError] = useState('');
  const [handleSaving, setHandleSaving] = useState(false);

  // The dot-separated name for storage/API
  const storageName = toStorage(displayName);
  const nameValid = LOCAL_NAME_REGEX.test(storageName);
  const nameError =
    displayName && !nameValid ? 'Type two words (e.g. swift falcon)' : '';

  // Global address preview: swift.falcon.sathi
  const globalName = nameValid && handle ? `${storageName}.${handle}` : '';

  // Debounced handle availability check
  useEffect(() => {
    if (handleSaved || !handle || handle.length < 2) {
      setHandleAvailable(null);
      setHandleError('');
      return;
    }
    if (!/^[a-z]{2,15}$/.test(handle)) {
      setHandleAvailable(null);
      setHandleError('2-15 lowercase letters only');
      return;
    }
    setHandleChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await agentApi.checkHandle(handle);
        setHandleAvailable(res.data?.available);
        setHandleError(res.data?.available ? '' : 'Handle is taken');
      } catch {
        setHandleError('Could not check availability');
      }
      setHandleChecking(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [handle, handleSaved]);

  const saveHandle = async () => {
    setHandleSaving(true);
    setHandleError('');
    try {
      await usersApi.setHandle(userId, handle);
      setHandleSaved(true);
      generateSuggestions(handle);
    } catch (err) {
      setHandleError(err.error || err.message || 'Failed to set handle');
    }
    setHandleSaving(false);
  };

  const generateSuggestions = useCallback(
    async (h) => {
      const effectiveHandle = h || handle;
      if (!effectiveHandle) return;
      setGenerating(true);
      try {
        const res = await agentApi.suggestLocalNames(effectiveHandle, 5);
        // API returns dot-separated names
        setSuggestions(res.data?.suggestions || []);
      } catch {
        /* ignore */
      }
      setGenerating(false);
    },
    [handle]
  );

  useEffect(() => {
    if (open) {
      setDisplayName('');
      setDescription('');
      setPersonality('');
      setError('');
      if (initialHandle) {
        setHandle(initialHandle);
        setHandleSaved(true);
        generateSuggestions(initialHandle);
      } else {
        setHandle('');
        setHandleSaved(false);
        setSuggestions([]);
      }
    }
  }, [open, initialHandle, generateSuggestions]);

  const handleCreate = async () => {
    if (!nameValid || !handleSaved) return;
    setCreating(true);
    setError('');
    try {
      // 1. Create social identity using local_name (dot-separated)
      const res = await usersApi.createAgent(userId, {
        local_name: storageName,
        description,
        personality: personality || undefined,
      });
      const agent = res.data;
      if (onCreated) onCreated(agent);

      // 2. Also save as a prompt in the local backend (for /chat pipeline)
      const numericId = localStorage.getItem('hevolve_access_id') || userId;
      try {
        await chatApi.createPrompts({
          listprompts: [
            {
              name: agent.display_name || toDisplay(storageName),
              prompt: description,
              agent_name: storageName,
              is_active: true,
              user_id: numericId,
            },
          ],
        });
      } catch (promptErr) {
        console.warn('Prompt sync skipped:', promptErr);
      }

      onClose();

      const agentId = agent.agent_id || agent.username || storageName;
      const promptId = agent.prompt_id || '';
      const query = promptId
        ? `?prompt_id=${promptId}&create=true`
        : '?create=true';
      navigate(`/social/agent/${agentId}/chat${query}`);
    } catch (err) {
      const data = err.response?.data || err;
      if (data.code === 'handle_required') {
        setHandleSaved(false);
        setError('Please set your handle first');
      } else {
        setError(data.error || data.message || 'Failed to create agent');
      }
    }
    setCreating(false);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Create Agent</DialogTitle>
      <DialogContent>
        {/* Handle setup (one-time) */}
        {!handleSaved && (
          <Box
            mb={2}
            p={2}
            style={{backgroundColor: '#1a1a2e', borderRadius: 8}}
          >
            <Typography variant="subtitle2" gutterBottom>
              Pick your handle
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              gutterBottom
            >
              Your unique creator tag — used for all your agents. Choose once,
              keep forever.
            </Typography>
            <Box display="flex" alignItems="flex-start" style={{gap: 8}}>
              <TextField
                value={handle}
                onChange={(e) =>
                  setHandle(e.target.value.toLowerCase().replace(/[^a-z]/g, ''))
                }
                placeholder="sathi"
                size="small"
                variant="outlined"
                fullWidth
                helperText={
                  handleError ||
                  (handleChecking ? 'Checking...' : '') ||
                  (handleAvailable === true ? 'Available!' : '') ||
                  '2-15 lowercase letters'
                }
                error={!!handleError}
                InputProps={{
                  startAdornment: (
                    <Typography color="text.secondary" style={{marginRight: 4}}>
                      @
                    </Typography>
                  ),
                }}
              />
              <Button
                variant="contained"
                color="primary"
                size="small"
                onClick={saveHandle}
                disabled={!handleAvailable || handleSaving}
                style={{marginTop: 4, whiteSpace: 'nowrap'}}
              >
                {handleSaving ? <CircularProgress size={18} /> : 'Set Handle'}
              </Button>
            </Box>
          </Box>
        )}

        {handleSaved && (
          <Box mb={1}>
            <Chip
              label={`@${handle}`}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Box>
        )}

        <TextField
          label="Agent Name"
          value={displayName}
          onChange={(e) => {
            // Allow letters and spaces only; user types naturally like "swift falcon"
            const val = e.target.value.toLowerCase().replace(/[^a-z ]/g, '');
            // Collapse multiple spaces into one
            setDisplayName(val.replace(/  +/g, ' '));
          }}
          fullWidth
          margin="dense"
          placeholder="swift falcon"
          helperText={nameError || 'Two words, e.g. swift falcon'}
          error={!!nameError}
          autoFocus={handleSaved}
          disabled={!handleSaved}
        />

        {/* what3words-style address preview */}
        {globalName && (
          <Box
            mt={0.5}
            mb={1}
            p={1}
            style={{
              backgroundColor: '#0d1117',
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{color: '#e74c3c', fontSize: 18, fontWeight: 700}}>
              ///
            </span>
            <Typography
              variant="body2"
              style={{
                fontFamily: 'monospace',
                fontWeight: 600,
                letterSpacing: 0.5,
              }}
            >
              {globalName}
            </Typography>
          </Box>
        )}

        <Box mt={1} mb={2}>
          <Box display="flex" alignItems="center" mb={0.5}>
            <Typography
              variant="caption"
              color="text.secondary"
              style={{flex: 1}}
            >
              Suggestions (click to use)
            </Typography>
            <IconButton
              size="small"
              onClick={() => generateSuggestions()}
              disabled={generating || !handleSaved}
            >
              {generating ? (
                <CircularProgress size={16} />
              ) : (
                <RefreshIcon fontSize="small" />
              )}
            </IconButton>
          </Box>
          <Box display="flex" flexWrap="wrap" style={{gap: 4}}>
            {suggestions.map((s) => (
              <Chip
                key={s}
                label={toDisplay(s)}
                size="small"
                color={storageName === s ? 'primary' : 'default'}
                onClick={() => setDisplayName(toDisplay(s))}
                clickable
              />
            ))}
          </Box>
        </Box>

        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          margin="dense"
          multiline
          rows={2}
          placeholder="What does this agent do?"
          disabled={!handleSaved}
        />

        <TextField
          label="Personality (optional)"
          value={personality}
          onChange={(e) => setPersonality(e.target.value)}
          fullWidth
          margin="dense"
          multiline
          rows={2}
          placeholder="Describe the agent's personality and communication style"
          disabled={!handleSaved}
        />

        {error && (
          <Typography color="error" variant="body2" style={{marginTop: 8}}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={creating}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          color="primary"
          variant="contained"
          disabled={!nameValid || !handleSaved || creating}
        >
          {creating ? <CircularProgress size={20} /> : 'Create Agent'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
