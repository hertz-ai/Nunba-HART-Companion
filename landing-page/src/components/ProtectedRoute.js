import {useAuth} from '../auth/AuthContext';

import React, {useEffect} from 'react';
import {useNavigate} from 'react-router-dom';

const ProtectedRoute = ({children}) => {
  const {token} = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      navigate('/agents');
    }
  }, [token, navigate]);

  return token ? children : null;
};

export default ProtectedRoute;
