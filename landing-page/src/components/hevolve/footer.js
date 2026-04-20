import HevolveLogo from '../../data/logo.gif';

import React from 'react';
import {FcReddit} from 'react-icons/fc';
import {FiLinkedin, FiFacebook, FiInstagram, FiTwitter} from 'react-icons/fi';
import {Link} from 'react-router-dom';
import {Link as ScrollLink} from 'react-scroll';
import {animateScroll as scrollLibrary} from 'react-scroll';

export default function Footer() {
  const featureData = [
    {
      title: 'Download the App ',
      desc: 'Visit the Google Play Store and search for "Hevolve." Click "Download" to install the app on your device.',
    },
    {
      title: 'Create an Account ',
      desc: 'Enter your email address, set up a password and provide any additional information required.',
    },

    {
      title: 'Explore and Learn',
      desc: 'Browse through the app, interact with AI avatars and access a wealth of educational resources tailored to your needs and interests.',
    },
  ];
  const handleSignupClick = () => {
    // Scroll to the top of the page using react-scroll
    scrollLibrary.scrollToTop({
      smooth: true,
    });
  };

  return (
    <>
      <div className="relative">
        <div className="shape absolute xl:-bottom-[30px] lg:-bottom-[16px] md:-bottom-[13px] -bottom-[5px] start-0 end-0 overflow-hidden z-1 rotate-180 text-white dark:text-slate-900">
          <svg
            className="w-full h-auto scale-[2.0] origin-top"
            viewBox="0 0 2880 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0 48H1437.5H2880V0H2160C1442.5 52 720 0 720 0H0V48Z"
              fill="currentColor"
            ></path>
          </svg>
        </div>
      </div>
      <footer className="relative bg-gray-900 overflow-hidden">
        <div className="container-fluid relative md:py-24 py-16">
          <div className="container relative">
            <div className="grid grid-cols-1 text-center">
              <div className="">
                <h4 className="font-bold lg:leading-normal leading-normal text-4xl lg:text-5xl text-white tracking-normal mb-4">
                  How to Get Started?
                </h4>

                {featureData.map((item, index) => (
                  <div className="flex-1 ms-4" key={index}>
                    <h4 className="mb-0 text-lg font-semibold">{item.title}</h4>
                    <p className="text-slate-400 mt-2">{item.desc}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <p className="text-slate-400 mt-2 mb-4">
                  Learn at your own pace and in your own style!
                </p>
                <ScrollLink
                  to="signup-section"
                  className="py-2 px-5 inline-block font-semibold tracking-wide border align-middle duration-500 text-base text-center text-white rounded-md"
                  style={{
                    backgroundColor: '#00f0c5',
                    borderColor: '#FFFAE8',
                    transition: 'background-color 0.3s ease',
                  }}
                  smooth={true}
                  duration={500}
                  onClick={handleSignupClick}
                >
                  Join Hevolve
                </ScrollLink>
              </div>
            </div>
          </div>
        </div>

        <div className="container relative text-center">
          <div className="grid grid-cols-1 border-t border-gray-800 dark:border-slate-800">
            <div className="py-[30px] px-0">
              <div className="  grid md:grid-cols-2 items-center">
                <div className="md:text-start text-center flex justify-between items-center">
                  <Link
                    to="#"
                    className="flex justify-start items-center text-[22px] focus:outline-none"
                  >
                    <img
                      src={HevolveLogo}
                      className=" h-11 mx-auto md:me-auto md:ms-0"
                      alt=""
                    />
                    <span style={{color: '#FFF', fontSize: '1.1rem'}}>
                      EVOLVE
                    </span>
                  </Link>
                  <ul className="list-none footer-list md:text-end text-center  md:mt-0 space-x-1 flex justify-around items-center">
                    <li className="inline">
                      <Link
                        to="https://www.linkedin.com/company/hevolve-ai/?viewAsMember=true"
                        target="_blank"
                        className="h-8 w-8 inline-flex items-center justify-center tracking-wide align-middle duration-500 text-base text-center border border-gray-800 dark:border-slate-800 rounded-md hover:border-amber-400 dark:hover:border-amber-400 hover:bg-amber-400 dark:hover:bg-amber-400 text-slate-300 hover:text-white"
                      >
                        <FiLinkedin className="h-4 w-4 align-middle" />
                      </Link>
                    </li>
                    <li className="inline">
                      <Link
                        to="https://www.facebook.com/profile.php?id=61555108746560&mibextid=ZbWKwL"
                        target="_blank"
                        className="h-8 w-8 inline-flex items-center justify-center tracking-wide align-middle duration-500 text-base text-center border border-gray-800 dark:border-slate-800 rounded-md hover:border-amber-400 dark:hover:border-amber-400 hover:bg-amber-400 dark:hover:bg-amber-400 text-slate-300 hover:text-white"
                      >
                        <FiFacebook className="h-4 w-4 align-middle" />
                      </Link>
                    </li>
                    <li className="inline">
                      <Link
                        to="https://www.instagram.com/hevolve.ai/"
                        target="_blank"
                        className="h-8 w-8 inline-flex items-center justify-center tracking-wide align-middle duration-500 text-base text-center border border-gray-800 dark:border-slate-800 rounded-md hover:border-amber-400 dark:hover:border-amber-400 hover:bg-amber-400 dark:hover:bg-amber-400 text-slate-300 hover:text-white"
                      >
                        <FiInstagram className="h-4 w-4 align-middle" />
                      </Link>
                    </li>
                    <li className="inline">
                      <Link
                        to="https://x.com/hertz_ai?t=j0ug14LVyIVLC4O_ZcSI3A&s=09"
                        target="_blank"
                        className="h-8 w-8 inline-flex items-center justify-center tracking-wide align-middle duration-500 text-base text-center border border-gray-800 dark:border-slate-800 rounded-md hover:border-amber-400 dark:hover:border-amber-400 hover:bg-amber-400 dark:hover:bg-amber-400 text-slate-300 hover:text-white"
                      >
                        <FiTwitter className="h-4 w-4 align-middle" />
                      </Link>
                    </li>
                    <li className="inline">
                      <Link
                        to="https://www.reddit.com/r/Hevolve/"
                        target="_blank"
                        className="h-8 w-8 inline-flex items-center justify-center tracking-wide align-middle duration-500 text-base text-center border border-gray-800 dark:border-slate-800 rounded-md hover:border-amber-400 dark:hover:border-amber-400 hover:bg-amber-400 dark:hover:bg-amber-400 text-slate-300 hover:text-white"
                      >
                        {' '}
                        <FcReddit className="h-4 w-4 align-middle" />
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="py-[30px] px-0 border-t border-gray-800 dark:border-slate-800">
          <div className="container relative text-center">
            <div className="grid grid-cols-1">
              <div className="text-center">
                <p className="text-gray-400">
                  © {new Date().getFullYear()} Hevolve.Ai. Design with{' '}
                  <i className="mdi mdi-heart text-orange-700"></i> by{' '}
                  <Link
                    to="https://shreethemes.in/"
                    target="_blank"
                    className="text-reset"
                  >
                    HertzAi
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
