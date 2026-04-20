import Signup from './signup';

import AboutOne from '../components/aboutOne';
import AboutThree from '../components/aboutThree';
import AboutTwo from '../components/aboutTwo';
import AiFeatures from '../components/aiFeatures';
import BrandLogo from '../components/brandLogo';
import Clients from '../components/clients';
import Footer from '../components/footer';
import Navbar from '../components/navbar';

import React, {useState, useEffect, lazy, Suspense} from 'react';
import ReactGA from 'react-ga';


const Features = lazy(() => import('../components/features'));
export default function IndexThree() {
  const [hevolvedroid, setIshevolvedroid] = useState(true);
  useEffect(() => {
    const userAgent = navigator.userAgent;
    setIshevolvedroid(userAgent.includes('hevolvedroid'));
  }, []);

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
        id="= start-section"
        className="relative md:py-50 py-36 items-center mt-[74px] md:mx-4 overflow-hidden "
      >
        <div
          style={{borderRadius: '2rem'}}
          className="absolute top-0 start-0 w-full h-full z-0 pointer-events-none overflow-hidden "
        >
          <iframe
            src="https://www.youtube.com/embed/FYKHEHG02fk?controls=0&showinfo=0&rel=0&autoplay=1&loop=1&mute=1"
            title="my-fram"
            className="absolute top-1/2 start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2 -translate-y-1/2 w-screen h-[56.25vw] min-h-screen md:min-w-[177.77vw] min-w-[400vw]"
          ></iframe>
        </div>
        <div
          style={{borderRadius: '2rem'}}
          className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/800 to-transparent "
        ></div>
        <div className="container relative">
          <div
            className="grid grid-cols-1 text-center"
            style={{
              background: ' rgba(115, 120, 132, 0.2)',
              borderRadius: '10px',
              padding: '20px',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
            }}
          >
            <div className="">
              <h4 className="font-bold lg:leading-normal leading-normal  text-4xl lg:text-7xl mb-5">
                Say Hi <br /> To{' '}
                <span
                  style={{color: '#FFFAE8 !important'}}
                  className="bg-gradient-to-br from-amber-400 to-fuchsia-600  bg-clip-text"
                >
                  {' '}
                  Your New Learning Friend, HevolveAI
                </span>{' '}
              </h4>
              <p style={{color: '#FFF'}} className=" text-lg max-w-xl mx-auto">
                Learn, research and discover the knowledge you seek with your
                HevolveAI friend.
              </p>

              <a
                href="https://play.google.com/store/apps/details?id=com.hertzai.hevolve&hl=en&gl=US&pcampaignid=pcampaignidMKT-Other-global-all-co-prtnr-py-PartBadge-Mar2515-1"
                className="py-2 px-5 inline-block font-semibold tracking-wide  align-middle duration-500 text-base text-center   text-white rounded-md"
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <img
                  alt="Get it on Google Play"
                  src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                  style={{
                    width: '202px',
                    height: '80px',

                    top: 0,
                    left: 0,
                  }}
                />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section style={{marginBottom: '12rem'}} className="pt-6">
        <BrandLogo />
      </section>

      <section className="relative  ">
        <AboutThree />
        <Suspense fallback={<div>Loading...</div>}>
          <Features classlist="container relative " />
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
