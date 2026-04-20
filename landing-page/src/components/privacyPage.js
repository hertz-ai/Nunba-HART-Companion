import Footer from '../pages/Layouts/footer';
import HeaderNano from '../pages/Layouts/header';
import HeaderMulti from '../pages/Layouts/header-multi';
import AboutUs from '../pages/SubPages/Multipurpose/about-us';
import Client from '../pages/SubPages/Multipurpose/client';
import Contact from '../pages/SubPages/Multipurpose/contact';
import Cta from '../pages/SubPages/Multipurpose/cta';
import DiscoverPotential from '../pages/SubPages/Multipurpose/discoverPotential';
import Features from '../pages/SubPages/Multipurpose/features';
import Security from '../pages/SubPages/Multipurpose/Security';
import Services from '../pages/SubPages/Multipurpose/services';
import Team from '../pages/SubPages/Multipurpose/team';
import Testimonial from '../pages/SubPages/Multipurpose/testimonial';

import React, {Component} from 'react';
import ModalVideo from 'react-modal-video';
import {Link} from 'react-router-dom';
import {ScrollTo} from 'react-scroll-to';
import styled from 'styled-components';
// Layouts

// Shared
// import DemoVideo from '../pages/SubPages/Multipurpose/demoVideo';

// Modal Video
import '../../node_modules/react-modal-video/scss/modal-video.scss';
import '../css/pe-icon-7.css';
import '../css/style.css';
import '../css/style.css.map';
import '../_helper.scss';
// import '../css/bootstrap.min.css';
// import '../css/materialdesignicons.min.css';
// import M from 'materialize-css';
import {stackOffsetNone} from 'd3';

import DemoVideo from './demoVideo';
import HevolveDemo from './hevolveDemo';

import Typography from '@mui/material/Typography';

import Spacer from './Spacer';

import MetaTags from 'react-meta-tags';

class PrivacyPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isOpen: false,
    };
  }

  componentDidMount() {
    document.body.classList = '';
    // window.addEventListener('scroll', this.scrollNavigation, true);
  }

  render() {
    const body = this.showPage();

    return (
      <React.Fragment>
        <MetaTags>
          <title>Hertzai: Privacy Policy</title>
          <meta
            id="meta-description"
            name="description"
            content="Hevolve is an AI-enabled app which acts as a personal assistant for students.Hevolve offers real-time doubt solving and feedback to improve understanding."
          />
          <meta
            id="og-title"
            property="og:title"
            content="Hertzai: Privacy Policy"
          />
          <meta id="og-image" property="og:image" content="/logo-light.png" />
        </MetaTags>

        <style jsx="true">
          {`
            .navbar-nav a:hover {
              color: #13ce67;
            }
          `}
        </style>
        <HeaderNano fixed={true} />

        <section
          className="bg-home"
          style={{'background-image': 'none'}}
          id="home"
        >
          {/* <section className="bg-home" id="home"> */}
          <div className="home-center">
            <div className="home-desc-center">
              <div className="container">
                <div className="row">
                  <div className="col-lg-6 order-1">
                    <div
                      className="home-title text-white fadeInUp"
                      style={{'animation-fill-mode': 'none'}}
                    >
                      {/* <h1><i className="pe-7s-rocket"></i></h1>                                             */}
                      <h1
                        className="mb-3"
                        style={{animationDelay: '0.8s', color: '#fff'}}
                      >
                        Learn the right way
                      </h1>
                      <p className="mt-4" style={{animationDelay: '0.8s'}}>
                        Having a learning difficulty does not make someone less
                        intelligent, it just means they do not have resources to
                        clarify their doubts and create a deeper understanding
                        in this fast paced world.
                      </p>

                      {/* <DemoVideo videoId={'NVXYuHa7MLc'} learnMore={"none"}/> */}
                      {/* <DemoVideo videoId={'NVXYuHa7MLc'} /> */}
                      <DemoVideo
                        videoId={'eai31EKp98g'}
                        buttonColor={'#ffffff'}
                        style={{animationDelay: '.3s'}}
                      />
                      {/* <div style={{animationDelay: '.3s'}}>
                      </div> */}
                    </div>
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
            </div>
          </div>
        </section>
        {body}
        {/* <DemoVideo/> */}
        <DiscoverPotential />
        <Spacer h={120} />
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

        <Spacer h={120} />

        <Footer />
      </React.Fragment>
    );
  }
}

export default PrivacyPage;
