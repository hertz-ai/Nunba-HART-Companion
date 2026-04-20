import Box from '@mui/material/Box';
import React, {useState, useCallback} from 'react';

/**
 * GameItemImage - Renders either a cached image blob or an emoji fallback.
 *
 * Used throughout the Kids Learning Zone games wherever a visual prompt
 * accompanies a question, option, word, or card. GameAssetService resolves
 * the image; this component handles the two display modes.
 *
 * If the blob URL fails to load (broken URL, revoked blob, network error),
 * the component automatically falls back to the emoji display.
 *
 * @param {Object}  props
 * @param {string|null} props.blobUrl - Blob URL from GameAssetService (null = use emoji)
 * @param {string}  props.emoji       - Emoji character(s) shown when blobUrl is falsy
 * @param {number}  [props.size=64]   - Width and height in pixels
 * @param {string}  [props.alt]       - Accessible alt text for the image
 * @param {Object}  [props.sx]        - Additional MUI sx overrides
 */
const GameItemImage = ({blobUrl, emoji, size = 64, alt, sx}) => {
  const [imgError, setImgError] = useState(false);

  const handleError = useCallback(() => {
    setImgError(true);
  }, []);

  if (blobUrl && !imgError) {
    return (
      <Box
        component="img"
        src={blobUrl}
        alt={alt || emoji || 'game item'}
        onError={handleError}
        sx={{
          width: size,
          height: size,
          borderRadius: '12px',
          objectFit: 'cover',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          ...sx,
        }}
      />
    );
  }

  return (
    <Box
      component="span"
      role="img"
      aria-label={alt || emoji || 'game item'}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        fontSize: size * 0.75,
        lineHeight: 1,
        userSelect: 'none',
        ...sx,
      }}
    >
      {emoji}
    </Box>
  );
};

export default GameItemImage;
