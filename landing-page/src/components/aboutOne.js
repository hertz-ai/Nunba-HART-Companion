
import Portrait1 from '../Gif/Portrait1.gif';

import React from 'react';
import {FiCheckCircle} from 'react-icons/fi';
import {MdKeyboardArrowRight} from 'react-icons/md';
import {Link} from 'react-router-dom';

export default function AboutOne() {
  return (
    <>
      <div
        style={{marginBottom: '12rem'}}
        className="container relative md:mt-24 "
      >
        <div className="grid md:grid-cols-2 grid-cols-1 items-center gap-6">
          <div className="relative overflow-hidden rounded-lg border border-amber-400/5 bg-gradient-to-tl to-amber-400/30  from-fuchsia-600/30 dark:to-amber-400/50 dark:from-fuchsia-600/50 lg:me-8">
            <img
              src={Portrait1}
              className="ltr:rounded-tl-lg rtl:rounded-tr-lg"
              alt=""
            />
          </div>

          <div className="">
            <h3 className="mb-4 md:text-3xl md:leading-normal text-2xl leading-normal font-semibold">
              {' '}
              Turn Your Online Expertise Into a 24/7 Income Stream
            </h3>
            <p className="text-slate-400 max-w-xl">
              If You Can Do It Online, You Can Automate It
            </p>

            <ul className="list-none text-slate-400 mt-4">
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 me-2" />
                Consultations?
                <span className="text-green-600 ms-2">Yes</span>
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 me-2" />
                Assessments?
                <span className="text-green-600 ms-2">Yes</span>
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 me-2" />
                Training?
                <span className="text-green-600 ms-2">Yes</span>
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 me-2" />
                Customer Support?
                <span className="text-green-600 ms-2">Yes</span>
              </li>
            </ul>
            <p>Anything digital can be your passive income source</p>

            <p>Our Experts Are Earning While They Sleep</p>

            <p>$3000-$5000 Monthly Extra Income*</p>
            <p>Without working extra hours!</p>

            <div className="mt-4">
              <Link
                to="https://play.google.com/store/apps/details?id=com.hertzai.hevolve"
                className="hover:text-amber-400 font-medium duration-500 inline-flex items-center"
              >
                Find Out More{' '}
                <MdKeyboardArrowRight className="ms-1 text-[20px]" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
