import HevolveLogo from '../data/logo.gif';
import HevolveLogoLight from '../data/logo.gif';

import React, {useEffect, useState, useRef} from 'react';
import ReactGA from 'react-ga';
import {Link as RouterLink, useNavigate} from 'react-router-dom';
import {Link as ScrollLink, animateScroll as scroll} from 'react-scroll';
import {animateScroll as scrollLibrary} from 'react-scroll';

export default function NabBarLite() {
  const navigate = useNavigate();

  const [toggleMenu, setToggleMenu] = useState(false);
  const [scroll, setScroll] = useState(false);

  const token = localStorage.getItem('access_token');
  const userId = localStorage.getItem('user_id');
  const userEmail = localStorage.getItem('email_address');
  useEffect(() => {
    activateMenu();
    window.addEventListener('scroll', () => {
      setScroll(window.scrollY > 50);
    });
    ReactGA.pageview(window.location.pathname + window.location.search);
  }, []);
  const handleSignupClick = () => {
    // Scroll to the top of the page using react-scroll
    scrollLibrary.scrollToTop({
      smooth: true,
    });
  };
  const LogOutUser = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_email');
    navigate('/');
  };

  /** *******************/
  /*    Menu Active    */
  /** *******************/
  function getClosest(elem, selector) {
    // Element.matches() polyfill
    if (!Element.prototype.matches) {
      Element.prototype.matches =
        Element.prototype.matchesSelector ||
        Element.prototype.mozMatchesSelector ||
        Element.prototype.msMatchesSelector ||
        Element.prototype.oMatchesSelector ||
        Element.prototype.webkitMatchesSelector ||
        function (s) {
          let matches = (this.document || this.ownerDocument).querySelectorAll(
              s
            ),
            i = matches.length;
          while (--i >= 0 && matches.item(i) !== this) {}
          return i > -1;
        };
    }

    // Get the closest matching element
    for (; elem && elem !== document; elem = elem.parentNode) {
      if (elem.matches(selector)) return elem;
    }
    return null;
  }

  function activateMenu() {
    const menuItems = document.getElementsByClassName('sub-menu-item');
    if (menuItems) {
      let matchingMenuItem = null;
      for (let idx = 0; idx < menuItems.length; idx++) {
        if (menuItems[idx].href === window.location.href) {
          matchingMenuItem = menuItems[idx];
        }
      }

      if (matchingMenuItem) {
        matchingMenuItem.classList.add('active');

        const immediateParent = getClosest(matchingMenuItem, 'li');

        if (immediateParent) {
          immediateParent.classList.add('active');
        }

        var parent = getClosest(immediateParent, '.child-menu-item');
        if (parent) {
          parent.classList.add('active');
        }

        var parent = getClosest(parent || immediateParent, '.parent-menu-item');

        if (parent) {
          parent.classList.add('active');

          const parentMenuitem = parent.querySelector('.menu-item');
          if (parentMenuitem) {
            parentMenuitem.classList.add('active');
          }

          var parentOfParent = getClosest(parent, '.parent-parent-menu-item');
          if (parentOfParent) {
            parentOfParent.classList.add('active');
          }
        } else {
          var parentOfParent = getClosest(
            matchingMenuItem,
            '.parent-parent-menu-item'
          );
          if (parentOfParent) {
            parentOfParent.classList.add('active');
          }
        }
      }
    }
  }

  if (document.getElementById('navigation')) {
    const elements = document
      .getElementById('navigation')
      .getElementsByTagName('a');
    for (let i = 0, len = elements.length; i < len; i++) {
      elements[i].onclick = function (elem) {
        if (elem.target.getAttribute('href') === '#') {
          const submenu = elem.target.nextElementSibling.nextElementSibling;
          submenu.classList.toggle('open');
        }
      };
    }
  }

  return (
    <>
      <nav
        id="topnav"
        className="nav-sticky defaultscroll is-sticky "
        style={{backgroundColor: '#212A31'}}
      >
        <div className="container">
          <RouterLink className="logo" to="/">
            <img
              src={HevolveLogo}
              className=" h-10 inline-block dark:hidden"
              alt=""
            />
            <img
              src={HevolveLogoLight}
              className=" h-10 hidden dark:inline-block"
              alt=""
            />
            <span style={{color: '#FFF', fontSize: '1rem'}}>EVOLVE</span>
          </RouterLink>

          <div className="menu-extras">
            <div className="menu-item">
              <RouterLink
                className={`${toggleMenu ? 'open' : ''} navbar-toggle`}
                onClick={() => setToggleMenu(!toggleMenu)}
              >
                <div className="lines">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </RouterLink>
            </div>
          </div>
          <ul className="buy-button list-none mb-0">
            {userId && token ? (
              <li className="inline mb-0">
                <span
                  className="py-[6px] px-4 md:inline hidden items-center justify-center tracking-wider align-middle duration-500 text-sm text-center rounded"
                  style={{
                    background: 'linear-gradient(to right, #00e89d, #0078ff)',
                    backgroundImage:
                      'linear-gradient(to right, rgb(0, 232, 157), rgb(0, 120, 255))',
                    borderColor: '#00f0c5',
                    color: '#FFFAE8',
                    transition: 'background-color 0.3s ease',
                    cursor: 'pointer',
                  }}
                  onClick={LogOutUser}
                >
                  Logout
                </span>
              </li>
            ) : (
              <>
                <li className="inline mb-0">
                  <RouterLink to="https://hevolvechat.hertzai.com/teacher/signin">
                    <span
                      className="py-[6px] px-4 md:inline hidden items-center justify-center tracking-wider align-middle duration-500 text-sm text-center rounded"
                      style={{
                        background:
                          'linear-gradient(to right, #00e89d, #0078ff)',
                        backgroundImage:
                          'linear-gradient(to right, rgb(0, 232, 157), rgb(0, 120, 255))',
                        borderColor: '#00f0c5',
                        color: '#FFFAE8',
                        transition: 'background-color 0.3s ease',
                        cursor: 'pointer',
                      }}
                    >
                      Login
                    </span>
                  </RouterLink>
                </li>
                <li className="md:inline hidden ps-1 mb-0 ">
                  <RouterLink
                    to="/institution/signup"
                    className="py-[6px] px-4 inline-block items-center justify-center tracking-wider align-middle duration-500 text-sm text-center rounded text-white font-semibold"
                    smooth={true}
                    duration={500}
                    onClick={handleSignupClick}
                    style={{
                      background: 'linear-gradient(to right, #00e89d, #0078ff)',
                      backgroundImage:
                        'linear-gradient(to right, rgb(0, 232, 157), rgb(0, 120, 255))',
                      borderColor: '#FFFAE8',
                      transition: 'background-color 0.3s ease',
                      cursor: 'pointer',
                    }}
                  >
                    Signup
                  </RouterLink>
                </li>
              </>
            )}
          </ul>
          <div id="navigation" className={`${toggleMenu ? 'block' : ''}`}>
            <ul className="navigation-menu">
              <li className="has-submenu parent-menu-item">
                <RouterLink to="/">Home</RouterLink>
              </li>

              <li>
                <RouterLink to="/aboutus" className="sub-menu-item">
                  About Us
                </RouterLink>
              </li>
              <li>
                <RouterLink to="/Plan" className="sub-menu-item">
                  Pricing{' '}
                </RouterLink>
              </li>
              <li>
                <a
                  href="https://hevolvechat.hertzai.com/contactUs?institution"
                  className="sub-menu-item"
                  rel="noopener noreferrer"
                >
                  Book a Demo
                </a>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    </>
  );
}
