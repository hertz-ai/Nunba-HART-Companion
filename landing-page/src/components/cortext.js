import Footer from '../pages/Layouts/footer';
import FooterLight from '../pages/Layouts/footer-light';
import HeaderNano from '../pages/Layouts/header';
import HeaderMulti from '../pages/Layouts/header-multi';
import HeaderApp from '../pages/Layouts/HeaderApp';
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
import '../css/cortext.css';

// Material UI
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import {useState, useEffect} from 'react';
import Box from '@mui/material/Box';
import {styled} from '@mui/material/styles';

import human_computer from '../images/human_computer.png';

import Container from '@mui/material/Container';

import Spacer from './Spacer';
import UploadFile from './uploadFIle';
import Demo from './demo';

import {logger} from '../utils/logger';

import {green, purple} from '@mui/material/colors';
import Button from '@mui/material/Button';

import DemoVideo from './demoVideo';

import MetaTags from 'react-meta-tags';
import Media from 'react-media';

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
  demo: {
    '@media (min-width:900px)': {
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
function Cortext() {
  const [isOpen, setIsopen] = useState(false);

  function openModal() {
    logger.log('Entered method openModal>.!');
    setIsopen(true);
  }

  function routeToContactUs() {
    // document.querySelector("#mySidenav > li:nth-child(8) > a").click();
    document
      .querySelector(
        '#root > div > header > div.navbar-wrapper.navbar-fixed > div > div > div.navbar-nav-wrapper > ul > li:nth-child(10) > a'
      )
      .click();
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

  const contactLink = (props) => <Link to="/contactus" {...props} />;

  return (
    <React.Fragment>
      <MetaTags>
        <title>HertzAI | Cortext</title>
        <meta
          id="meta-description"
          name="description"
          content="Cortext- An AI-enabled OCR solution for businesses and enterprises. Invoice Extraction, Bill Extraction, document format conversion, image to text conversion."
        />
        <meta id="og-title" property="og:title" content="Cortext" />
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
            background-color: #f8f9fa;
          }
          #nav-bar > div > a > img.logo-light {
            display: none;
          }
          #nav-bar > div > a > img.logo-dark {
            display: inline-block;
          }
          #submit {
            background: #f800a4 !important;
            border: 1px solid #f800a4 !important;
          }
          #notificationBar > div {
            background-color: #3d0de7;
          }
        `}
      </style>
      <HeaderMulti /> */}
      <Media query="(max-width: 599px)">
        {(matches) =>
          matches.small ? (
            <style jsx="true">
              {`
                .bg-home {
                  padding-top: 0px !important;
                }
              `}
            </style>
          ) : (
            <style jsx="true">
              {`
                .bg-home {
                  padding: 130px 0px 130px 0px;
                }
              `}
            </style>
          )
        }
      </Media>

      {/* <style jsx="true">
        {`
          .bg-home {
            padding: 130px 0px 130px 0px;
          }
        `}
      </style> */}
      <HeaderNano fixed={true} />

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
                    Invoice processing made seamless
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
                    Easy to use invoice OCR REST API provided by AI Free up your
                    Accounts Team from manual data entry, with HertzAI's Fully
                    Automatic Invoice Processing!
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
                      <div className="order-1 col-lg-3 col-md-3 col-sm-3 col-xs-12">
                        <DemoVideo
                          videoId={'NVXYuHa7MLc'}
                          learnMore={'none'}
                          buttonColor={'#0078ff'}
                          style={{animationDelay: '.3s'}}
                          component="cortext"
                        />
                      </div>
                      <div className="order-2 col-lg-4 col-md-3 col-sm-3 col-xs-12">
                        <ColorButton
                          variant="contained"
                          color="primary"
                          onClick={routeToContactUs}
                        >
                          GET STARTED
                        </ColorButton>
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
                    data-src="/cortext_without_qr.png"
                    alt=""
                    src="/cortext_without_qr.png"
                  />
                </Box>
              </Box>
            </div>
          </div>
        </Container>
      </section>
      {/* <Spacer h={120} /> */}

      {/* <Container sx={styles.coverImage}>
        <div style={{overflow: 'hidden'}}>
          <div>
            <Box sx={styles.row}>
              <Box sx={styles.column1}>
                <div>
                  <Box
                    component="p"
                    className="fadeInUp"
                    sx={{...styles.heading, ...styles.heroHeading}}
                  >
                    Invoice processing made seamless
                  </Box>
                  <Box
                    component="p"
                    className="fadeInUp"
                    sx={{...styles.heading2, ...styles.heroHeading2, color: '#757A96'}}
                  >
                    Easy to use invoice OCR REST API provided by AI Free up your
                    Accounts Team from manual data entry, with HertzAI's Fully
                    Automatic Invoice Processing!
                  </Box>
                  <div
                    style={{margin: '30px 0px 0', animationDelay: '.3s'}}
                    className="fadeInUp"
                  >
                    <Grid container spacing={2}>
                      <Grid item square>
                        <div>
                          <ColorButton
                            variant="contained"
                            color="primary"
                            onClick={routeToContactUs}
                          >
                            GET STARTED
                          </ColorButton>
                        </div>
                      </Grid>

                      <Grid item square>
                        <div>
                          <ColorButton
                            variant="contained"
                            color="primary"
                            onClick={routeToContactUs}
                          >
                            REQUEST A DEMO
                          </ColorButton>
                        </div>
                      </Grid>
                    </Grid>
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
                </div>
              </Box>

              <Box sx={styles.column2}>
                <Box
                  component="img"
                  className="lazyload"
                  sx={styles.media}
                  id="0-/media/landing-ocr-1.gif"
                  data-src="/cortext_robo.png"
                  alt=""
                  src="/cortext_robo.png"
                />

              </Box>
            </Box>
          </div>
        </div>
      </Container> */}

      {/* <Spacer h={120} /> */}

      <style jsx="true">
        {`
          .AboutUs-aboutUsIcons-21 {
            color: #f800a4;
          }
        `}
      </style>

      <section style={{background: '#fbfafc'}}>
        <Container>
          <div style={{padding: '60px 0'}}>
            <AboutUs />
          </div>
        </Container>
      </section>

      {/* <Spacer h={120} /> */}

      <Container>
        <div id="demo" style={{height: 100}} />

        <Box sx={styles.demo}>
          <Box component="h1" sx={styles.heading}>
            Test your own invoices, Now!
          </Box>
          <Box
            component="h2"
            sx={{
              ...styles.heading2,
              display: 'inline-block',
              maxWidth: 700,
              margin: 0,
            }}
          >
            Toggle between the demo images or upload your own and extract data
            live.
          </Box>
        </Box>

        <Spacer h={60} />

        <Demo
          demo={[
            {
              input: '/159669867729jpg.jpg',
              output: {
                result: {
                  predictions: [
                    {
                      xmin: 194,
                      ymin: 221,
                      xmax: 1523,
                      ymax: 1359,
                      label: 'figure_100%',
                      score: 1,
                      ocr_text: 'NA',
                    },
                    {
                      xmin: 1894,
                      ymin: 105,
                      xmax: 2118,
                      ymax: 198,
                      label: 'Invoice_Date',
                      score: 1,
                      ocr_text: '04/18/12',
                    },
                    {
                      xmin: 2257,
                      ymin: 2752,
                      xmax: 2422,
                      ymax: 2844,
                      label: 'Total',
                      score: 1,
                      ocr_text: '25.75',
                    },
                    {
                      xmin: 217,
                      ymin: 607,
                      xmax: 640,
                      ymax: 719,
                      label: 'Customer Address',
                      ocr_text: 'Po Box 311 Whiteland IN 46184',
                    },
                  ],
                },
              },
              demo_type: 'OCR',
              output_type: ['json'],
            },
            {
              input: '/pub_invc_2.jpg',
              output: {
                result: {
                  predictions: [
                    {
                      xmin: 557,
                      ymin: 10,
                      xmax: 645,
                      ymax: 40,
                      label: 'Invoice_ID',
                      score: 1,
                      ocr_text: '0501001',
                    },
                    {
                      xmin: 537,
                      ymin: 154,
                      xmax: 599,
                      ymax: 173,
                      label: 'Invoice_Date',
                      score: 1,
                      ocr_text: '8.9.2007',
                    },
                    {
                      xmin: 534,
                      ymin: 599,
                      xmax: 623,
                      ymax: 624,
                      label: 'Total',
                      score: 1,
                      ocr_text: '2 5000 000,00',
                    },
                    {
                      xmin: 75,
                      ymin: 295,
                      xmax: 226,
                      ymax: 319,
                      label: 'Product_Name',
                      score: 1,
                      ocr_text: 'Vytvoreni WWW stranek',
                    },
                    {
                      xmin: 535,
                      ymin: 297,
                      xmax: 650,
                      ymax: 319,
                      label: 'Product_Price',
                      ocr_text: '2 500 000,00',
                    },
                  ],
                },
              },
              demo_type: 'OCR',
              output_type: null,
            },
            {
              input: '/pub_invc_3.jpg',
              output: {
                result: {
                  predictions: [
                    {
                      xmin: 412,
                      ymin: 382,
                      xmax: 443,
                      ymax: 397,
                      label: 'Total',
                      score: 1,
                      ocr_text: '28.35',
                    },
                    {
                      xmin: 529,
                      ymin: 51,
                      xmax: 601,
                      ymax: 67,
                      label: 'Invoice_ID',
                      score: 1,
                      ocr_text: 'GCCS673380',
                    },
                    {
                      xmin: 458,
                      ymin: 51,
                      xmax: 520,
                      ymax: 69,
                      label: 'Invoice_Date',
                      score: 1,
                      ocr_text: '04/17/12',
                    },
                    {
                      xmin: 225,
                      ymin: 52,
                      xmax: 329,
                      ymax: 69,
                      label: 'Customer_Name',
                      ocr_text: 'Mark T Springer',
                    },
                  ],
                },
              },
              demo_type: 'OCR',
              output_type: ['json'],
            },
            {
              input: '/pub_invc_4.jpg',
              output: {
                result: {
                  predictions: [
                    {
                      xmin: 452,
                      ymin: 71,
                      xmax: 530,
                      ymax: 94,
                      label: 'Invoice_ID',
                      score: 1,
                      ocr_text: 'F2016/0947',
                    },
                    {
                      xmin: 425,
                      ymin: 102,
                      xmax: 491,
                      ymax: 131,
                      label: 'Invoice_Date',
                      score: 1,
                      ocr_text: '07/12/2016',
                    },
                    {
                      xmin: 659,
                      ymin: 835,
                      xmax: 694,
                      ymax: 851,
                      label: 'Total',
                      score: 1,
                      ocr_text: '7608',
                    },
                    {
                      xmin: 90,
                      ymin: 364,
                      xmax: 432,
                      ymax: 389,
                      label: 'Product_Name',
                      score: 1,
                      ocr_text:
                        'Flore omementale de Nouvelle-Caledonie. Horticulture, botanique et historie',
                    },
                    {
                      xmin: 448,
                      ymin: 362,
                      xmax: 468,
                      ymax: 389,
                      label: 'Quantity',
                      score: 1,
                      ocr_text: '1',
                    },
                    {
                      xmin: 657,
                      ymin: 364,
                      xmax: 700,
                      ymax: 389,
                      label: 'Product_Price',
                      ocr_text: '7 608',
                    },
                  ],
                },
              },
              demo_type: 'OCR',
              output_type: null,
            },
            {
              input:
                '/media/1587320288360_511e57f9-5bf5-4bc4-b06b-beea753acdc1.jpeg',
              output: {
                result: {
                  predictions: [
                    {
                      xmin: 1449,
                      ymin: 148,
                      xmax: 1581,
                      ymax: 214,
                      label: 'Invoice_ID',
                      score: 1,
                      ocr_text: '236925',
                    },
                    {
                      xmin: 1214,
                      ymin: 148,
                      xmax: 1375,
                      ymax: 205,
                      label: 'Invoice_Date',
                      score: 1,
                      ocr_text: '2/22/2017',
                    },
                    {
                      xmin: 1454,
                      ymin: 1974,
                      xmax: 1607,
                      ymax: 2039,
                      label: 'Total',
                      score: 1,
                      ocr_text: '1,999.10',
                    },
                    {
                      xmin: 131,
                      ymin: 471,
                      xmax: 480,
                      ymax: 546,
                      label: 'Customer_Address',
                      score: 1,
                      ocr_text: '13547 Work Place Suite A Mumbai MH 13245',
                    },
                    {
                      xmin: 122,
                      ymin: 428,
                      xmax: 397,
                      ymax: 471,
                      label: 'Customer_Name',
                      ocr_text: 'ABC COmpany INC',
                    },
                  ],
                },
              },
              demo_type: 'OCR',
              output_type: null,
            },
            {
              input:
                '/media/1587320293062_7c0f5824-f9b5-4e12-b1b1-cf0e7f95f31a.jpeg',
              output: {
                result: {
                  predictions: [
                    {
                      xmin: 1354,
                      ymin: 79,
                      xmax: 1547,
                      ymax: 127,
                      label: 'Invoice_ID',
                      score: 1,
                      ocr_text: '01816850',
                    },
                    {
                      xmin: 1460,
                      ymin: 1297,
                      xmax: 1614,
                      ymax: 1350,
                      label: 'Total',
                      score: 1,
                      ocr_text: '457.08',
                    },
                    {
                      xmin: 269,
                      ymin: 613,
                      xmax: 432,
                      ymax: 666,
                      label: 'Invoice_Date',
                      score: 1,
                      ocr_text: '02/27/17',
                    },
                    {
                      xmin: 88,
                      ymin: 450,
                      xmax: 375,
                      ymax: 489,
                      label: 'Customer_Name',
                      score: 1,
                      ocr_text: 'ABC Service Pvt Ltd',
                    },
                    {
                      xmin: 66,
                      ymin: 494,
                      xmax: 335,
                      ymax: 560,
                      label: 'Customer_Address',
                      ocr_text: 'PO Box 13247 Mahape MH 45781',
                    },
                  ],
                },
              },
              demo_type: 'OCR',
              output_type: ['json'],
            },
          ]}
          getStartedLink="https://app.nanonets.com/#/ocr/test/cc3330a2-acf6-4199-ba46-43a70a9ca337"
          upload={true}
          uploadUrl="https://www.mcgroce.com/hertzDrive-v1.0/api/upload"
        />
      </Container>

      <Spacer h={120} />

      {/* <style jsx="true">
        {`
          .bg-footer {
            background-color: #f800a4;
          }
          .footer-list-menu li a{
            color: #fff;
          }
          .copyright {
            color: #fff;
          }
          .footer-icons li a{
            color: #fff;
            border: 2px solid rgba(255, 255, 255, 0.5);
          }
        `}
      </style> */}
      <FooterLight />
    </React.Fragment>
  );
}
export default Cortext;
