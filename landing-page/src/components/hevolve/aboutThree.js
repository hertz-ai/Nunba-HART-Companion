
import india from '../../assets/images/flags/india.png';
import russia from '../../assets/images/flags/russia.png';
import spain from '../../assets/images/flags/spain.png';
import usa from '../../assets/images/flags/usa.png';
import thumbnailImage from '../../assets/images/Thumbnail.jpg';
import video from '../../assets/Video/SecondVideo.mp4';

import React, {useState} from 'react';
import {FiCheckCircle} from 'react-icons/fi';
import ModalVideo from 'react-modal-video';
import {Link} from 'react-router-dom';
import 'react-modal-video/css/modal-video.css';

export default function AboutThree() {
  const [isOpen, setOpen] = useState(false);

  const countryData = [
    {name: 'English', image: 'https://flagpedia.net/data/flags/h80/us.png'}, // USA
    {name: 'Russian', image: 'https://flagpedia.net/data/flags/h80/ru.png'}, // Russia
    {name: 'Spanish', image: 'https://flagpedia.net/data/flags/h80/es.png'}, // Spain
    {name: 'Hindi', image: 'https://flagpedia.net/data/flags/h80/in.png'}, // India
    {name: 'Bengali', image: 'https://flagpedia.net/data/flags/h80/bd.png'}, // Bangladesh
    {name: 'Tamil', image: 'https://flagpedia.net/data/flags/h80/in.png'}, // Tamil Nadu (India)
    {name: 'ਪPunjabi', image: 'https://flagpedia.net/data/flags/h80/in.png'}, // Punjab (India)
    {name: 'ગGujarati', image: 'https://flagpedia.net/data/flags/h80/in.png'}, // Gujarat (India)
    {name: 'Kannada', image: 'https://flagpedia.net/data/flags/h80/in.png'}, // Karnataka (India
    {name: 'Telugu', image: 'https://flagpedia.net/data/flags/h80/in.png'}, // Telangana (India
    {name: 'Marathi', image: 'https://flagpedia.net/data/flags/h80/in.png'}, // Maharashtra (India
    {name: 'Malayalam', image: 'https://flagpedia.net/data/flags/h80/in.png'}, // Kerala (India
    {name: 'Arabic', image: 'https://flagpedia.net/data/flags/h80/sa.png'}, // Saudi Arabia
    {name: 'Bulgarian', image: 'https://flagpedia.net/data/flags/h80/bg.png'}, // Bulgaria
    {
      name: 'Hakka Chinese',
      image: 'https://flagpedia.net/data/flags/h80/cn.png',
    }, // China
    {name: 'Dutch', image: 'https://flagpedia.net/data/flags/h80/nl.png'}, // Netherlands
    {name: 'Finnish', image: 'https://flagpedia.net/data/flags/h80/fi.png'}, // Finland
    {name: 'French', image: 'https://flagpedia.net/data/flags/h80/fr.png'}, // France
    {name: 'German', image: 'https://flagpedia.net/data/flags/h80/de.png'}, // Germany
    {name: 'Greek', image: 'https://flagpedia.net/data/flags/h80/gr.png'}, // Greece
    {name: 'Hebrew', image: 'https://flagpedia.net/data/flags/h80/il.png'}, // Israel
    {name: 'Hungarian', image: 'https://flagpedia.net/data/flags/h80/hu.png'}, // Hungary
    {name: 'Icelandic', image: 'https://flagpedia.net/data/flags/h80/is.png'}, // Iceland
    {name: 'Indonesian', image: 'https://flagpedia.net/data/flags/h80/id.png'}, // Indonesia
    {name: 'Korean', image: 'https://flagpedia.net/data/flags/h80/kr.png'}, // South Korea
    {name: 'Latvian', image: 'https://flagpedia.net/data/flags/h80/lv.png'}, // Latvia
    {name: 'Malay', image: 'https://flagpedia.net/data/flags/h80/my.png'}, // Malaysia
    {name: 'Persian', image: 'https://flagpedia.net/data/flags/h80/ir.png'}, // Iran
    {name: 'Polish', image: 'https://flagpedia.net/data/flags/h80/pl.png'}, // Poland
    {name: 'Portuguese', image: 'https://flagpedia.net/data/flags/h80/pt.png'}, // Portugal
    {name: 'Romanian', image: 'https://flagpedia.net/data/flags/h80/ro.png'}, // Romania
    {name: 'Swahili', image: 'https://flagpedia.net/data/flags/h80/ke.png'}, // Kenya
    {name: 'Swedish', image: 'https://flagpedia.net/data/flags/h80/se.png'}, // Sweden
    {name: 'Thai', image: 'https://flagpedia.net/data/flags/h80/th.png'}, // Thailand
    {name: 'urkish', image: 'https://flagpedia.net/data/flags/h80/tr.png'}, // Turkey
    {name: 'Ukrainian', image: 'https://flagpedia.net/data/flags/h80/ua.png'}, // Ukraine
    {name: 'اUrdu', image: 'https://flagpedia.net/data/flags/h80/pk.png'}, // Pakistan
    {name: 'Vietnamese', image: 'https://flagpedia.net/data/flags/h80/vn.png'}, // Vietnam
    {name: ' Welsh', image: 'https://flagpedia.net/data/flags/h80/gb-wls.png'}, // Wales
  ];

  return (
    <>
      <div style={{marginBottom: '5rem'}} className="container relative">
        <div className="grid md:grid-cols-2 grid-cols-1 items-center gap-6">
          <div>
            <h3 className="mb-4 md:text-3xl md:leading-normal text-2xl leading-normal font-semibold">
              Why Create an Agent?
            </h3>
            <h5 className="mb-4 md:text-2xl md:leading-normal text-2xl leading-normal font-semibold">
              Start Creating Your Agent for FREE!
            </h5>
            <p className="text-slate-400 max-w-xl">
              Your expertise + Our AI = Your 24/7 Digital Income
            </p>
            <ul className="list-none text-slate-400 mt-4">
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 mr-2" /> Work
                once, earn forever
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 mr-2" /> Serve
                unlimited clients simultaneously
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 mr-2" /> Global
                reach, zero extra effort
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 mr-2" /> Full
                control over your digital twin
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 mr-2" /> Free
                to create, earn from day one
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 md:text-3xl md:leading-normal text-2xl leading-normal font-semibold">
              Need Help? <br />
              There's an Agent for That!
            </h3>
            <p className="text-slate-400 max-w-xl">
              Ready-to-Use Expert Agents at Your Service.
            </p>
            <ul className="list-none text-slate-400 mt-4">
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 mr-2" /> Speech
                Therapist Agent - Professional therapy at 1/10th the cost
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 mr-2" />{' '}
                Language Learning Agent - Master any language, anytime
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 mr-2" /> Spoken
                English Agent - Perfect your pronunciation 24/7
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 mr-2" /> Career
                Enhancement Agent - Interview prep, CV building & more
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 mr-2" />{' '}
                Personal Private Tutor Agent - Custom revision & assessments
              </li>
              <li className="mb-2 flex items-center">
                <FiCheckCircle className="text-amber-400 h-5 w-5 mr-2" />{' '}
                Customer Care Agent - Instant support, zero waiting
              </li>
            </ul>
            <div className="mt-4">
              <Link
                to="https://play.google.com/store/apps/details?id=com.hertzai.hevolve"
                className="hover:text-amber-400 font-medium duration-500"
              >
                Find Out More{' '}
                <i className="mdi mdi-chevron-right text-[20px] align-middle"></i>
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="container mb-20 flex flex-wrap gap-2 justify-center">
        {countryData.map((item, index) => (
          <Link
            to=""
            key={index}
            className="flex items-center justify-center py-1 px-2 text-sm text-center rounded bg-amber-400/5 hover:bg-amber-400 border border-amber-400/10 hover:border-amber-400 text-amber-400 hover:text-white font-semibold m-1"
            style={{flex: '1 1 calc(10% - 0.5rem)'}}
          >
            <img
              loading="lazy"
              src={item.image}
              className="h-5 w-5 mr-1"
              alt={item.name}
            />
            {item.name}
          </Link>
        ))}
      </div>
    </>
  );
}
