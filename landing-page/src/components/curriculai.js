import KnnResults from './knnresults';

import { createApiClient } from '../services/axiosFactory';
import { logger } from '../utils/logger';

import React, {useState, useEffect} from 'react';
import ContentLoader from 'react-content-loader';
import * as Icon from 'react-feather';
import {useMeasure} from 'react-use';
import Rellax from 'rellax';

// import './parallax.scss';
import '../App.scss';
// import {Parallax} from 'react-scroll-parallax';
//  import EssentialsLoader from './essentials'
import './progressStyles.css';
// import './progress.js'
import HeaderMulti from '../pages/Layouts/header-multi';

import Parallax from './parallaxCodepen';

import Footer from '../pages/Layouts/footer';

const geocodeApi = createApiClient('https://api.bigdatacloud.net', { handle401: false });

function ConsearchLoader() {
  const [svgElement, {width}] = useMeasure();

  useEffect(() => {}, [width]);

  return (
    <React.Fragment>
      <div>
        <Parallax speed="1.6">
          <div className="box"></div>
        </Parallax>
        <Parallax speed="1.2">
          <div className="red"></div>
        </Parallax>
      </div>

      <HeaderMulti
        url={'http://localhost:3000/static/media/bg-heart-0-1.41130f9f.jpg'}
      />
      <span ref={svgElement} style={{width: '100%'}} />
      {width && (
        <ContentLoader
          speed={1.5}
          width={width}
          height={325}
          viewBox={`0 0 ${width} 325`}
          position="absolute"
          className="fadeInUp"
        >
          <rect
            x={width / 2 - 60}
            y="10"
            rx="5"
            ry="5"
            width="120"
            height="32"
          />
          <rect
            x={width / 2 + 70}
            y="18"
            rx="100"
            ry="100"
            width="15"
            height="15"
          />
          <rect x="10" y="80" rx="5" ry="5" width="85" height="32" />
          <rect x="100" y="80" rx="5" ry="5" width="65" height="32" />
          <rect x="10" y="130" rx="5" ry="5" width={width - 20} height="172" />
        </ContentLoader>
      )}
    </React.Fragment>
  );
}

