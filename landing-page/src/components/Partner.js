import Spacer from './Spacer';

import FooterLight from '../pages/Layouts/footer-light';
import HeaderNano from '../pages/Layouts/header';
import Partners from '../pages/SubPages/Multipurpose/partners';

import Button from '@mui/material/Button';
import {purple} from '@mui/material/colors';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';



// color button styles - starts
import {withStyles} from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import React from 'react';
// color button styles - ends

// Note: @global ul styles were removed (makeStyles migration) - use CSS if needed

const ColorButton = withStyles((theme) => ({
  root: {
    background: 'linear-gradient(to right, #00e89d, #0078ff)',
    // color: theme.palette.getContrastText(purple[500]),
    // color: "linear-gradient(to right, #00e89d, #0078ff)",
    // backgroundColor: purple[500],
    // '&:hover': {
    //   backgroundColor: purple[700],
    // },
  },
}))(Button);

export default function Partner() {
  return (
    <React.Fragment>
      <style jsx="true">
        {`
          .navbar-nav a:hover {
            color: #13ce67;
          }
        `}
      </style>
      <HeaderNano fixed={true} />
      {/* Hero unit */}

      <Partners />
      <Spacer h={120} />
      {/* Footer */}
      <FooterLight />
      {/* End footer */}
    </React.Fragment>
  );
}
