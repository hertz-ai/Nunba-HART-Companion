import {Box, Typography, Fade, useTheme, SvgIcon} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React from 'react';

/* Inline fallback icon (inbox) — avoids @mui/icons-material chunk dependency */
const FallbackIcon = React.forwardRef(function FallbackIcon(props, ref) {
  return (
    <SvgIcon ref={ref} {...props}>
      <path d="M19 3H4.99c-1.11 0-1.98.89-1.98 2L3 19c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 12h-4c0 1.66-1.35 3-3 3s-3-1.34-3-3H4.99V5H19v10z" />
    </SvgIcon>
  );
});

function renderIcon(IconProp) {
  // If caller passed a React element (<SomeIcon />) instead of a component, render it directly
  if (React.isValidElement(IconProp)) return IconProp;
  // Valid component types: string, function, or object with $$typeof (memo/forwardRef)
  if (typeof IconProp === 'function') return <IconProp sx={iconSx} />;
  if (
    typeof IconProp === 'object' &&
    IconProp !== null &&
    IconProp['$$typeof']
  ) {
    return React.createElement(IconProp, {sx: iconSx});
  }
  // Fallback
  return <FallbackIcon sx={iconSx} />;
}

const iconSx = {
  fontSize: 36,
  background:
    'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.15) 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

export default function EmptyState({
  message = 'Nothing here yet.',
  icon: CustomIcon,
  action = null,
}) {
  const theme = useTheme();
  return (
    <Fade in={true} timeout={500}>
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          px: 3,
        }}
      >
        {/* Icon container with breathing float animation */}
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
            mb: 3,
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
            border: '1px solid rgba(255,255,255,0.05)',
            '@keyframes emptyFloat': {
              '0%, 100%': {transform: 'translateY(0)'},
              '50%': {transform: 'translateY(-8px)'},
            },
            animation: 'emptyFloat 3s ease-in-out infinite',
          }}
        >
          {renderIcon(CustomIcon || FallbackIcon)}
        </Box>

        <Typography
          variant="body1"
          sx={{
            color: 'rgba(255,255,255,0.5)',
            fontWeight: 500,
            mb: action ? 2 : 0,
          }}
        >
          {message}
        </Typography>

        {action && (
          <Box
            sx={{
              mt: 2,
              '@keyframes actionBounce': {
                '0%': {opacity: 0, transform: 'scale(0.9)'},
                '100%': {opacity: 1, transform: 'scale(1)'},
              },
              animation:
                'actionBounce 400ms cubic-bezier(0.34, 1.56, 0.64, 1) 300ms both',
            }}
          >
            {action}
          </Box>
        )}
      </Box>
    </Fade>
  );
}
