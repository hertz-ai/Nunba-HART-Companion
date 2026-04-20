import SocialLayout from './SocialLayout';

import ErrorBoundary from '../shared/ErrorBoundary';

import React from 'react';
import {Outlet} from 'react-router-dom';

export default function SocialHome() {
  return (
    <SocialLayout>
      <ErrorBoundary variant="section">
        <Outlet />
      </ErrorBoundary>
    </SocialLayout>
  );
}
