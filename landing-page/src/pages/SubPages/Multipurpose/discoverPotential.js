import EmojiEventsSharpIcon from '@mui/icons-material/EmojiEventsSharp';
import GraphicEqSharpIcon from '@mui/icons-material/GraphicEqSharp';
import GroupWorkSharpIcon from '@mui/icons-material/GroupWorkSharp';
import RotateRightSharpIcon from '@mui/icons-material/RotateRightSharp';
import EmojiPeopleSharpIcon from '@mui/icons-material/RotateRightSharp';
import SentimentVerySatisfiedSharpIcon from '@mui/icons-material/SentimentVerySatisfiedSharp';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import React, {useState, useEffect} from 'react';
// import './parallax.scss';
import {Parallax} from 'react-parallax';
const image1 =
  'https://images.unsplash.com/photo-1498092651296-641e88c3b057?auto=format&fit=crop&w=1778&q=60&ixid=dW5zcGxhc2guY29tOzs7Ozs%3D';

const sxStyles = {
  iconStyles: {
    color: '#13ce67',
    fontSize: '32px',
    marginBottom: '1rem',
  },
  rightslogo: {fontSize: '16px', top: '-3px'},
  registeredStyles: {fontSize: '16px', position: 'absolute', margin: '2px 4px'},
  fontAlignment: {textAlign: 'start'},
};

export default function DiscoverPotential() {
  const ParallaxImage = () => (
    <Parallax className="custom-class" y={[-0, 20]} tagOuter="figure">
      <img src="/essentials_1.svg" className="crowd-bg rellax" />
    </Parallax>
  );

  return (
    <React.Fragment>
      {/* <section className="section" id="about"> */}

      <br />
      <br />
      <Grid container alignItems="center" direction="column">
        <Grid item align="center">
          <Typography
            variant="h3"
            paragraph={true}
            style={{
              fontSize: '2.5rem',
              fontWeight: 'lighter',
            }}
          >
            Discover what Hevolve
            <sup style={{fontSize: '14px', top: '-0.8rem'}}>® </sup>
            <br />
            can do
          </Typography>
        </Grid>
        <Grid item align="center">
          <Typography paragraph={true}>
            Check out how Hevolve<sup style={sxStyles.rightslogo}>® </sup>
            helps everyone leveraging cutting edge technology like ChatGPT.
          </Typography>
        </Grid>
      </Grid>

      <br />
      <br />

      {/* <Parallax bgImage={image1}  blur={{ min: -1, max: 3 }}> */}
      <div style={{overflow: 'hidden'}}>
        <Grid
          container
          spacing={3}
          direction="row"
          align="center"
          // style={{maxWidth: 'calc(16/9 * 100vh)', margin: ' 0 auto'}}
          style={{maxWidth: 'calc(100% - 30px)', margin: ' 0 auto'}}
        >
          <Grid item md={4} lg={4}>
            <Grid container direction="column" spacing={2}>
              <Grid item>
                {/* <EmojiEventsSharpIcon/> */}
                <div style={sxStyles.iconStyles}>
                  <i className="pe-7s-gift" aria-hidden="true"></i>
                </div>
                <Typography variant="h5">Make learning rewarding</Typography>
                <Typography sx={sxStyles.fontAlignment} paragraph={true}>
                  Hevolve<sup style={sxStyles.rightslogo}>® </sup> offers
                  assistance to students when they struggle and rewards them
                  with stars when they do well.
                </Typography>
              </Grid>
              <Grid item>
                {/* <GraphicEqSharpIcon style={sxStyles.iconStyles} /> */}
                <div style={sxStyles.iconStyles}>
                  <i className="pe-7s-map"></i>
                </div>
                <Typography variant="h5">Updates knowledge graph</Typography>
                <Typography sx={sxStyles.fontAlignment} paragraph={true}>
                  Elevate your expertise with Hevolve
                  <sup style={sxStyles.rightslogo}>® </sup> - the AI-powered
                  assistive technology that tracks your knowledge graph and
                  creates customized strategies to fill any gaps. Stay ahead of
                  the game and reach your goals faster with Hevolve
                  <sup style={sxStyles.rightslogo}>®. </sup>
                </Typography>
              </Grid>
              <Grid item>
                <div style={sxStyles.iconStyles}>
                  <i className="pe-7s-repeat" aria-hidden="true"></i>
                </div>
                <Typography variant="h5">Continuous feedback</Typography>
                <Typography sx={sxStyles.fontAlignment} paragraph={true}>
                  Hevolve<sup style={sxStyles.rightslogo}>® </sup>
                  is the perfect study buddy for when exams roll around. It
                  assesses your understanding of a subject and pinpoints areas
                  that need improvement, ensuring you are as prepared as can be
                  for when the big day arrives.
                </Typography>
              </Grid>
            </Grid>
            {/* container-1*/}
          </Grid>
          <Grid item xs={12} md={4} lg={4} id="midSec" />
          <Grid item xs={12} md={4} lg={4}>
            <Grid container direction="column" spacing={2}>
              <Grid item>
                {/* <EmojiPeopleSharpIcon style={sxStyles.iconStyles} /> */}
                <div style={sxStyles.iconStyles}>
                  <i className="pe-7s-clock"></i>
                </div>
                <Typography variant="h5">Clarifies in real time</Typography>
                <Typography sx={sxStyles.fontAlignment} paragraph={true}>
                  Asking right question at right time can be crucial and it is
                  equally important to get them answered at the right time.
                  Hevolve<sup style={sxStyles.rightslogo}>® </sup>
                  is an assistive technology that fills the gap
                </Typography>
              </Grid>

              <Grid item>
                {/* <SentimentVerySatisfiedSharpIcon style={sxStyles.iconStyles} /> */}
                <div style={sxStyles.iconStyles}>
                  <i className="pe-7s-user-female"></i>
                </div>
                <Typography variant="h5">
                  Personalized learning experience
                </Typography>
                <Typography sx={sxStyles.fontAlignment} paragraph={true}>
                  Hevolve<sup style={sxStyles.rightslogo}>® </sup> is the
                  perfect way to learn faster and achieve your goals. With
                  Hevolve's personalized assistive technology, you'll get
                  customized learning techniques that are tailored to your
                  unique needs.
                </Typography>
              </Grid>
              <Grid item>
                <div style={sxStyles.iconStyles}>
                  <i className="pe-7s-smile"></i>
                </div>
                {/* <GroupWorkSharpIcon style={sxStyles.iconStyles} /> */}
                <Typography variant="h5">Engaging and fun</Typography>
                <Typography sx={sxStyles.fontAlignment} paragraph={true}>
                  Hevolve<sup style={sxStyles.rightslogo}>® </sup> is the
                  interactive and fun app that lets you engage with voice and in
                  your native language. Hevolve
                  <sup style={sxStyles.rightslogo}>® </sup> can clone your
                  favorite teacher's face and vocals for better rentention.
                </Typography>
              </Grid>
            </Grid>
            {/* container-2*/}
          </Grid>
        </Grid>
      </div>
      {/* </Parallax> */}
    </React.Fragment>
  );
}
