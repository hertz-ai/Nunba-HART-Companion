import {campaignsApi} from '../../../services/socialApi';
import {GRADIENTS} from '../../../theme/socialTokens';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import GroupIcon from '@mui/icons-material/Group';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  Card,
  CardContent,
  Grid,
  TextField,
  Chip,
  Slider,
  LinearProgress,
  Alert,
  useTheme,
} from '@mui/material';
import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';



const STEPS = ['Goal', 'Content', 'Audience', 'Budget', 'Preview & Launch'];

const GOAL_OPTIONS = [
  {
    key: 'get_followers',
    label: 'Get Followers',
    icon: <PersonAddIcon sx={{fontSize: 40}} />,
    description: 'Grow your follower count with targeted outreach',
  },
  {
    key: 'boost_post',
    label: 'Boost Post',
    icon: <TrendingUpIcon sx={{fontSize: 40}} />,
    description: 'Amplify a specific post to reach more people',
  },
  {
    key: 'promote_agent',
    label: 'Promote Agent',
    icon: <SmartToyIcon sx={{fontSize: 40}} />,
    description: 'Showcase your AI agent to the community',
  },
  {
    key: 'grow_community',
    label: 'Grow Community',
    icon: <GroupIcon sx={{fontSize: 40}} />,
    description: 'Expand your community and grow membership',
  },
];

const REGION_OPTIONS = [
  'North America',
  'Europe',
  'Asia Pacific',
  'Latin America',
  'Middle East',
  'Africa',
  'Global',
];

