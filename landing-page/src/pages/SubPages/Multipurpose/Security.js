import {logger} from '../../../utils/logger';

import EmojiEventsSharpIcon from '@mui/icons-material/EmojiEventsSharp';
import GraphicEqSharpIcon from '@mui/icons-material/GraphicEqSharp';
import GroupWorkSharpIcon from '@mui/icons-material/GroupWorkSharp';
import RotateRightSharpIcon from '@mui/icons-material/RotateRightSharp';
import EmojiPeopleSharpIcon from '@mui/icons-material/RotateRightSharp';
import SentimentVerySatisfiedSharpIcon from '@mui/icons-material/SentimentVerySatisfiedSharp';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import React, {useState, useEffect} from 'react';


const sxStyles = {
  rightslogo: {fontSize: '50%', position: 'absolute'},
};

// class DiscoverPotential extends Component {
const Security = () => {
  const [isOpen, setIsopen] = useState(false);

  function openModal() {
    logger.log('Entered method openModal>.!');
    setIsopen(true);
  }

  return (
    <React.Fragment>
      <br />
      <br />
      <br />
      <Grid
        container
        style={{
          maxWidth: 'calc(16/9 * 100vh)',
          margin: ' 0 auto',
          textAlign: 'center',
          justifyContent: 'center',
        }}
      >
        <Grid item lg={4} sm={12}>
          <img
            src="/shield-color.svg"
            alt="Data privacy and Security are at the core of the product"
            className="fadeInUp"
            style={{animationDelay: '0.1s'}}
          />
          {/* <div style={{display: 'inline-block'}}>
            <Typography
              variant="h3"
              style={{
                fontSize: '2.5rem',
                fontWeight: 'lighter',
              }}
            >
              Safe, secure and in your control.
            </Typography>
          </div> */}
        </Grid>
        <Grid item lg={8} sm={12}>
          <Grid container direction="column">
            <Grid item align="center">
              <br />
              <br />
              <Typography
                variant="h3"
                paragraph={true}
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 'lighter',
                }}
              >
                Safe, secure and in your control.
              </Typography>
            </Grid>
            <Grid item align="center">
              <Typography paragraph={true}>
                You choose what to share with your Hevolve
                <sup style={sxStyles.rightslogo}>® </sup>. If you ever ask your
                agent for help from other services, you stay in control of the
                information that you share. Easily manage or delete your past
                conversations with your Assistant at any time.
              </Typography>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
      <br />
      <br />
      <br />
      <br />
      <br />

      {/* <div className="row mt-2">
        <div className="col-6">
          <img
            src="/shield-color.svg"
            alt="essentials woman pushing cart"
            className="fadeInUp"
            style={{position: 'absolute', animationDelay: '0.1s'}}
          />
        </div>

        <div className="col-6">
          <div
            style={{
              'font-family':
                '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"',
            }}
          >
            <h3
              style={{
                textAlign: 'left',
                fontSize: '2.5rem',
                fontWeight: 'lighter',
                paddingTop: '10%',
                paddingRight: '10%',
              }}
            >
              Safe, secure and in your control.
            </h3>
            <p
              style={{
                textAlign: 'left',
                width: '100%',
                paddingRight: '10%',
              }}
            >
              You choose what to share with your Hevolve. If you ever ask
              your agent for help from other services, you stay in control of
              the information that you share. Easily manage or delete your past
              conversations with your Assistant at any time.
            </p>
          </div>
        </div>
      </div> */}
    </React.Fragment>
  );
};

// export default withStyles(useStyles)(DiscoverPotential);
export default Security;