const Curriculai = (props) => {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [currentAddress, setCurrentAddress] = useState(null);
  const [currentState, setCurrentState] = useState(null);

  const getLocation = () => {
    navigator.geolocation.getCurrentPosition((position) => {
      setCurrentLocation([position.coords.latitude, position.coords.longitude]);
      getCurrentAddress(position.coords.latitude, position.coords.longitude);
    });
  };

  const getCurrentAddress = (lat, lng) => {
    try {
      geocodeApi
        .get(
          '/data/reverse-geocode-client?latitude=' +
            lat +
            '&longitude=' +
            lng +
            '&localityLanguage=en'
        )
        .then((response) => {
          setCurrentAddress(response.locality);
          setCurrentState(response.principalSubdivision);
        });
    } catch (err) {
      logger.log(err);
      setCurrentAddress('Error fetching name of your location');
      setCurrentState(null);
    }
  };

  class Parallax extends React.Component {
    componentDidMount() {
      // window.addEventListener('scroll', this.scrollLoop, false)
      requestAnimationFrame(this.scrollLoop);
      // document.getElementById('logoDark').style.display='none';
    }
    componentWillUnmount() {
      // window.removeEventListener('scroll', this.scrollLoop, false)
    }
    setPosition = (yPos) => {
      // this.dom.style.transform = "translate3d(0, " + yPos + "px, 0)";
      // this.dom.style.top = yPos + "px";
    };
    scrollLoop = () => {
      this.setPosition(window.scrollY * this.props.speed);
      requestAnimationFrame(this.scrollLoop);
    };
    render() {
      return <div ref={(dom) => (this.dom = dom)}>{this.props.children}</div>;
    }
  }

  const rellax = new Rellax('.rellax');
  const ParallaxImage = () => (
    <Parallax className="custom-class" y={[-0, 20]} tagOuter="figure">
      <img src="/essentials_1.svg" className="crowd-bg rellax" />
    </Parallax>
  );

  return (
    <div>
      {/* <div className="box"></div> */}
      <img src="/essentials_2.svg" className="crowd rellax" />
      <section className="sec1">
        {/* <img src="http://orig08.deviantart.net/5704/f/2014/053/6/5/free_space_galaxy_texture_by_lyshastra-d77gh18.jpg" className="crowd rellax" /> */}
        {/* <br/>
          <br/>
          <br/>
          <br/>
          <br/> */}
        <h3 className="header fadeInUp" style={{animationDelay: '0.4s'}}>
          Think of AI?
        </h3>
        <h1 className="header fadeInUp" style={{animationDelay: '0.6s'}}>
          <b>ONE SUITE - ONE CONSENSUS</b>
        </h1>
        <p className="fadeInUp" style={{animationDelay: '0.8s', width: '40%'}}>
          Own Your AI & Tailored to your needs, Secure in-house deployment. Your
          AI is constantly learning and always evolving..
        </p>
        <button className="fadeInUp" style={{animationDelay: '0.8s'}}>
          Check Now >
        </button>

        <div
          className="progress-circle"
          data-color="#379cf4"
          data-thickness="6"
          data-progress="60"
          data-size="185"
          data-linecap="round"
        >
          <div className="content">
            <h4>Progress</h4>
            <p>Lorem ipsum dolerum</p>
            <div
              className="counter"
              data-to="60"
              data-speed="2000"
              data-unit="%"
            >
              60%
            </div>
          </div>
        </div>
      </section>
      <Parallax speed="-2.9">
        <img src="/guitar.png" className="guitar rellax" />
      </Parallax>

      <img src="/guitar.png" className="guitar rellax" data-rellax-speed="10" />
      <ParallaxImage />
      <img src="/essentials_2.svg" className="crowd rellax" />

      <section className="sec2">
        <center>
          <h1>
            Welcome! to <span>HertzAI</span>
          </h1>
          <h2>
            One AI To Meet All Your Recognition Needs. <br />
            Knowledge To Intent/Action Platform With Privacy
          </h2>
          <br />
          <a href="#">Know More</a>
          <a href="#">Contact Now</a>
        </center>
        <div
          className="feature-box fbox-small fbox-plain fadeIn animated"
          data-animate="fadeIn"
        >
          <div className="fbox-icon">
            <a href="#">
              <i className="icon-phone2"></i>
            </a>
          </div>
          <h3>Performance</h3>
          <p>The Power Of AI To Save You Time.</p>
        </div>
      </section>
      <section className="sec3">
        <Parallax speed="-.1">
          {/* <div className="red"></div> */}
          <img src="/guitar.png" className="guitar rellax" />
        </Parallax>
      </section>

      <div className="header fadeInUp" style={{animationDelay: '0.3s'}}>
        <div>
          <h1>Hevolve</h1>
          <h2 className="answer">
            Custom curriculum for every institution to provide world-class
            in-demand work degrees
          </h2>
        </div>
      </div>

      {!currentLocation && (
        <React.Fragment>
          <button
            className="button fadeInUp"
            style={{animationDelay: '0.6s'}}
            onClick={() => getLocation()}
          >
            View essentials nearby offering special assistance
          </button>
          <div className="alert fadeInUp" style={{animationDelay: '0.7s'}}>
            <Icon.AlertOctagon size={16} />
            <div className="alert-right is-full">
              {`We do not collect any location data; they're all stored 
              inside your browser and are inaccessible to us.`}
            </div>
          </div>
          <div className="alert fadeInUp" style={{animationDelay: '0.8s'}}>
            <Icon.AlertOctagon size={16} />
            <div className="alert-right is-full">
              {`We are a community sourced listing platform and are not associated
              with any of the organizations listed below. Although we verify all
              our listings, we request you to follow all the guidelines and take
              the necessary precautions. We encourage you to report any error or
              suspicious activity so that we can take immediate action.`}
            </div>
          </div>

          <div>
            <Parallax speed="0.6">
              <div className="box"></div>
            </Parallax>
            <Parallax speed="-2.2">
              <div className="red"></div>
            </Parallax>
          </div>

          <Footer />
        </React.Fragment>
      )}

      {currentLocation && !currentAddress && <ConsearchLoader />}

      {currentAddress && (
        <div className="address fadeInUp">
          <h3>{currentAddress + ', ' + currentState}</h3>

          <Icon.XCircle
            size={16}
            onClick={() => {
              setCurrentLocation(null);
              setCurrentAddress(null);
              setCurrentState(null);
            }}
          />
        </div>
      )}

      <div className="Search">
        {currentAddress && (
          <KnnResults userLocation={currentLocation} userState={currentState} />
        )}
      </div>
    </div>
  );
};
export default Curriculai;
