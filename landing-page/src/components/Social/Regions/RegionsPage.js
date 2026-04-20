import {regionsApi} from '../../../services/socialApi';
import RegionBadge from '../shared/RegionBadge';

import NearMeIcon from '@mui/icons-material/NearMe';
import PeopleIcon from '@mui/icons-material/People';
import PublicIcon from '@mui/icons-material/Public';
import SearchIcon from '@mui/icons-material/Search';
import {
  Typography,
  Box,
  CircularProgress,
  TextField,
  Chip,
  Stack,
  Grid,
  Card,
  CardActionArea,
  CardContent,
  Alert,
  InputAdornment,
  Divider,
} from '@mui/material';
import React, {useState, useEffect, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';


const TYPE_FILTERS = [
  'all',
  'city',
  'country',
  'language',
  'interest',
  'custom',
];

export default function RegionsPage() {
  const navigate = useNavigate();
  const [regions, setRegions] = useState([]);
  const [nearbyRegions, setNearbyRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const fetchRegions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (search) params.search = search;
      if (typeFilter !== 'all') params.type = typeFilter;
      const res = await regionsApi.list(params);
      setRegions(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load regions');
      setRegions([]);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  const fetchNearby = useCallback(async () => {
    try {
      const res = await regionsApi.nearby();
      setNearbyRegions(res.data || []);
    } catch {
      setNearbyRegions([]);
    }
  }, []);

  useEffect(() => {
    fetchRegions();
  }, [fetchRegions]);

  useEffect(() => {
    fetchNearby();
  }, [fetchNearby]);

  const handleRegionClick = (region) => {
    navigate(`/social/regions/${region.id}`);
  };

  const RegionCard = ({region}) => (
    <Card sx={{borderRadius: 3, overflow: 'hidden'}}>
      <CardActionArea onClick={() => handleRegionClick(region)}>
        <CardContent sx={{p: {xs: 2, md: 2.5}}}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
            spacing={1}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <PublicIcon sx={{color: 'primary.main', fontSize: 20}} />
              <Typography variant="subtitle1" sx={{fontWeight: 700}}>
                {region.name}
              </Typography>
            </Stack>
            <RegionBadge region={region} />
          </Stack>

          {region.description && (
            <Typography variant="body2" color="text.secondary" sx={{mt: 1}}>
              {region.description.length > 120
                ? `${region.description.slice(0, 120)}...`
                : region.description}
            </Typography>
          )}

          <Stack direction="row" spacing={2} sx={{mt: 1.5}} alignItems="center">
            <Stack direction="row" spacing={0.5} alignItems="center">
              <PeopleIcon sx={{fontSize: 14, color: 'text.secondary'}} />
              <Typography variant="caption" color="text.secondary">
                {region.member_count ?? 0} members
              </Typography>
            </Stack>
            {region.type && (
              <Chip
                label={region.type}
                size="small"
                variant="outlined"
                sx={{fontSize: '0.65rem', height: 20}}
              />
            )}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );

  return (
    <>
      <Typography variant="h5" gutterBottom sx={{fontWeight: 700}}>
        Regions
      </Typography>

      <TextField
        placeholder="Search regions..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        fullWidth
        sx={{mb: 2}}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{color: 'text.secondary'}} />
            </InputAdornment>
          ),
        }}
      />

      <Stack
        direction="row"
        spacing={1}
        sx={{mb: 2, flexWrap: 'wrap'}}
        useFlexGap
      >
        {TYPE_FILTERS.map((type) => (
          <Chip
            key={type}
            label={type.charAt(0).toUpperCase() + type.slice(1)}
            variant={typeFilter === type ? 'filled' : 'outlined'}
            color={typeFilter === type ? 'primary' : 'default'}
            onClick={() => setTypeFilter(type)}
            size="small"
          />
        ))}
      </Stack>

      {error && (
        <Alert severity="error" sx={{mb: 2}}>
          {error}
        </Alert>
      )}

      {/* Nearby Regions */}
      {nearbyRegions.length > 0 && !search && typeFilter === 'all' && (
        <Box sx={{mb: 3}}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{mb: 1.5}}>
            <NearMeIcon sx={{color: 'primary.main', fontSize: 20}} />
            <Typography variant="h6" sx={{fontWeight: 700}}>
              Nearby
            </Typography>
          </Stack>
          <Grid container spacing={2}>
            {nearbyRegions.slice(0, 4).map((region) => (
              <Grid item xs={12} sm={6} key={`nearby-${region.id}`}>
                <RegionCard region={region} />
              </Grid>
            ))}
          </Grid>
          <Divider sx={{mt: 3, mb: 1}} />
        </Box>
      )}

      {/* All Regions */}
      <Typography variant="h6" sx={{fontWeight: 700, mb: 1.5}}>
        {search ? 'Search Results' : 'All Regions'}
      </Typography>

      {loading ? (
        <Box sx={{textAlign: 'center', py: 6}}>
          <CircularProgress />
        </Box>
      ) : regions.length === 0 ? (
        <Box sx={{textAlign: 'center', py: 6}}>
          <Typography color="text.secondary">No regions found.</Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {regions.map((region) => (
            <Grid item xs={12} sm={6} key={region.id}>
              <RegionCard region={region} />
            </Grid>
          ))}
        </Grid>
      )}
    </>
  );
}
