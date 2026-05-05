import RefreshIcon from '@mui/icons-material/Refresh';
import { Box, Typography, Chip, CircularProgress, Paper, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, FormControl, InputLabel, IconButton, Tooltip } from '@mui/material';
import React, { useState, useEffect, useCallback } from 'react';

const STATUS_COLORS = {
  PENDING: 'default',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  FAILED: 'error',
  BLOCKED: 'warning',
  DELEGATED: 'info',
  DEFERRED: 'default',
};

export default function TaskLedgerPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [stats, setStats] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // /api/agent-engine/ledger/* is gated by @require_auth on HARTOS
  // (integrations/agent_engine/api.py).  Match the canonical token
  // read site from services/axiosFactory.js:29 — `access_token` in
  // localStorage is what every other admin call uses.  Without this
  // header the backend returns 401 and the page would render empty
  // with no diagnostic, which is exactly the bug we just fixed.
  const _authHeaders = () => {
    const token = localStorage.getItem('access_token');
    return token ? {Authorization: `Bearer ${token}`} : {};
  };

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = statusFilter ? `?status=${statusFilter}&limit=100` : '?limit=100';
      const res = await fetch(`/api/agent-engine/ledger/tasks${params}`,
                              {headers: _authHeaders()});
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTasks(data.tasks || []);
      } else {
        setTasks([]);
        // Surface the backend's own error (e.g. 401 missing auth,
        // 501 agent_ledger not installed, 500 internal) so the page
        // doesn't silently say "No tasks found" when something is
        // actually wrong.
        const why = data.error || `HTTP ${res.status}`;
        setErrorMsg(`Ledger unavailable: ${why}`);
      }
    } catch (err) {
      setTasks([]);
      setErrorMsg(`Ledger fetch failed: ${err.message}`);
    }
    setLoading(false);
  }, [statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-engine/ledger/stats',
                              {headers: _authHeaders()});
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) setStats(data.stats);
      else setStats(null);
    } catch { setStats(null); }
  }, []);

  useEffect(() => { fetchTasks(); fetchStats(); }, [fetchTasks, fetchStats]);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Agent Task Ledger</Typography>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status"
            onChange={(e) => setStatusFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {Object.keys(STATUS_COLORS).map((s) => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Tooltip title="Refresh">
          <IconButton onClick={() => { fetchTasks(); fetchStats(); }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {stats && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          {Object.entries(stats).map(([key, val]) => (
            <Paper key={key} sx={{ px: 2, py: 1 }}>
              <Typography variant="caption" color="text.secondary">{key}</Typography>
              <Typography variant="h6">{typeof val === 'number' ? val : JSON.stringify(val)}</Typography>
            </Paper>
          ))}
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : errorMsg ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography color="error" sx={{ fontWeight: 600 }}>
            {errorMsg}
          </Typography>
          <Typography color="text.secondary" variant="caption">
            Check the HARTOS server log for details.
          </Typography>
        </Box>
      ) : tasks.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No tasks found. Agent tasks will appear here as they are created.
        </Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Agent</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id || task.task_id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {(task.id || task.task_id || '').slice(0, 8)}
                  </TableCell>
                  <TableCell>{task.title || task.description || '(untitled)'}</TableCell>
                  <TableCell>
                    <Chip label={task.status || 'UNKNOWN'}
                      color={STATUS_COLORS[task.status] || 'default'}
                      size="small" />
                  </TableCell>
                  <TableCell>{task.agent_id || task.assigned_to || '-'}</TableCell>
                  <TableCell>{task.priority || '-'}</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem' }}>
                    {task.created_at ? new Date(task.created_at).toLocaleString() : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
