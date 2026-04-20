import ScrollspyNav from './Scrollspy';

import logo_dark from '../../images/logo-dark.png';
import logo_light from '../../images/logo-light.png';
import {logger} from '../../utils/logger';

import Snackbar from '@mui/material/Snackbar';
import {withStyles} from '@mui/material/styles';
import React, {Component} from 'react';
import {Link} from 'react-router-dom';
import {Modal, ModalHeader, ModalBody} from 'reactstrap';

import '../../css/materialdesignicons.min.css';
import '../../utils/responsiveSubMenu.js';
import {SEND_EMAIL_URL} from '../../config/apiBase';



const styles = {
  root: {
    backgroundColor: '#13ce67',
  },
};

class HeaderMulti extends Component {
  constructor(props) {
    super(props);
    this.state = {
      Tab: '',
      isOpen: false,
      modal: false,
      isOpenMenu: false,
      vertical: 'bottom',
      horizantal: 'center',
      open: false,
    };

    this.toggleMenu = this.toggleMenu.bind(this);
    this.toggleModal = this.toggleModal.bind(this);
    this.toggleHeader = this.toggleHeader.bind(this);
    this.sendUserInfo = this.sendUserInfo.bind(this);
    this.handleClose = this.handleClose.bind(this);
  }

  toggleHeader = () => {
    this.setState({isOpenMenu: !this.state.isOpenMenu});
  };

  expandSubMenu() {
    logger.log('entered method expand expandSubmenu()');
    document.getElementById('dropdown-content2').style.display = 'block';
  }
  collapseSubMenu() {
    logger.log('entered method expand collapseSubmenu()');
    document.getElementById('dropdown-content2').style.display = 'none';
  }

  toggleModal() {
    this.setState((prevState) => ({
      modal: !prevState.modal,
    }));
  }

  toggleMenu = () => {
    this.setState({isOpen: !this.state.isOpen});
  };

  handleClose = () => {
    logger.log('Entered handleClose method!!');
    this.setState({open: false});
  };

  sendUserInfo = (event) => {
    event.preventDefault();
    logger.log('Posting Email to hertz API...');
    logger.log('toaster -> ' + this.state.open);
    const userName = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phoneNumber = document.getElementById('phoneNumber').value;
    const company = document.getElementById('company').value;
    const question = document.getElementById('comments').value;
    const userDetails = {
      userName: userName,
      email: email,
      'phon  eNumber': phoneNumber,
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
        this.toggleModal();
        this.setState({open: true});
        logger.log('toaster -> ' + this.state.open);
        // setSnackPack((prev) => [...prev, { 'Thanks for submission !', key: new Date().getTime() }]);
      })
      .catch((error) => {
        console.error('Error:', error);
      });
  };

  render() {
    // var dropDownEle = document.getElementById('dropdown');
    // dropDownEle.addEventListener("click", function () {
    //     alert('click');
    // });
    const {classes} = this.props;
    window.onload = function () {
      const toolTip = document.createElement('div');
      // toolTip.innerHTML = "someData";
      toolTip.addEventListener('click', myfunction);
      document.body.appendChild(toolTip);

      function myfunction() {
        alert('hello guys ');
      }
    };

    return (
      <React.Fragment>
        <Modal
          isOpen={this.state.modal}
          toggle={this.toggleModal}
          className={this.props.className}
        >
          <ModalHeader toggle={this.toggleModaltoggleModal}>
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
                onSubmit={this.sendUserInfo}
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

        <div id="is-sticky">
          <nav
            id="nav-bar"
            className="navbar navbar-expand-lg fixed-top navbar-custom sticky sticky-dark"
          >
            <div className="container">
              <Link className="logo text-uppercase" to="/">
                <img
                  src={logo_light}
                  alt=""
                  className="logo-light"
                  height="14"
                />
                <img src={logo_dark} alt="" className="logo-dark" height="14" />
              </Link>

              <button
                className="navbar-toggler"
                type="button"
                onClick={this.toggleHeader}
              >
                <i className="mdi mdi-menu"></i>
              </button>
              <div
                className={
                  this.state.isOpenMenu
                    ? 'collapse navbar-collapse show'
                    : 'collapse navbar-collapse'
                }
                id="navbarCollapse"
              >
                {/* Does not require ScrillspyNav due to multi-page application */}
                {/* <ScrollspyNav
                                scrollTargetIds={["home", "about", "features", "services", "testimonial", "team", "pricing"]}
                                activeNavclassName="active"
                                scrollDuration="800"
                                headerBackground="true"
                                className={this.state.isOpenMenu ? "navbar-nav ml-0 float-left" : "navbar-nav   ml-auto navbar-center"}>
                            </ScrollspyNav> */}
                <ul className="navbar-nav ml-auto navbar-center" id="mySidenav">
                  <li className="nav-item active">
                    <a href="/home" className="nav-link">
                      Home
                    </a>
                  </li>
                  <li className="nav-item">
                    <a href="/aboutus" className="nav-link">
                      About
                    </a>
                  </li>
                  <li className="nav-item">
                    <div className="dropdown" id="dropdownId">
                      <a className="dropbtn" href="#">
                        Products
                      </a>
                      <div
                        id="dropdown-content"
                        style={{position: 'fixed', display: 'none'}}
                      >
                        <li>
                          <a href="/products/cortext">Cortext</a>
                        </li>
                        <li>
                          <a href="/products/consearch">Consearch</a>
                        </li>
                        <li>
                          <a href="/products/recap">Recap</a>
                        </li>
                      </div>
                    </div>
                  </li>
                  <li className="nav-item">
                    <a href="/services" className="nav-link">
                      Services
                    </a>
                  </li>
                  <li className="nav-item">
                    <a href="/testimonial" className="nav-link">
                      Testimonial
                    </a>
                  </li>
                  <li className="nav-item">
                    <a href="/team" className="nav-link">
                      Team
                    </a>
                  </li>
                  <li className="nav-item">
                    <a href="/Plan" className="nav-link">
                      Pricing
                    </a>
                  </li>
                  <li>
                    <Link
                      onClick={this.toggleModal}
                      to="#"
                      className="nav-link"
                    >
                      Contact
                    </Link>
                  </li>
                </ul>
                <button
                  className="btn btn-sm navbar-btn"
                  style={{color: '#13ce67'}}
                >
                  Sign up
                </button>

                <Snackbar
                  id="notificationBar"
                  anchorOrigin={(this.vertical, this.horizontal)}
                  open={this.state.open}
                  onClose={this.handleClose}
                  message="Thanks for submission, we will get back to you !"
                  key={this.vertical + this.horizontal}
                  ContentProps={{
                    classes: {
                      root: classes.root,
                    },
                  }}
                />
              </div>
            </div>
          </nav>
        </div>
      </React.Fragment>
    );
  }
}

export default withStyles(styles)(HeaderMulti);
