import {evolutionApi} from '../../../services/socialApi';
import EvolutionTimeline from '../shared/EvolutionTimeline';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import {
  Box,
  Typography,
  CircularProgress,
  Card,
  CardContent,
  Chip,
  Button,
  LinearProgress,
  Divider,
} from '@mui/material';
import React, {useState, useEffect} from 'react';
import {useParams} from 'react-router-dom';


export default function AgentEvolutionPage() {
  const {agentId} = useParams();
  const [evolution, setEvolution] = useState(null);
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([evolutionApi.get(agentId), evolutionApi.trees()])
      .then(([evoRes, treesRes]) => {
        if (!cancelled) {
          setEvolution(evoRes.data || evoRes);
          setTrees(treesRes.data || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEvolution(null);
          setTrees([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (loading) {
    return (
      <Box sx={{textAlign: 'center', py: 6}}>
        <CircularProgress />
      </Box>
    );
  }
  if (!evolution) {
    return (
      <Box sx={{textAlign: 'center', py: 6}}>
        <Typography color="text.secondary">Evolution data not found</Typography>
      </Box>
    );
  }

  const traits = evolution.traits || [];
  const specializations = evolution.specializations || [];
  const requirements =
    evolution.next_requirements || evolution.requirements || [];
  const canEvolve = evolution.can_evolve ?? false;

  const handleEvolve = async () => {
    try {
      const res = await evolutionApi.specialize(agentId, {action: 'evolve'});
      if (res.data) setEvolution(res.data);
    } catch {
      /* silent */
    }
  };

  return (
    <>
      <Typography variant="h5" sx={{fontWeight: 700, mb: 2}}>
        Agent Evolution
      </Typography>

      {/* Timeline */}
      <Card sx={{borderRadius: 3, mb: 2}}>
        <CardContent sx={{p: {xs: 1.5, md: 2}}}>
          <Typography variant="subtitle2" color="text.secondary" sx={{mb: 1}}>
            Evolution Stage
          </Typography>
          <EvolutionTimeline evolution={evolution} />
        </CardContent>
      </Card>

      {/* Traits */}
      {traits.length > 0 && (
        <Card sx={{borderRadius: 3, mb: 2}}>
          <CardContent sx={{p: {xs: 1.5, md: 2}}}>
            <Typography variant="subtitle2" color="text.secondary" sx={{mb: 1}}>
              Traits
            </Typography>
            <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.5}}>
              {traits.map((trait) => (
                <Chip
                  key={typeof trait === 'string' ? trait : trait.name}
                  label={typeof trait === 'string' ? trait : trait.name}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{borderRadius: 2}}
                />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Specialization Trees */}
      {trees.length > 0 && (
        <Card sx={{borderRadius: 3, mb: 2}}>
          <CardContent sx={{p: {xs: 1.5, md: 2}}}>
            <Typography
              variant="subtitle2"
              color="text.secondary"
              sx={{mb: 1.5}}
            >
              Specialization Trees
            </Typography>
            {trees.map((tree, idx) => {
              const isActive = specializations.some(
                (s) =>
                  s === tree.id ||
                  s === tree.name ||
                  (s && s.tree_id === tree.id)
              );
              return (
                <React.Fragment key={tree.id || idx}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: isActive
                        ? 'rgba(0,120,255,0.06)'
                        : 'transparent',
                      border: isActive ? '1px solid' : '1px solid transparent',
                      borderColor: isActive ? 'primary.main' : 'transparent',
                      mb: 1,
                    }}
                  >
                    <Box sx={{flex: 1}}>
                      <Typography
                        variant="subtitle2"
                        sx={{fontWeight: isActive ? 700 : 500}}
                      >
                        {tree.name || tree.label}
                        {isActive && (
                          <Chip
                            label="Active"
                            size="small"
                            color="primary"
                            sx={{ml: 1, height: 20, fontSize: '0.7rem'}}
                          />
                        )}
                      </Typography>
                      {tree.description && (
                        <Typography variant="caption" color="text.secondary">
                          {tree.description}
                        </Typography>
                      )}
                    </Box>
                    {tree.progress != null && (
                      <Box sx={{width: {xs: 60, md: 100}}}>
                        <LinearProgress
                          variant="determinate"
                          value={tree.progress}
                          sx={{
                            height: 6,
                            borderRadius: 3,
                            '& .MuiLinearProgress-bar': {
                              background:
                                'linear-gradient(to right, #00e89d, #0078ff)',
                            },
                          }}
                        />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{fontSize: '0.65rem'}}
                        >
                          {tree.progress}%
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </React.Fragment>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Requirements for next stage */}
      {requirements.length > 0 && (
        <Card sx={{borderRadius: 3, mb: 2}}>
          <CardContent sx={{p: {xs: 1.5, md: 2}}}>
            <Typography variant="subtitle2" color="text.secondary" sx={{mb: 1}}>
              Next Stage Requirements
            </Typography>
            {requirements.map((req, i) => {
              const met = req.met ?? false;
              return (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.5,
                    opacity: met ? 0.6 : 1,
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: met ? 'success.main' : 'warning.main',
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{textDecoration: met ? 'line-through' : 'none'}}
                  >
                    {typeof req === 'string'
                      ? req
                      : req.label || req.description}
                  </Typography>
                </Box>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Evolve CTA */}
      <Button
        variant="contained"
        fullWidth
        disabled={!canEvolve}
        startIcon={<AutoAwesomeIcon />}
        onClick={handleEvolve}
        sx={{
          borderRadius: 2,
          py: 1.5,
          background: canEvolve
            ? 'linear-gradient(to right, #00e89d, #0078ff)'
            : undefined,
          '&:hover': canEvolve
            ? {background: 'linear-gradient(to right, #00d48e, #006ae0)'}
            : undefined,
        }}
      >
        {canEvolve ? 'Evolve Now' : 'Requirements Not Met'}
      </Button>
    </>
  );
}
