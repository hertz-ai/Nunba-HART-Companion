
import Portrait2 from '../../Gif/Portrait2.gif';

import React from 'react';
import {FiCheckCircle} from 'react-icons/fi';
import {MdKeyboardArrowRight} from 'react-icons/md';
import {Link} from 'react-router-dom';

export default function AboutTwo() {
  return (
    <>
      <div
        style={{marginBottom: '12rem'}}
        className="container relative md:mt-24 "
      >
        <div className="grid md:grid-cols-2 grid-cols-1 items-center gap-6">
          <div className="relative order-1 md:order-2">
            <div className="relative overflow-hidden rounded-lg border border-amber-400/5 bg-gradient-to-tl to-amber-400/30  from-fuchsia-600/30 dark:to-amber-400/50 dark:from-fuchsia-600/50  lg:ms-8">
              <img
                src={Portrait2}
                className="ltr:rounded-tr-lg rtl:rounded-tl-lg"
                alt=""
              />
            </div>
          </div>

          <div className="order-2 md:order-1">
            <h4 className="mb-4 md:text-3xl md:leading-normal text-2xl leading-normal font-semibold">
              Why HevolveAI Agents?
            </h4>
            <p className="text-slate-400">
              We're not just another AI platform – we're a game-changer in the
              world of education. With our cutting-edge technology, AI-generated
              avatars and the commitment to provide access to quality education,
              we're redefining what it means to learn in the digital age.{' '}
            </p>
            <ul className="list-none text-slate-400 mt-4">
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 me-2" />{' '}
                Expert-verified quality{' '}
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 me-2" />{' '}
                Available 24/7
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 me-2" /> Pay
                per use, fraction of human expert cost
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 me-2" />
                No appointments needed
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 me-2" />{' '}
                Unbiased, judgment-free help
              </li>
            </ul>

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
