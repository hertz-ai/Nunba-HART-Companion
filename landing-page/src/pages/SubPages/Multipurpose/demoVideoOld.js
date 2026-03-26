import {logger} from '../../../utils/logger';

import React, {Component} from 'react';

class DemoVideoOld extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isOpen: false,
    };
    this.openModal = this.openModal.bind(this);
  }
  openModal() {
    this.setState({isOpen: true});
  }

  componentDidMount() {
    logger.log('demo video component mounted!!');
    document.getElementById('videoBg').play();
    // if (window.performance) {performance.clearMarks("firstMeaningfulPaint");performance.mark("firstMeaningfulPaint");}
  }

  render() {
    return (
      <React.Fragment>
        <section className="section" id="about">
          <div className="container" style={{fontSize: '16px'}}>
            <div
              className="section__copy"
              style={{
                'font-family':
                  '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"',
              }}
            >
              <h3
                style={{
                  textAlign: 'center',
                  fontSize: '2.5rem',
                  fontWeight: 'lighter',
                }}
              >
                Ready to help, <br /> whatever you ask.
              </h3>
              <p style={{textAlign: 'center', width: '100%'}}>
                Hevolve knew what you studied, your understandings, areas of
                improvements. Your one Hevolve can smartly pull out relevant
                information for all your queries
              </p>
            </div>

            <div>
              <div
                className="bg-video undefined"
                style={{position: 'relative', width: '100%', height: 'auto'}}
              >
                <video id="videoBg" autoPlay loop muted>
                  <source src="//videos.ctfassets.net/2y9b3o528xhq/QeyKsisb75P3H4UpRHarg/f7ced8c53e7807a371ff28411253088c/GPMND_C2_Hero_loop_v2.mp4"></source>
                </video>
              </div>
              <div className="overlayText">
                <p id="topText">
                  Ready to help, <br />
                  whatever you ask.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* <section id="sec22">
            <div className="contentful-hero-section">
            <div className="contentful-hero contain">
                <div className="flag flag--white">
                    <h6 className="purple">NEW!</h6>
                </div>
                <div className="hero-bg" style="background-image: url(&quot;//www.udacity.com/www-proxy/contentful/assets/2y9b3o528xhq/48s5ydBPYT9MhNcz5v4MnT/7192e7ee1735fe33fbd4633dbc00053f/ndHero-course2__2_.jpg&quot;);">
                    <div className="bg-video undefined">
                        <video id="videoBg" autoplay="" loop="">
                        <source src="//videos.ctfassets.net/2y9b3o528xhq/QeyKsisb75P3H4UpRHarg/f7ced8c53e7807a371ff28411253088c/GPMND_C2_Hero_loop_v2.mp4"></source>
                        </video>
                    </div>
                    <div className="overlay">
                        <div className="content">
                        <div className="content__header">
                            <h6>COURSE TWO OF THREE</h6>
                            <h1>Activation and Retention Strategy</h1>
                            <div className="legible center hidden-xs-down">Guide users through the activation funnel as fast as possible, so they reach your product’s aha-moment. Deploy experiments to improve customer lifetime value and decrease churn rate. </div>
                        </div>
                        <div className="btn_wrapper">
                            <div className="cta-request-syllabus">
                                <button className="button btn button--white hide-on-mobile">Download Syllabus</button>
                                <div className="simple-modal"></div>
                            </div>
                            <div>
                                <button className="button btn button--blue ">Notify Me</button>
                                <div className="simple-modal"></div>
                            </div>
                        </div>
                        </div>
                    </div>
                </div>
            </div>
            </div>
    </section> */}
      </React.Fragment>
    );
  }
}

export default DemoVideoOld;
