import Footer from '../components/footer';
import Navbar from '../components/navbar';
import TrialPlan from '../components/TrialPlan';

import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';


export default function TrialPlanPricing() {
  const [hevolvedroid, setIshevolvedroid] = useState(true);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    setIshevolvedroid(userAgent.includes('hevolvedroid'));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('dir', 'ltr');
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }, []);

  return (
    <>
      {!hevolvedroid && <Navbar />}

      <section style={{paddingTop: '4rem'}} className="relative mt-4">
        <div className="container relative">
          <div className="grid grid-cols-1 text-center ">
            <div>
              <h5 className="md:text-4xl text-3xl md:leading-normal leading-normal tracking-wider font-semibold text-white mb-0">
                Pricing Plans
              </h5>
            </div>

            <ul className="tracking-[0.5px] mb-0 inline-block ">
              <li className="inline-block capitalize text-[15px] font-medium duration-500 ease-in-out text-white/50 hover:text-white">
                <Link to="/">Hevolve AI</Link>
              </li>
              <li className="inline-block text-base text-white/50 mx-0.5 ltr:rotate-0 rtl:rotate-180">
                <i className="mdi mdi-chevron-right"></i>
              </li>
              <li
                className="inline-block capitalize text-[15px] font-medium duration-500 ease-in-out text-white"
                aria-current="page"
              >
                Pricing
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="relative md:pb-24 pb-16">
        <div className="container relative ">
          <TrialPlan />
        </div>
      </section>

      {!hevolvedroid && <Footer />}
    </>
  );
}
