import FooterLight from '../pages/Layouts/footer-light';
import HeaderNano from '../pages/Layouts/header';
import HeaderMulti from '../pages/Layouts/header-multi';
import AboutUs from '../pages/SubPages/Multipurpose/about-us';
import Client from '../pages/SubPages/Multipurpose/client';
import Contact from '../pages/SubPages/Multipurpose/contact';
import Cta from '../pages/SubPages/Multipurpose/cta';
import Features from '../pages/SubPages/Multipurpose/features';
import Services from '../pages/SubPages/Multipurpose/services';
import Team from '../pages/SubPages/Multipurpose/team';
import Testimonial from '../pages/SubPages/Multipurpose/testimonial';

import React, {Component} from 'react';
import ModalVideo from 'react-modal-video';
import {Link} from 'react-router-dom';
import {ScrollTo} from 'react-scroll-to';
// Layouts

// Shared

// Modal Video
import '../../node_modules/react-modal-video/scss/modal-video.scss';
import '../css/pe-icon-7.css';
import '../css/style.css';
import '../css/style.css.map';
import '../_helper.scss';
import '../css/bootstrap.min.css';

// Material UI
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import {useState, useEffect} from 'react';
import Box from '@mui/material/Box';
import {styled} from '@mui/material/styles';

import human_computer from '../images/human_computer.png';

import Container from '@mui/material/Container';
import {green, purple} from '@mui/material/colors';
import Button from '@mui/material/Button';

import Demo from './demo';
import '../css/cortext.css';
import DemoVideo from './demoVideo';
import Spacer from './Spacer';

import MetaTags from 'react-meta-tags';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';

import DemoConsearch from './demoConsearch';

import {logger} from '../utils/logger';

const styles = {
  coverImage: {
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    background: '#fff',
    margin: '0 auto',
  },
  row: {
    display: 'grid',
    alignItems: 'center',
    gridGap: '50px 100px',
    '@media (min-width:900px)': {
      gridTemplateColumns: '1fr 1fr',
    },
  },
  column1: {
    order: 2,
    '@media (min-width:900px)': {
      order: 1,
    },
  },
  column2: {
    order: 1,
    '@media (min-width:900px)': {
      order: 2,
    },
  },
  media: {
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: 360,
    outline: 0,
    borderRadius: '25px',
  },
  heading: {
    color: '#28315E',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 0,
    '@media (min-width:900px)': {
      fontSize: 32,
      textAlign: 'center',
    },
  },
  heading2: {
    color: '#757A96',
    fontSize: 14,
    fontWeight: 'normal',
    '@media (min-width:900px)': {
      fontSize: 16,
      textAlign: 'center',
    },
  },
  heroHeading: {
    textAlign: 'left',
    fontSize: 28,
    lineHeight: '1.2',
    marginBottom: '20px',
    '@media (min-width:1200px)': {
      fontSize: 44,
    },
  },
  heroHeading2: {
    textAlign: 'left',
    fontSize: 16,
    margin: 0,
    '@media (min-width:1200px)': {
      fontSize: 24,
    },
  },
};

const ColorButton = styled(Button)(({theme}) => ({
  color: theme.palette.getContrastText(purple[500]),
  background: 'linear-gradient(to right, #f800a4, #0078ff)',
  '&:hover': {
    color: '#fff',
  },
  '&:focus': {
    outline: 'none',
  },
}));

