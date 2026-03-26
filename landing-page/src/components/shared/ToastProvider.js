import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import InfoIcon from '@mui/icons-material/Info';
import {Snackbar, Box, Typography, IconButton} from '@mui/material';
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from 'react';

const ToastContext = createContext();

const TOAST_STYLES = {
  achievement: {
    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
    color: '#fff',
    icon: <EmojiEventsIcon sx={{fontSize: 28}} />,
    shadow: '0 8px 32px rgba(255, 165, 0, 0.4)',
  },
  info: {
    background: 'linear-gradient(135deg, #0078ff, #00c6ff)',
    color: '#fff',
    icon: <InfoIcon sx={{fontSize: 28}} />,
    shadow: '0 8px 32px rgba(0, 120, 255, 0.4)',
  },
  success: {
    background: 'linear-gradient(135deg, #00e89d, #00b894)',
    color: '#fff',
    icon: <CheckCircleIcon sx={{fontSize: 28}} />,
    shadow: '0 8px 32px rgba(0, 232, 157, 0.4)',
  },
  mention: {
    background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
    color: '#fff',
    icon: <AlternateEmailIcon sx={{fontSize: 28}} />,
    shadow: '0 8px 32px rgba(108, 92, 231, 0.4)',
  },
};

const MAX_VISIBLE = 3;

export function ToastProvider({children}) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const showToast = useCallback((type = 'info', data = {}) => {
    const id = ++idRef.current;
    const toast = {id, type, ...data, open: true};
    setToasts((prev) => {
      const next = [toast, ...prev];
      return next.slice(0, MAX_VISIBLE + 2); // Keep a small buffer
    });

    // Auto-dismiss
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? {...t, open: false} : t))
      );
      // Clean up after animation
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, data.duration || 5000);

    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? {...t, open: false} : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  return (
    <ToastContext.Provider value={{showToast, dismissToast}}>
      {children}
      {toasts.slice(0, MAX_VISIBLE).map((toast, idx) => {
        const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
        return (
          <Snackbar
            key={toast.id}
            open={toast.open}
            anchorOrigin={{vertical: 'top', horizontal: 'center'}}
            sx={{top: `${24 + idx * 72}px !important`}}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2.5,
                py: 1.5,
                borderRadius: 3,
                background: style.background,
                color: style.color,
                boxShadow: style.shadow,
                minWidth: 280,
                maxWidth: 420,
              }}
            >
              <Box sx={{flexShrink: 0}}>{style.icon}</Box>
              <Box sx={{flex: 1, minWidth: 0}}>
                {toast.title && (
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      display: 'block',
                    }}
                  >
                    {toast.title}
                  </Typography>
                )}
                <Typography variant="body2" sx={{fontWeight: 600}}>
                  {toast.message}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={() => dismissToast(toast.id)}
                sx={{color: 'inherit', opacity: 0.7}}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Snackbar>
        );
      })}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export default ToastContext;
