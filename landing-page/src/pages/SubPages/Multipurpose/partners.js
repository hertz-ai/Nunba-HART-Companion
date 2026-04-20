import {logger} from '../../../utils/logger';

import Grid from '@mui/material/Grid';
import React, {Component} from 'react';
import MetaTags from 'react-meta-tags';
import {Link} from 'react-router-dom';
import {ScrollTo} from 'react-scroll-to';


class Partners extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isOpen: false,
    };
    this.openModal = this.openModal.bind(this);
    this.routeToContactUs = this.routeToContactUs.bind(this);
  }
  routeToContactUs() {
    // document.querySelector("#mySidenav > li:nth-child(8) > a").click();
    document
      .querySelector(
        '#root > div > header > div.navbar-wrapper.navbar-fixed > div > div > div.navbar-nav-wrapper > ul > li:nth-child(10) > a'
      )
      .click();
  }
  openModal() {
    logger.log('Entered method - openModal()');
    const videoPart = document.getElementById('videoPart');
    videoPart.style.animationFillMode = 'none';
    this.setState({isOpen: true});
  }

  componentDidMount() {
    // window.addEventListener('scroll', this.scrollNavigation, true);
  }

  // function ShowPage = ({activePage}) =>
  // <h1>{activePage}</h1>;

  scrollNavigation = () => {
    const doc = document.documentElement;
    const top = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0);
    if (top > 80) {
      document.getElementById('nav-bar').classList.add('nav-sticky');
      logger.log('>80');
      document.getElementById('dropdownId').className = 'dropdownsticky-drop';
      // now add class for sticky
      // document.getElementsByClassName('dropdownsticky-drop')[0].className = "dropdown";
    } else {
      document.getElementById('nav-bar').classList.remove('nav-sticky');
      logger.log('<=80');

      // now remove class for sticky
      document.getElementById('dropdownId').className = 'dropdown';
      // document.getElementsByClassName('dropdown')[0].className += "sticky-drop";
      // document.getElementsByClassName('dropdown')[0].className = document.getElementsByClassName('dropdown')[0].className + "sticky-drop";
    }
  };

  render() {
    // Create a Title component that'll render an <h1> tag with some styles
    // const Title = styled.h1`
    // font-size: 56px;
    // font-weight: lighter;
    // margin: 20px 0;
    // text-align: center;
    // font-familiy: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji !important";
    // `;

    return (
      <React.Fragment>
        <div
          style={{
            overflow: 'hidden',
            backgroundColor: 'white',
            marginTop: '30px',
          }}
        >
          <section className="bg-home-top" id="home">
            {/* <section className="bg-home" id="home"> */}
            <div className="home-center">
              <div className="home-desc-center">
                <div className="container">
                  <div className="row">
                    <div className="col-lg-5 order-1">
                      <div className="home-title text-white fadeInUp">
                        <h1
                          className="mb-3"
                          style={{
                            animationDelay: '0.8s',
                          }}
                        >
                          We Work With the Best PARTNERS{' '}
                          <span className="part"></span>
                        </h1>

                        <p
                          className="mt-4"
                          style={{
                            animationDelay: '0.8s',
                            cursor: 'context-menu',
                          }}
                        >
                          to make your learning seamless we have partnered with
                          the top companies
                        </p>

                        {/* <DemoVideo videoId={'NVXYuHa7MLc'} learnMore={"none"}/> */}
                        {/* <DemoVideo videoId={'NVXYuHa7MLc'} /> */}

                        {/* <div style={{animationDelay: '.3s'}}>
                      </div> */}
                      </div>
                    </div>
                    <div className="col-lg-2 order-1"></div>
                    <div className="col-lg-5 order-1">
                      <div
                        className="home-title text-white fadeInUp"
                        style={{animationFillMode: 'none'}}
                      >
                        <Grid container spacing={2}>
                          <Grid item xs={12}>
                            <img
                              src="/MS_Startups_Celebration_Badge_Dark.png"
                              height={120} alt="" ></img>
                          </Grid>

                          <Grid item xs={12}>
                            <img src="/nvidia inception.png" height={150} alt="" ></img>
                          </Grid>
                        </Grid>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </React.Fragment>
    );
  }
}

export default Partners;
