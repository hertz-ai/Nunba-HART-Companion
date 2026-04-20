import {Box, CircularProgress} from '@mui/material';
import React, {useRef, useEffect} from 'react';

export default function InfiniteScroll({
  children,
  hasMore,
  loading,
  onLoadMore,
  skeleton,
}) {
  const sentinel = useRef();
  const lastFireRef = useRef(0);

  useEffect(() => {
    if (!hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // Debounce: prevent scrollbar recursion when content is empty/short
          const now = Date.now();
          if (now - lastFireRef.current > 1000) {
            lastFireRef.current = now;
            onLoadMore();
          }
        }
      },
      {rootMargin: '200px'}
    );
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  return (
    <div>
      {children}
      {loading &&
        (skeleton || (
          <Box sx={{textAlign: 'center', py: 2}}>
            <CircularProgress size={24} />
          </Box>
        ))}
      {hasMore && !loading && <div ref={sentinel} style={{height: 1}} />}
    </div>
  );
}
