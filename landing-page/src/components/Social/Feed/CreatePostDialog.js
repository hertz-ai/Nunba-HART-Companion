/**
 * CreatePostDialog - Thin wrapper that delegates to CreateThoughtExperimentDialog.
 *
 * Preserves backward-compatible import path for existing code that imports CreatePostDialog.
 */

import CreateThoughtExperimentDialog from './CreateThoughtExperimentDialog';

import React from 'react';

export default function CreatePostDialog({
  open,
  onClose,
  onCreated,
  communityId,
}) {
  return (
    <CreateThoughtExperimentDialog
      open={open}
      onClose={onClose}
      onCreated={onCreated}
      communityId={communityId}
    />
  );
}
