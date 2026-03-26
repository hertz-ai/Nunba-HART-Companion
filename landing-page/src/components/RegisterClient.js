import React, {useEffect, useState} from 'react';
import Radio from '@mui/material/Radio';

// get our fontawesome imports
import Register from './register';
import Spacer from './Spacer';

import HeaderNano from '../pages/Layouts/header';

import Box from '@mui/material/Box';
import './RegisterClient.scss';
// configData import removed - RegisterClient does not use any config endpoints directly
import Button from '@mui/material/Button';
import {green, purple} from '@mui/material/colors';
import Link from '@mui/material/Link';
import {withStyles, useTheme} from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {useNavigate} from 'react-router-dom';

function Copyright() {
  return (
    <Typography variant="body2" color="textSecondary" align="center">
      {'Copyright © '}
      <Link color="inherit" href="https://hertzai.com/">
        HertzAI
      </Link>{' '}
      {new Date().getFullYear()}
      {'.'}
    </Typography>
  );
}

export default function RegisterClient() {
  const ITEM_HEIGHT = 48;
  const ITEM_PADDING_TOP = 8;
  const MenuProps = {
    PaperProps: {
      style: {
        maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
        width: 250,
      },
    },
  };
  return (
    <React.Fragment>
      {/* <AppBar position="absolute" color="default" className={classes.appBar}>
        <Toolbar>
          <a className="navbar-brand" href="/register/clients">
            <img
              src={logo_dark}
              alt="Hertz ai"
              className="logo-dark"
              height="14"
            />
          </a>
        </Toolbar>
      </AppBar> */}
      <HeaderNano fixed={true} />

      <Spacer h={60} />
      <Register />
      <Box mt={5}>
        <Copyright />
      </Box>
    </React.Fragment>
  );
}
