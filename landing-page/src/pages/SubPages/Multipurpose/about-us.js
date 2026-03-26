import {withStyles} from '@mui/material/styles';
import React, {Component} from 'react';

const useStyles = (theme) => ({
  aboutUsIcons: {
    // color:'#fa71cd',
    color: '#13ce67',
    fontSize: 24,
  },
  heading: {
    color: '#28315E',
    fontSize: 24,
  },
});

class AboutUs extends Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    const {classes} = this.props;
    return (
      <React.Fragment>
        <section className="section" id="about">
          <div className="container">
            <div className="row justify-content-center">
              <div className="col-lg-8">
                <div className="about-content text-center">
                  <h4 className="mx-auto mb-3">
                    YOUR COMPANY CAN AUTOMATE INVOICE DATA CAPTURE TODAY
                  </h4>
                  {/* <p className="text-muted">The European languages are members of the same family. Their separate existence is a myth. For science, music, sport, etc, Europe uses the same vocabulary.</p> */}
                </div>
              </div>
            </div>
            <div className="row mt-4">
              <div className="col-lg-4">
                <div className="about-box text-center p-4">
                  <div className="about-icon mb-3">
                    {/* <i className="pe-7s-copy-file text-custom h1"></i> */}
                    <i
                      className={`fa fa-file-text ${classes.aboutUsIcons}`}
                      aria-hidden="true"
                    ></i>
                  </div>
                  <div className="about-desc">
                    <h5 className="mb-3 f-18">Versatile precision</h5>
                    <p className="text-muted">
                      Up to 98% accurate data capture from any invoice layout,
                      with no template and rule setup.
                    </p>
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="about-box text-center p-4">
                  <div className="about-icon mb-3">
                    {/* <i className="pe-7s-share text-custom h1"></i> */}
                    <i
                      className={`fa fa-cubes ${classes.aboutUsIcons}`}
                      aria-hidden="true"
                    ></i>
                  </div>
                  <div className="about-desc">
                    <h5 className="mb-3 f-18">Fast deployment</h5>
                    <p className="text-muted">
                      Deploy HertzAI into your invoice data capture process and
                      business operations in a few days.
                    </p>
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="about-box text-center p-4">
                  <div className="about-icon mb-3">
                    {/* <i className="pe-7s-monitor text-custom h1"></i> */}
                    {/* <i className="fa fa-level-up" style={{fontSize : '32px', color:'#13ce67'}} aria-hidden="true"></i> */}
                    <i
                      className={`fa fa-level-up ${classes.aboutUsIcons}`}
                      aria-hidden="true"
                    ></i>
                  </div>
                  <div className="about-desc">
                    <h5 className="mb-3 f-18">Continuous improvement</h5>
                    <p className="text-muted">
                      HertzAI automatically learns from each invoice it
                      processes, getting smarter with use.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="row mt-4">
              <div className="col-lg-4">
                <div className="about-box text-center p-4">
                  <div className="about-icon mb-3">
                    {/* <i className="pe-7s-monitor text-custom h1"></i> */}
                    {/* <i className="fa fa-magic" style={{fontSize : '32px', color:'#13ce67'}} aria-hidden="true"></i> */}
                    <i
                      className={`fa fa-magic ${classes.aboutUsIcons}`}
                      aria-hidden="true"
                    ></i>
                  </div>
                  <div className="about-desc">
                    <h5 className="mb-3 f-18">Effort reduction</h5>
                    <p className="text-muted">
                      HertzAI captures data 8 times faster than manual data
                      entry for a 97% reduction in keystrokes.
                    </p>
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="about-box text-center p-4">
                  <div className="about-icon mb-3">
                    {/* <i className="pe-7s-monitor text-custom h1"></i> */}
                    {/* <i className="fa fa-rss" style={{fontSize : '32px', color:'#13ce67'}} aria-hidden="true"></i> */}
                    <i
                      className={`fa fa-rss ${classes.aboutUsIcons}`}
                      aria-hidden="true"
                    ></i>
                  </div>
                  <div className="about-desc">
                    <h5 className="mb-3 f-18">Extensibility</h5>
                    <p className="text-muted">
                      Integrate HertzAI via email, RPA, or API; it's fully
                      adaptable to your business environment.
                    </p>
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="about-box text-center p-4">
                  <div className="about-icon mb-3">
                    {/* <i className="pe-7s-monitor text-custom h1"></i> */}
                    {/* <i className="fa fa-building-o" style={{fontSize : '32px', color:'#13ce67'}} aria-hidden="true"></i> */}
                    <i
                      className={`fa fa-building-o ${classes.aboutUsIcons}`}
                      aria-hidden="true"
                    ></i>
                  </div>
                  <div className="about-desc">
                    <h5 className="mb-3 f-18">Enterprise grade</h5>
                    <p className="text-muted">
                      HertzAI is cloud-based, ensuring high scalability and
                      best-in-class security and data management.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </React.Fragment>
    );
  }
}

export default withStyles(useStyles)(AboutUs);