// export default function consearch() {
function Consearch() {
  const [isOpen, setIsopen] = useState(false);
  const [value, setValue] = React.useState('female');

  const handleDemoChange = (event) => {
    alert('Selected :: ' + event.target.value);
    setValue(event.target.value);
  };

  function routeToContactUs() {
    // document.querySelector("#mySidenav > li:nth-child(8) > a").click();
    document
      .querySelector(
        '#root > div > header > div.navbar-wrapper.navbar-fixed > div > div > div.navbar-nav-wrapper > ul > li:nth-child(10) > a'
      )
      .click();
  }

  function openModal() {
    logger.log('Entered method openModal>.!');
    setIsopen(true);
  }

  useEffect(() => {
    logger.log('page is fully loaded');
    document.body.classList = '';
    // window.addEventListener('scroll', scrollNavigation, true);
  });

  // function ShowPage = ({activePage}) =>
  // <h1>{activePage}</h1>;

  function scrollNavigation() {
    const doc = document.documentElement;
    const top = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0);
    if (top > 80) {
      document.getElementById('nav-bar').classList.add('nav-sticky');
      logger.log('>80');
    } else {
      document.getElementById('nav-bar').classList.remove('nav-sticky');
      logger.log('<=80');
    }
  }

  return (
    <React.Fragment>
      <MetaTags>
        <title>HertzAI | Consearch</title>
        <meta
          id="meta-description"
          name="description"
          content="Consearch- NLP based document search engine"
        />
        <meta id="og-title" property="og:title" content="Consearch" />
        <meta id="og-image" property="og:image" content="/logo-light.png" />
      </MetaTags>
      {/* <style jsx="true">
        {`
          .navbar-custom .navbar-nav li a {
            color: #0f1f3e;
          }
          #nav-bar {
            // background: linear-gradient(45deg, #c471f5, #fa71cd);
            box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.12),
              inset 0 -1px 0 0 #e6e6e6;
          }
        `}
      </style>
      <HeaderMulti /> */}

      <HeaderNano fixed={true} />
      {/* <Spacer h={120} /> */}
      <section
        className="bg-home-responsive"
        style={{'background-image': 'none'}}
        id="home"
      >
        <Container sx={styles.coverImage}>
          <div style={{overflow: 'hidden'}}>
            <div>
              <Box sx={styles.row}>
                <Box sx={styles.column1}>
                  {/* <div> */}
                  <Box
                    component="p"
                    className="fadeInUp"
                    sx={{...styles.heading, ...styles.heroHeading}}
                  >
                    Search Enhancement
                  </Box>
                  <Box
                    component="p"
                    className="fadeInUp"
                    sx={{
                      ...styles.heading2,
                      ...styles.heroHeading2,
                      color: '#757A96',
                    }}
                  >
                    Combining NLP, data mining and computer vision to create a
                    rich academic search experience that helps users discover
                    and understand the content more efficiently than ever
                  </Box>
                  <Spacer h={60} />
                  {/* <div
                    style={{margin: '30px 0px 0', animationDelay: '.3s'}}
                    className="fadeInUp"
                    > */}
                  {/* <a
                      href="#"
                      rel="noopener noreferrer"
                      className="btn"
                      style={{margin: 8}}
                      onClick={routeToContactUs}
                    >
                      Request A Demo
                    </a>
                    <a href="#" onClick={routeToContactUs} className="btn blue" style={{margin: 8}}>
                      Get Started
                    </a> */}

                  <div className="container">
                    <div className="row">
                      <style jsx="true">
                        {`
                          .col-sm-3 {
                            width: auto;
                          }
                        `}
                      </style>
                      <div className="order-1 col-lg-4 col-md-3 col-sm-3 col-xs-12">
                        <ColorButton
                          variant="contained"
                          color="primary"
                          onClick={routeToContactUs}
                        >
                          GET STARTED
                        </ColorButton>
                      </div>
                      <div className="order-2 col-lg-3 col-md-3 col-sm-3 col-xs-12">
                        <DemoVideo
                          videoId={'ZU6tnPGopos'}
                          learnMore={'none'}
                          buttonColor={'#0078ff'}
                          style={{animationDelay: '.3s'}}
                          component="consearch"
                        />
                      </div>
                    </div>
                    <div className="row">
                      <div className="col-lg-12">
                        <div className="mouse-down text-center">
                          <ScrollTo>
                            {({scrollTo}) => (
                              <Link
                                to="#about"
                                onClick={() => scrollTo({y: 710, smooth: true})}
                                className="down-scroll text-dark"
                              >
                                <i className="mdi mdi-arrow-down h4"></i>
                              </Link>
                            )}
                          </ScrollTo>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p
                    style={{
                      fontSize: 12,
                      color: '#99A3B4',
                      margin: '10px 0 0',
                      animationDelay: '.3s',
                    }}
                    className="fadeInUp"
                  >
                    Free trial. No credit card required. Easy set-up.
                  </p>
                  {/* </div> */}
                </Box>

                <Box sx={styles.column2}>
                  <Box
                    component="img"
                    className="lazyload"
                    sx={styles.media}
                    id="0-/media/landing-ocr-1.gif"
                    data-src="/consearch_cover.jpg"
                    alt=""
                    src="/consearch_cover.jpg"
                  />
                </Box>
              </Box>
            </div>
          </div>
        </Container>
      </section>
      {/* <Spacer h={120} /> */}

      <Spacer h={60} />
      {/* Demo consearch  */}
      <Typography
        variant="h3"
        paragraph={true}
        style={{
          fontSize: '2.5rem',
          fontWeight: 'lighter',
          textAlign: 'center',
        }}
      >
        Check the demo live!
      </Typography>
      <DemoConsearch />
      <Spacer h={120} />
      <FooterLight />
    </React.Fragment>
  );
}
export default Consearch;