export default function CampaignStudio() {
  const navigate = useNavigate();
  const theme = useTheme();
  const [activeStep, setActiveStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1 - Goal
  const [goalType, setGoalType] = useState('');

  // Step 2 - Content
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [productDescription, setProductDescription] = useState('');

  // Step 3 - Audience
  const [selectedRegions, setSelectedRegions] = useState([]);
  const [targetCommunity, setTargetCommunity] = useState('');

  // Step 4 - Budget
  const [budget, setBudget] = useState(50);

  const estimatedPosts = Math.floor(budget / 5);
  const estimatedReach = budget * 20;

  const handleRegionToggle = (region) => {
    setSelectedRegions((prev) =>
      prev.includes(region)
        ? prev.filter((r) => r !== region)
        : [...prev, region]
    );
  };

  const canProceed = () => {
    switch (activeStep) {
      case 0:
        return !!goalType;
      case 1:
        return name.trim().length > 0;
      case 2:
        return true;
      case 3:
        return budget >= 10;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (activeStep < STEPS.length - 1) {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (activeStep > 0) {
      setActiveStep((prev) => prev - 1);
    }
  };

  const handleLaunch = async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        name,
        description,
        goal_type: goalType,
        product_url: productUrl || undefined,
        product_description: productDescription || undefined,
        target_regions:
          selectedRegions.length > 0 ? selectedRegions : undefined,
        target_community: targetCommunity || undefined,
        budget_spark: budget,
      };
      const res = await campaignsApi.create(payload);
      const newId = res.data?.id || res.id;
      navigate(`/social/campaigns/${newId}`);
    } catch (err) {
      setError(
        err?.error ||
          err?.message ||
          'Failed to create campaign. Please try again.'
      );
    }
    setSubmitting(false);
  };

  const renderGoalStep = () => (
    <Grid container spacing={2}>
      {GOAL_OPTIONS.map((goal) => {
        const selected = goalType === goal.key;
        return (
          <Grid item xs={12} sm={6} key={goal.key}>
            <Card
              onClick={() => setGoalType(goal.key)}
              sx={{
                cursor: 'pointer',
                border: selected ? '2px solid' : '2px solid transparent',
                borderImage: selected ? `${GRADIENTS.primary} 1` : 'none',
                transition: 'all 0.2s',
                '&:hover': {boxShadow: 4},
              }}
            >
              <CardContent sx={{textAlign: 'center', p: {xs: 2, md: 3}}}>
                <Box
                  sx={{
                    color: selected
                      ? theme.palette.secondary.main
                      : 'text.secondary',
                    mb: 1,
                  }}
                >
                  {goal.icon}
                </Box>
                <Typography variant="subtitle1" sx={{fontWeight: 700}}>
                  {goal.label}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{mt: 0.5}}
                >
                  {goal.description}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        );
      })}
    </Grid>
  );

  const renderContentStep = () => (
    <Box sx={{display: 'flex', flexDirection: 'column', gap: 2.5}}>
      <TextField
        label="Campaign Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        fullWidth
        required
        placeholder="e.g., Summer Agent Showcase"
      />
      <TextField
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        fullWidth
        multiline
        rows={3}
        placeholder="Describe what this campaign is about..."
      />
      <TextField
        label="Product URL (optional)"
        value={productUrl}
        onChange={(e) => setProductUrl(e.target.value)}
        fullWidth
        placeholder="https://..."
      />
      <TextField
        label="Product Description (optional)"
        value={productDescription}
        onChange={(e) => setProductDescription(e.target.value)}
        fullWidth
        multiline
        rows={2}
        placeholder="Briefly describe the product or agent you are promoting..."
      />
    </Box>
  );

  const renderAudienceStep = () => (
    <Box sx={{display: 'flex', flexDirection: 'column', gap: 3}}>
      <Box>
        <Typography variant="subtitle2" sx={{fontWeight: 600, mb: 1}}>
          Target Regions
        </Typography>
        <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 1}}>
          {REGION_OPTIONS.map((region) => (
            <Chip
              key={region}
              label={region}
              clickable
              color={selectedRegions.includes(region) ? 'primary' : 'default'}
              variant={selectedRegions.includes(region) ? 'filled' : 'outlined'}
              onClick={() => handleRegionToggle(region)}
            />
          ))}
        </Box>
      </Box>
      <TextField
        label="Target Community (optional)"
        value={targetCommunity}
        onChange={(e) => setTargetCommunity(e.target.value)}
        fullWidth
        placeholder="e.g., ai-agents"
        helperText="Specify a community to target its members"
      />
      <Card variant="outlined" sx={{p: 2}}>
        <Typography variant="subtitle2" sx={{fontWeight: 600, mb: 0.5}}>
          Estimated Reach
        </Typography>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 700,
            background: GRADIENTS.primary,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          ~{estimatedReach.toLocaleString()} users
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Based on {selectedRegions.length || 'all'} region(s) and current
          budget
        </Typography>
      </Card>
    </Box>
  );

  const renderBudgetStep = () => (
    <Box sx={{display: 'flex', flexDirection: 'column', gap: 3}}>
      <Box>
        <Typography variant="subtitle2" sx={{fontWeight: 600, mb: 1}}>
          Budget (Spark)
        </Typography>
        <Slider
          value={budget}
          onChange={(e, v) => setBudget(v)}
          min={10}
          max={500}
          step={5}
          valueLabelDisplay="on"
          sx={{
            '& .MuiSlider-thumb': {bgcolor: theme.palette.secondary.main},
            '& .MuiSlider-track': {
              background: GRADIENTS.primary,
              border: 'none',
            },
          }}
        />
        <Box sx={{display: 'flex', justifyContent: 'space-between'}}>
          <Typography variant="caption" color="text.secondary">
            10 Spark
          </Typography>
          <Typography variant="caption" color="text.secondary">
            500 Spark
          </Typography>
        </Box>
      </Box>

      <Card variant="outlined" sx={{p: {xs: 1.5, md: 2}}}>
        <Typography variant="subtitle2" sx={{fontWeight: 600, mb: 1.5}}>
          Cost Breakdown
        </Typography>
        <Box sx={{display: 'flex', flexDirection: 'column', gap: 1}}>
          <Box sx={{display: 'flex', justifyContent: 'space-between'}}>
            <Typography variant="body2" color="text.secondary">
              Platform fee (10%)
            </Typography>
            <Typography variant="body2" sx={{fontWeight: 600}}>
              {Math.round(budget * 0.1)} Spark
            </Typography>
          </Box>
          <Box sx={{display: 'flex', justifyContent: 'space-between'}}>
            <Typography variant="body2" color="text.secondary">
              Promotion budget
            </Typography>
            <Typography variant="body2" sx={{fontWeight: 600}}>
              {Math.round(budget * 0.9)} Spark
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: 1,
              borderColor: 'divider',
              pt: 1,
            }}
          >
            <Typography variant="body2" sx={{fontWeight: 700}}>
              Total
            </Typography>
            <Typography variant="body2" sx={{fontWeight: 700}}>
              {budget} Spark
            </Typography>
          </Box>
        </Box>
      </Card>

      <Box sx={{display: 'flex', gap: 2}}>
        <Card variant="outlined" sx={{flex: 1, p: 2, textAlign: 'center'}}>
          <Typography
            variant="h5"
            sx={{fontWeight: 700, color: theme.palette.secondary.main}}
          >
            {estimatedPosts}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Estimated Posts
          </Typography>
        </Card>
        <Card variant="outlined" sx={{flex: 1, p: 2, textAlign: 'center'}}>
          <Typography
            variant="h5"
            sx={{fontWeight: 700, color: theme.palette.primary.main}}
          >
            ~{estimatedReach.toLocaleString()}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Estimated Reach
          </Typography>
        </Card>
      </Box>
    </Box>
  );

  const renderPreviewStep = () => (
    <Box sx={{display: 'flex', flexDirection: 'column', gap: 2}}>
      <Card variant="outlined" sx={{p: {xs: 1.5, md: 2}}}>
        <Typography variant="subtitle2" color="text.secondary" sx={{mb: 0.5}}>
          Campaign Name
        </Typography>
        <Typography variant="h6" sx={{fontWeight: 700}}>
          {name || '(Untitled)'}
        </Typography>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={6}>
          <Card variant="outlined" sx={{p: 2}}>
            <Typography variant="caption" color="text.secondary">
              Goal
            </Typography>
            <Typography
              variant="body1"
              sx={{fontWeight: 600, textTransform: 'capitalize'}}
            >
              {(goalType || '').replace(/_/g, ' ')}
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={6}>
          <Card variant="outlined" sx={{p: 2}}>
            <Typography variant="caption" color="text.secondary">
              Budget
            </Typography>
            <Typography variant="body1" sx={{fontWeight: 600}}>
              {budget} Spark
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={6}>
          <Card variant="outlined" sx={{p: 2}}>
            <Typography variant="caption" color="text.secondary">
              Regions
            </Typography>
            <Typography variant="body1" sx={{fontWeight: 600}}>
              {selectedRegions.length > 0
                ? selectedRegions.join(', ')
                : 'All Regions'}
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={6}>
          <Card variant="outlined" sx={{p: 2}}>
            <Typography variant="caption" color="text.secondary">
              Target Community
            </Typography>
            <Typography variant="body1" sx={{fontWeight: 600}}>
              {targetCommunity || 'None'}
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {description && (
        <Card variant="outlined" sx={{p: 2}}>
          <Typography variant="caption" color="text.secondary">
            Description
          </Typography>
          <Typography variant="body2" sx={{mt: 0.5}}>
            {description}
          </Typography>
        </Card>
      )}

      {productUrl && (
        <Card variant="outlined" sx={{p: 2}}>
          <Typography variant="caption" color="text.secondary">
            Product URL
          </Typography>
          <Typography variant="body2" sx={{mt: 0.5, wordBreak: 'break-all'}}>
            {productUrl}
          </Typography>
        </Card>
      )}

      {error && (
        <Alert severity="error" sx={{mt: 1}}>
          {error}
        </Alert>
      )}

      {submitting && <LinearProgress sx={{borderRadius: 1}} />}

      <Button
        variant="contained"
        size="large"
        startIcon={<RocketLaunchIcon />}
        onClick={handleLaunch}
        disabled={submitting}
        sx={{
          mt: 1,
          py: 1.5,
          fontWeight: 700,
          background: GRADIENTS.primary,
          '&:hover': {background: GRADIENTS.primaryHover},
        }}
      >
        {submitting ? 'Launching...' : 'Launch Campaign'}
      </Button>
    </Box>
  );

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return renderGoalStep();
      case 1:
        return renderContentStep();
      case 2:
        return renderAudienceStep();
      case 3:
        return renderBudgetStep();
      case 4:
        return renderPreviewStep();
      default:
        return null;
    }
  };

  return (
    <Box sx={{p: {xs: 1.5, md: 2}}}>
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 3}}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/social/campaigns')}
          sx={{textTransform: 'none'}}
        >
          Back
        </Button>
        <Typography variant="h5" sx={{fontWeight: 700}}>
          Create Campaign
        </Typography>
      </Box>

      <Stepper
        activeStep={activeStep}
        alternativeLabel
        sx={{
          mb: 4,
          '& .MuiStepLabel-label': {fontSize: {xs: '0.7rem', md: '0.875rem'}},
          '& .MuiStepIcon-root.Mui-active': {
            color: theme.palette.secondary.main,
          },
          '& .MuiStepIcon-root.Mui-completed': {
            color: theme.palette.primary.main,
          },
        }}
      >
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {renderStepContent()}

      {activeStep < 4 && (
        <Box sx={{display: 'flex', justifyContent: 'space-between', mt: 4}}>
          <Button
            onClick={handleBack}
            disabled={activeStep === 0}
            sx={{textTransform: 'none'}}
          >
            Back
          </Button>
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={!canProceed()}
            sx={{
              textTransform: 'none',
              background: GRADIENTS.primary,
              '&:hover': {background: GRADIENTS.primaryHover},
            }}
          >
            Next
          </Button>
        </Box>
      )}
    </Box>
  );
}
