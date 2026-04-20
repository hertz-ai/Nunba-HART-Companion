import React, {useEffect, useState} from 'react';
import Container from '@mui/material/Container';

import '../../css/header.css';
import './header.scss';
import Spacer from '../../components/Spacer';
import {SEND_EMAIL_URL} from '../../config/apiBase';
import PupitLogo from '../../images/PupitLogoBlack.png';
import {logger} from '../../utils/logger';

import {SnackbarContent} from '@mui/material';
import Snackbar from '@mui/material/Snackbar';
import {Modal, ModalHeader, ModalBody} from 'reactstrap';

const Header = ({fixed}) => {
  const [modal, toggleModal] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  logger.log(hamburgerOpen);

  const [open, setOpen] = React.useState(false);

  function handleClose(event, reason) {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
  }

  function sendUserInfo(event) {
    event.preventDefault();
    logger.log('Posting Email to hertz API...');
    const userName = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phoneNumber = document.getElementById('phoneNumber').value;
    const company = document.getElementById('company').value;
    const question = document.getElementById('comments').value;
    const userDetails = {
      userName: userName,
      email: email,
      phoneNumber: phoneNumber,
      company: company,
      question: question,
    };
    logger.log('Sending User details ->> ' + JSON.stringify(userDetails));
    fetch(SEND_EMAIL_URL, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userDetails),
    })
      .then((response) => response.json())
      .then((data) => {
        logger.log('Success:', data);
        toggleModal();
        //   handleClose();
        setOpen(true);
        // setSnackPack((prev) => [...prev, { 'Thanks for submission !', key: new Date().getTime() }]);
      })
      .catch((error) => {
        console.error('Error:', error);
      });
  }

  useEffect(() => {
    const dropdowns = document.querySelectorAll('.navbar-nav .dropdown');

    dropdowns.forEach((dropdown) => {
      dropdown.addEventListener('mouseenter', (event) => {
        if ('ontouchstart' in window || navigator.maxTouchPoints) return;
        dropdowns.forEach((dropdown) => {
          dropdown.classList.remove('open');
        });
        event.currentTarget.classList.add('open');
      });

      dropdown.addEventListener('mouseleave', (event) => {
        if ('ontouchstart' in window || navigator.maxTouchPoints) return;
        event.currentTarget.classList.remove('open');
      });

      dropdown.addEventListener('click', (event) => {
        event.stopPropagation();
        dropdowns.forEach((dropdown) => {
          if (dropdown !== event.currentTarget) {
            dropdown.classList.remove('open');
          }
        });
        event.currentTarget.classList.toggle('open');
      });
    });
    document.addEventListener('click', () => {
      dropdowns.forEach((dropdown) => {
        dropdown.classList.remove('open');
      });
    });

    document.addEventListener('scroll', () => {
      if (
        document.body.scrollTop > 80 ||
        document.documentElement.scrollTop > 80
      ) {
        if (document.getElementById('navbar') != null) {
          document.getElementById('navbar').style.padding = '0px 0px';
          document.getElementById('navbar').style.backgroundColor = '#ffffffdd';
        }
        // document.getElementById("navbar").style.backgroundColor="rgba(255,255,255,0.9)";
        // document.getElementById("logo").style.fontSize = "25px";
      } else {
        if (document.getElementById('navbar') != null) {
          document.getElementById('navbar').style.padding = '10px 5px';
          document.getElementById('navbar').style.backgroundColor =
            'rgba(255,255,255,0.7)';
        }
        // document.getElementById("navbar-header-id").style.setProperty("background-color", "#ffffff00", "important");
        // document.getElementById("navbar").style.setProperty("background-color", "#ffffff00", "important");
        // document.getElementsByTagName("header")[0].style.setProperty("background-color", "#ffffff00", "important");
        // document.getElementById("logo").style.fontSize = "35px";
      }
    });
  }, []);

  return (
    <header>
      <Modal isOpen={modal} toggle={toggleModal}>
        <ModalHeader toggle={toggleModal}>
          <h5 id="exampleModalLongTitle">Get in touch</h5>
        </ModalHeader>
        <ModalBody className="p-4">
          <div className="custom-form">
            <div id="message"></div>
            <form
              // method="post"
              // action="php/contact.php"
              name="contact-form"
              id="contact-form"
              onSubmit={sendUserInfo}
            >
              <div className="row">
                <div className="col-lg-12">
                  <div className="form-group mb-4">
                    <input
                      name="name"
                      id="name"
                      type="text"
                      className="form-control"
                      placeholder="Your Name..."
                    />
                  </div>
                  <div className="form-group mb-4">
                    <input
                      name="email"
                      id="email"
                      type="email"
                      className="form-control"
                      placeholder="Your Email..."
                    />
                  </div>
                  <div className="form-group mb-4">
                    <input
                      name="phoneNumber"
                      id="phoneNumber"
                      type="number"
                      className="form-control"
                      placeholder="Your Phone Number..."
                    />
                  </div>
                  <div className="form-group mb-4">
                    <input
                      name="company"
                      id="company"
                      type="text"
                      className="form-control"
                      placeholder="Your Company..."
                    />
                  </div>
                  <div className="form-group">
                    <textarea
                      name="comments"
                      id="comments"
                      rows="4"
                      className="form-control"
                      placeholder="Your Message..."
                    ></textarea>
                  </div>
                </div>
              </div>
              <div className="row mt-3">
                <div className="col-sm-12 text-right">
                  <input
                    type="submit"
                    id="submit"
                    name="send"
                    className="submitBnt btn btn-custom"
                    value="Send Message"
                  />
                  <div id="simple-msg"></div>
                </div>
              </div>
            </form>
          </div>
        </ModalBody>
      </Modal>

      {fixed && <Spacer h={67} />}
      <div />
      <div id="navbar" className={`navbar-wrapper ${fixed && 'navbar-fixed'}`}>
        <Container>
          <div className="navbar">
            <div className="navbar-header" id="navbar-header-id">
              <a className="navbar-brand" style={{margin: '0px'}} href="/#">
                {/* <img src="/media/logo2.png" className="logo" alt="" /> */}
                <img
                  src={PupitLogo}
                  alt="Pupit"
                  className="logo-dark"
                  height="14"
                />
              </a>
              <label htmlFor="navbar-nav-toggle" className="navbar-toggle">
                {hamburgerOpen ? (
                  <span onClick={() => setHamburgerOpen(false)}>X</span>
                ) : (
                  <span onClick={() => setHamburgerOpen(true)}>☰</span>
                )}
              </label>
            </div>
            <div className="navbar-nav-wrapper">
              <input type="checkbox" id="navbar-nav-toggle" />
              <ul className="nav navbar-nav">
                <li>
                  <a href="https://etime.hertzai.com/">Home</a>
                </li>

                <li className="dropdown">
                  <a>Products</a>
                  <ul className="dropdown-menu">
                    <li>
                      <a href="/products/recap">Hevolve</a>
                    </li>
                    <li>
                      <a href="/products/cortext">Cortext</a>
                    </li>
                    <li>
                      <a href="/products/consearch">Consearch</a>
                    </li>
                    <li>
                      <a href="/pupitDroid">Pupit</a>
                    </li>
                  </ul>
                </li>
                <li>
                  <a href="/DemoPage">Demo </a>
                </li>
                <li>
                  <a href="https://etime.hertzai.com/event">Events</a>
                </li>

                <li>
                  <a href="/blog">Blog</a>
                </li>
                <li>
                  <a href="/privacy">Privacy</a>
                </li>

                <li>
                  <a href="https://etime.hertzai.com/livechat">Live Support</a>
                </li>
                {/* <li><a onClick={toggleModal} href="#">Contact Us</a></li> */}
                <li>
                  <a href="/contactUs">Contact Us</a>
                </li>
                <li>
                  <a href="/Plan">Pricing</a>
                </li>
                <li>
                  <a href="https://etime.hertzai.com/web/login">Sign in</a>
                </li>

                {/* <li className="dropdown">
                  <a>Ready To Use Models</a>
                  <ul className="dropdown-menu">
                    <li><a target="_blank" rel="noopener noreferrer" href="https://app.nanonets.com/#/ocr/test/cc3330a2-acf6-4199-ba46-43a70a9ca337">Invoice OCR</a></li>
                    <li><a target="_blank" rel="noopener noreferrer" href="https://app.nanonets.com/#/ocr/test/b56b4782-fdd6-401c-9c91-c8be6b607d40">Passport OCR</a></li>
                    <li><a target="_blank" rel="noopener noreferrer" href="https://app.nanonets.com/#/ocr/test/0dcdfe5b-6336-47da-9186-8ff9868f6c53">Driver's License OCR</a></li>
                    <li><a target="_blank" rel="noopener noreferrer" href="https://app.nanonets.com/#/ic/test/353cea12-4dcc-47ee-b139-dd345157b17d">NSFW Classification</a></li>
                    <li><a target="_blank" rel="noopener noreferrer" href="https://app.nanonets.com/#/OD/test/6c6f8dc2-a7f4-4e1c-94a7-a75beea13cad">Fashion Apparel / Accessories Detection</a></li>
                    <li><a target="_blank" rel="noopener noreferrer" href="https://app.nanonets.com/#/OD/test/c4207fe4-3866-42b7-9b54-50f02730e10b">General Tagging</a></li>
                    <li><a target="_blank" rel="noopener noreferrer" href="https://app.nanonets.com/#/OD/test/4e8d57da-9f06-48fd-bd0a-3d798ab87ccc">Furniture Detection</a></li>
                    <li><a target="_blank" rel="noopener noreferrer" href="https://app.nanonets.com/#/od/test/5b7b2ad1-43f9-47f9-9f27-eb4aedd78663">Face Detection</a></li>
                    <li><a target="_blank" rel="noopener noreferrer" href="https://app.nanonets.com/#/OD/test/2cfab12f-b14c-4220-be31-35a41c57c505">Pedestrian Detection in Aerial Images</a></li>
                  </ul>
                </li> */}

                {/* <li><a href="/#case-studies">Case studies</a></li> */}

                {/* <li><a href="/pricing">Pricing</a></li>

                <li className="dropdown">
                  <a>Resources</a>
                  <ul className="dropdown-menu">
                    <li><a href="https://nanonets.com/blog">Blog</a></li>
                    <li><a href="https://nanonets.com/documentation">Documentation</a></li>
                    <li><a href="https://nanonets.github.io/tutorials-page">Tutorials</a></li>
                    <li><a href="https://nanonets.com/help">Help</a></li>
                  </ul>
                </li> */}

                {/* <li><a id="signup" href="https://app.nanonets.com"><button type="button" className="navbar-btn">Start Building</button></a></li> */}
              </ul>

              <Snackbar
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'center',
                }}
                open={open}
                autoHideDuration={2000}
                onClose={handleClose}
              >
                <SnackbarContent
                  contentprops={{
                    'aria-describedby': 'message-id',
                  }}
                  // prettier-ignore
                  message={(
                    `Thanks for submission, we will get back to you !`
                    )}
                />
              </Snackbar>
            </div>
          </div>
        </Container>
      </div>
    </header>
  );
};

export default Header;
