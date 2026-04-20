import React, {useState, useEffect, lazy, Suspense} from 'react';
import {ToastContainer, toast} from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {faArrowRight} from '@fortawesome/free-solid-svg-icons';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {useNavigate} from 'react-router-dom';
import ReactGA from 'react-ga';

import Navbar from '../components/navbar';
import BrandLogo from '../components/brandLogo';
import AboutThree from '../components/aboutThree';
import AboutOne from '../components/aboutOne';
import AboutTwo from '../components/aboutTwo';
import AiFeatures from '../components/aiFeatures';
import Clients from '../components/clients';
import Footer from '../components/footer';

import Signup from './signup';

const Features = lazy(() => import('../components/features'));
const Featuresnew = lazy(() => import('../components/featuresnew'));

export default function IndexThree() {
  const navigate = useNavigate();

  const [hevolvedroid, setIshevolvedroid] = useState(true);
  const [agentsData] = useState([
    {name: 'Interview', color: '#FF5733'},
    {name: 'Speech Therapy', color: '#33FF57'},
    {name: 'Language Learning', color: '#3357FF'},
    {name: 'Spoken English', color: '#FF33A1'},
    {name: 'Life Coach', color: '#FFD733'},
    {name: 'Career Advisor', color: '#FF5733'},
    {name: 'Tutor', color: '#33FFD5'},
    {name: 'Tax Filer', color: '#A1FF33'},
    {name: 'Personal Assistant', color: '#FF33F6'},
    {name: 'Web Form Filler', color: '#FF5733'},
    {name: 'Revise', color: '#3357FF'},
    {name: 'Sales', color: '#33A1FF'},
    {name: 'Marketing', color: '#FFD733'},
    {name: 'Schedule Task', color: '#FF33A1'},
    {name: 'Calendar', color: '#57FF33'},
    {name: 'File Tickets', color: '#3357FF'},
    {name: 'Mathematician', color: '#FF5733'},
    {name: 'Famous Scientist', color: '#33FFD5'},
  ]);
  const [currentAgentIndex, setCurrentAgentIndex] = useState(0);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    setIshevolvedroid(userAgent.includes('hevolvedroid'));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentAgentIndex((prevIndex) => (prevIndex + 1) % agentsData.length);
    }, 500);

    return () => clearInterval(interval);
  }, [agentsData]);

  useEffect(() => {
    document.documentElement.setAttribute('dir', 'ltr');
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
    ReactGA.pageview(window.location.pathname + window.location.search);
  }, []);

  return (
    <>
      <Navbar />
      <section
        style={{marginBottom: '12rem', borderRadius: '2rem'}}
        id="start-section"
        className="relative md:py-50 py-36 items-center mt-[74px] md:mx-4 overflow-hidden"
      >
        <div
          style={{borderRadius: '2rem'}}
          className="absolute top-0 start-0 w-full h-full z-0 pointer-events-none overflow-hidden"
        >
          <iframe
            src="https://www.youtube.com/embed/FYKHEHG02fk?controls=0&showinfo=0&rel=0&autoplay=1&loop=1&mute=1"
            title="my-fram"
            className="absolute top-1/2 start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2 -translate-y-1/2 w-screen h-[56.25vw] min-h-screen md:min-w-[177.77vw] min-w-[400vw]"
          ></iframe>
        </div>
        <div
          style={{borderRadius: '2rem'}}
          className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/800 to-transparent"
        ></div>
        <div className="container relative">
          <div
            className="grid grid-cols-1 text-center"
            style={{
              background: 'rgba(115, 120, 132, 0.2)',
              borderRadius: '10px',
              padding: '20px',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
            }}
          >
            <div>
              <div
                style={{flexDirection: 'column', gap: '10px'}}
                className=" font-semibold md:font-bold flex mb-6 md:text-5xl"
              >
                <div className=" font-semibold md:font-bold  mb-6 md:text-5xl lg:font-bold lg:text-4xl  xl:text-4xl">
                  Say Hi
                </div>
                <div
                  className=" font-semibold md:font-bold  mb-6 md:text-5x lg:font-bold lg:text-4xl xl:!text-4xl
"
                >
                  To Your New AI Friend
                </div>
                <div className="md:flex justify-between md:font-semibold md:text-3xl  lg:!justify-around lg:font-bold lg:!text-4xl xl:text-4xl xl:justify-between">
                  <div>Introducing HevolveAI</div>
                  <div
                    className="md:w-72 lg:w-[400px] xl:w-[320px]"
                    style={{color: agentsData[currentAgentIndex]?.color}}
                  >
                    {' '}
                    {agentsData[currentAgentIndex]?.name}
                  </div>
                  <div>Agents</div>
                </div>
              </div>
              <p style={{color: '#FFF'}} className="text-lg max-w-xl mx-auto">
                Create Your HevolveAI Agent Today In Your Language.
              </p>
              <div
                style={{gap: '70px'}}
                className="flex justify-center items-center gap-7 mt-4"
              >
                <a
                  href="https://play.google.com/store/apps/details?id=com.hertzai.hevolve&hl=en&gl=US&pcampaignid=pcampaignidMKT-Other-global-all-co-prtnr-py-PartBadge-Mar2515-1"
                  className="inline-block"
                  style={{overflow: 'hidden'}}
                >
                  <img
                    alt="Get it on Google Play"
                    src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                    style={{width: '202px', height: '80px'}}
                  />
                </a>

                <button
                  onClick={() => navigate('/agents')}
                  style={{color: 'black'}}
                  className="px-4 py-2 bg-blue-600 rounded-lg transition-colors duration-300 hover:bg-blue-700 flex items-center"
                >
                  View All Agents
                  <FontAwesomeIcon icon={faArrowRight} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative">
        <AboutThree />
        <Suspense fallback={<div>Loading...</div>}>
          <Featuresnew classlist="container relative" />
        </Suspense>
        <AboutOne />
        <AboutTwo />
        <AiFeatures />
        <section style={{marginBottom: '12rem'}} id="signup-section">
          <Signup />
        </section>
        <Clients />
      </section>
      {!hevolvedroid && <Footer />}
    </>
  );
}
