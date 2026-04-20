import {resonanceApi} from '../../../services/socialApi';

import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import {
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Slider,
  Typography,
  Box,
  keyframes,
  useTheme,
} from '@mui/material';
import React, {useState} from 'react';


// Pulse animation for the boost button on hover
const pulse = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
`;

// Glow animation for active boost
const glow = keyframes`
  0%, 100% { box-shadow: 0 0 8px rgba(243, 156, 18, 0.4); }
  50% { box-shadow: 0 0 16px rgba(243, 156, 18, 0.6); }
`;

// Dialog paper styles
const dialogPaperStyle = {
  background:
    'linear-gradient(135deg, rgba(26, 26, 46, 0.98) 0%, rgba(15, 15, 26, 0.99) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 3,
};

export default function BoostButton({
  targetType = 'post',
  targetId,
  onBoosted,
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [sparkAmount, setSparkAmount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleBoost = async () => {
    setLoading(true);
    try {
      await resonanceApi.boost({
        target_type: targetType,
        target_id: targetId,
        spark_amount: sparkAmount,
      });
      if (onBoosted) onBoosted(sparkAmount);
      setOpen(false);
    } catch {
      /* silent */
    }
    setLoading(false);
  };

  const multiplier = (1.0 + sparkAmount * 0.01).toFixed(2);

  return (
    <>
      <Tooltip title="Boost with Spark" arrow>
        <IconButton
          size="small"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          sx={{
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            color: isHovered ? '#f39c12' : 'rgba(255,255,255,0.5)',
            animation: isHovered
              ? `${pulse} 0.6s ease-in-out infinite`
              : 'none',
            '&:hover': {
              background: 'rgba(243, 156, 18, 0.1)',
            },
          }}
        >
          <RocketLaunchIcon sx={{fontSize: 18}} />
        </IconButton>
      </Tooltip>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="xs"
        fullWidth
        onClick={(e) => e.stopPropagation()}
        PaperProps={{sx: dialogPaperStyle}}
      >
        <DialogTitle
          sx={{
            fontWeight: 700,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background:
                'linear-gradient(135deg, rgba(243, 156, 18, 0.2) 0%, rgba(243, 156, 18, 0.1) 100%)',
              animation: `${glow} 2s ease-in-out infinite`,
            }}
          >
            <RocketLaunchIcon sx={{color: '#f39c12', fontSize: 22}} />
          </Box>
          Boost Content
        </DialogTitle>

        <DialogContent>
          <Typography gutterBottom sx={{color: 'rgba(255,255,255,0.8)'}}>
            Spend Spark to boost visibility
          </Typography>

          {/* Stats display */}
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              mt: 2,
              mb: 3,
            }}
          >
            <Box
              sx={{
                flex: 1,
                p: 2,
                borderRadius: 2,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
                textAlign: 'center',
              }}
            >
              <Typography
                variant="caption"
                sx={{color: 'rgba(255,255,255,0.5)', display: 'block'}}
              >
                Multiplier
              </Typography>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                  background:
                    'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {multiplier}x
              </Typography>
            </Box>
            <Box
              sx={{
                flex: 1,
                p: 2,
                borderRadius: 2,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
                textAlign: 'center',
              }}
            >
              <Typography
                variant="caption"
                sx={{color: 'rgba(255,255,255,0.5)', display: 'block'}}
              >
                Duration
              </Typography>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                  background: `linear-gradient(135deg, ${theme.palette.secondary.main} 0%, ${theme.palette.primary.main} 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {sparkAmount}h
              </Typography>
            </Box>
          </Box>

          {/* Slider */}
          <Box sx={{px: 1}}>
            <Slider
              value={sparkAmount}
              onChange={(e, v) => setSparkAmount(v)}
              min={5}
              max={200}
              step={5}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v} Spark`}
              sx={{
                '& .MuiSlider-rail': {
                  background: 'rgba(255,255,255,0.1)',
                  height: 8,
                },
                '& .MuiSlider-track': {
                  background:
                    'linear-gradient(90deg, #f39c12 0%, #e67e22 100%)',
                  height: 8,
                  border: 'none',
                },
                '& .MuiSlider-thumb': {
                  width: 20,
                  height: 20,
                  background: '#f39c12',
                  boxShadow: '0 0 10px rgba(243, 156, 18, 0.5)',
                  '&:hover, &.Mui-focusVisible': {
                    boxShadow: '0 0 16px rgba(243, 156, 18, 0.7)',
                  },
                },
                '& .MuiSlider-valueLabel': {
                  background:
                    'linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(15, 15, 26, 0.98) 100%)',
                  border: '1px solid rgba(243, 156, 18, 0.3)',
                  borderRadius: 2,
                },
              }}
            />
          </Box>
        </DialogContent>

        <DialogActions sx={{p: 2, pt: 0}}>
          <Button
            onClick={() => setOpen(false)}
            sx={{
              color: 'rgba(255,255,255,0.6)',
              '&:hover': {
                color: '#fff',
                background: 'rgba(255,255,255,0.05)',
              },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleBoost}
            disabled={loading}
            variant="contained"
            sx={{
              background: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)',
              fontWeight: 600,
              px: 3,
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 16px rgba(243, 156, 18, 0.4)',
              },
              '&:disabled': {
                background: 'rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.3)',
              },
            }}
          >
            {loading ? 'Boosting...' : `Boost (${sparkAmount} Spark)`}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
