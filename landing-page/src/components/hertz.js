import KnnResults from './knnresults';

import {createApiClient} from '../services/axiosFactory';
import {logger} from '../utils/logger';

import React, {useState, useEffect} from 'react';
import ContentLoader from 'react-content-loader';
import * as Icon from 'react-feather';
import {useMeasure} from 'react-use';

const geocodeApi = createApiClient('https://api.bigdatacloud.net', {
  handle401: false,
});
//  import EssentialsLoader from './essentials'

function HertzLoader() {
  const [svgElement, {width}] = useMeasure();

  useEffect(() => {}, [width]);

  return (
    <React.Fragment>
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

const Hertz = (props) => {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [currentAddress, setCurrentAddress] = useState(null);
  const [currentState, setCurrentState] = useState(null);

  const getLocation = () => {
    navigator.geolocation.getCurrentPosition((position) => {
      setCurrentLocation([position.coords.latitude, position.coords.longitude]);
      getCurrentAddress(position.coords.latitude, position.coords.longitude);
    });
  };

  const getContactForm = () => {
    logger.log('Entered method getContactForm() ');
    alert('clicked contactUs form');
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

  return (
    <div className="Hertz">
      <div className="header fadeInUp" style={{animationDelay: '0.3s'}}>
        <iframe
          width="720"
          height="345"
          src="https://www.youtube.com/embed/tgbNymZ7vqY"
        ></iframe>

        <div>
          <button
            className="button fadeInUp"
            style={{animationDelay: '0.6s'}}
            onClick={() => getContactForm()}
          >
            Contact Us
          </button>
          <br />
          <button
            className="button fadeInUp"
            style={{animationDelay: '0.6s'}}
            onClick={() => getLocation()}
          >
            Subscribe
          </button>
        </div>
      </div>

      <div className="header fadeInUp" style={{animationDelay: '0.6s'}}>
        <div>
          <h1>Cortext</h1>
          <h2 className="answer">
            One stop solution For All Your Text Recognition Needs Powered By
            State Of The Art Language Models .
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
        </React.Fragment>
      )}

      {currentLocation && !currentAddress && <HertzLoader />}

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
export default Hertz;
