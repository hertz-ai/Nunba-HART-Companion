/* eslint-disable */
import React, {useEffect, useState, Component} from 'react';
import {Link} from 'react-router-dom';
import Container from '@mui/material/Container';
import ModalVideo from 'react-modal-video';
import {Modal, ModalHeader, ModalBody} from 'reactstrap';
import Snackbar from '@mui/material/Snackbar';
import {SnackbarContent} from '@mui/material';
import '../css/font-awesome.min.css';

// get our fontawesome imports
import {faPlay} from '@fortawesome/free-solid-svg-icons';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {withRouter} from 'react-router';
import {logger} from '../utils/logger';

//color button styles - starts
import {purple} from '@mui/material/colors';
import Button from '@mui/material/Button';
//color button styles - ends
import {withStyles} from '@mui/material/styles';

const ColorButton = withStyles((theme) => ({
  root: {
    color: theme.palette.getContrastText(purple[500]),
    // color: "linear-gradient(to right, #00e89d, #0078ff)",
    background: 'linear-gradient(to right, #00e89d, #0078ff)',
    // backgroundColor: purple[500],
    '&:hover': {
      backgroundColor: purple[700],
    },
  },
}))(Button);

class DemoVideo extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isOpen: false,
      thumbnail: '',
    };
    this.openModal = this.openModal.bind(this);
    this.routeToContactUs = this.routeToContactUs.bind(this);
    this.scrollToRegister = props.scrollToRegister;
  }

  componentDidMount() {
    if (this.props.component == 'hevolve') {
      logger.log('The thumbnail fixed is -> ', this.props.component);
      this.setState({thumbnail: '/logo_anim_original.gif'});
      logger.log('thumnail ->> ' + this.state.thumbnail);
    } else if (this.props.component == 'cortext') {
      this.setState({thumbnail: '/pub_invc_3.jpg'});
    } else if (this.props.component == 'consearch') {
      this.setState({thumbnail: '/pub_invc_2.jpg'});
    }
  }

  routeToContactUs() {
    this.scrollToRegister();
  }

  openModal() {
    logger.log('Entered method - openModal()');
    const videoPart = document.getElementById('videoPart');
    videoPart.style.animationFillMode = 'none';
    this.setState({isOpen: true});
  }

  render() {
    function getYouTubeVideoId(url) {
      const match = url.match(/[?&]v=([^&]+)/);
      return match && match[1];
    }
    const redirectToPlayStore = () => {
      window.location.href =
        'https://play.google.com/store/apps/details?id=com.hertzai.hevolve&hl=en&gl=US&pcampaignid=pcampaignidMKT-Other-global-all-co-prtnr-py-PartBadge-Mar2515-1';
    };

    // Example usage:
    const youtubeUrl = 'https://www.youtube.com/watch?v=FYKHEHG02fk';
    const videoId = getYouTubeVideoId(youtubeUrl);
    return (
      <React.Fragment>
        <style jsx="true">
          {`
            .mt-5,
            .my-5 {
              margin-top: 0 !important;
            }
            .fa-lg {
              font-size: 2em !important;
            }
          `}
        </style>
        <div className="watch-video mt-5" id="videoPart">
          <Link
            to="#"
            onClick={this.openModal}
            // onClick={this.routeToContactUs}
            className="video-play-icon text-white"
            style={{animationDelay: '4s'}}
          >
            {/* <img className="video-thumb" width="140" height="100"
            src="//img.youtube.com/vi/myk22AuwizE/0.jpg" alt="" >
            </img> */}
            {/* <FontAwesomeIcon icon={faPlay} color={this.props.buttonColor} size="lg"/> */}

            <div className="video-thumbnail">
              <img
                //src="https://img.youtube.com/vi/IzHpdcMNRGY/1.jpg"
                //src="http://i3.ytimg.com/vi/IzHpdcMNRGY/maxresdefault.jpg"
                //src="https://i9.ytimg.com/vi/IzHpdcMNRGY/mq3.jpg?sqp=CLjA0_0F&rs=AOn4CLDEzQi63J2taH2M8ThXUom1zxg4pg"
                src={this.state.thumbnail}
                width="146"
                height="202"
                alt="Video thumbnail"
              />
            </div>

            {/* <i className="mdi mdi-play play-icon-circle mr-2"></i> */}
            {/* <i className="fa-play"></i> */}
            {/* <FontAwesomeIcon icon={faPlay} color="#0078ff" size="lg"/> */}
            {/* <span style={{color: '#28315E'}}>Watch Video!</span> */}
          </Link>
          <ModalVideo
            channel="youtube"
            youtube={{
              autoplay: 1,
              mute: 1,
            }}
            isOpen={this.state.isOpen}
            videoId={videoId}
            onClose={() => this.setState({isOpen: false})}
          />
        </div>
        <br />

        {/* <Link
            className="btn btn-custom mr-4"
            onClick={this.routeToContactUs}
            style={{display: this.props.learnMore}}
          >
            Register for BETA
          </Link> */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            width: '160px',
          }}
        >
          <a
            href="
https://play.google.com/store/apps/details?id=com.hertzai.hevolve&hl=en&gl=US&pcampaignid=pcampaignidMKT-Other-global-all-co-prtnr-py-PartBadge-Mar2515-1"
          >
            <img
              alt="Get it on Google Play"
              src="
https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
              style={{width: '202px', height: '80px'}}
            />
          </a>
          <ColorButton
            variant="contained"
            color="primary"
            onClick={this.routeToContactUs}
            style={{
              marginLeft: '8px',
              padding: '4px 18px',
            }}
          >
            Register Now
          </ColorButton>
        </div>
      </React.Fragment>
    );
  }
}

export default withRouter(DemoVideo);
