import React, {useState, useEffect} from 'react';
import {Link} from 'react-router-dom';

import Garv from '../assets/images/client/Garv.jpg';
import Monisha from '../assets/images/client/Monisha.png';
import Rajesh from '../assets/images/client/Rajesh.png';
import Ramesh from '../assets/images/client/Ramesh.jpg';
import Sahil from '../assets/images/client/Sahil.png';
import Footer from '../components/footer';


import '../../node_modules/react-modal-video/css/modal-video.css';
import Navbar from '../components/navbar';
import FinalGif from '../Gif/FinalGif.png';

import {FiCheckCircle} from 'react-icons/fi';
import ModalVideo from 'react-modal-video';

export default function AboutUs() {
  useEffect(() => {
    document.documentElement.setAttribute('dir', 'ltr');
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }, []);
  const [isOpen, setOpen] = useState(false);
  const teamData = [
    {
      image: Garv,
      name: 'Garv Soni',
      title: 'Data Scientist',
    },
    {
      image: Sahil,
      name: 'Sahil Kureshi',
      title: 'Deep Learning Engineer ',
    },
    {
      image: Ramesh,
      name: 'Ramesh Nailwal',
      title: 'Front-End Developer',
    },

    {
      image: Monisha,
      name: 'Monisha',
      title: 'Android Developer',
    },
    {
      image: Rajesh,
      name: 'Rajesh Gouda',
      title: 'Full-Stack Developer',
    },
  ];
  return (
    <>
      <Navbar />
      <section className="relative mt-5 md:py-30 py-10 ">
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-slate-900/70"></div>
        <div className="container relative">
          <div className="grid grid-cols-1 text-center mt-6">
            <div>
              <h5 className="md:text-4xl text-3xl md:leading-normal leading-normal tracking-wider font-semibold text-white mb-0">
                About Us
              </h5>
            </div>

            <ul className="tracking-[0.5px] mb-0 inline-block mt-5">
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
                About Us
              </li>
            </ul>
          </div>
        </div>
      </section>
      <div className="relative">
        <div className="shape absolute sm:-bottom-px -bottom-[2px] start-0 end-0 overflow-hidden z-1 text-white dark:text-slate-900">
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

      <section className="relative md:py-24 py-16">
        <div className="container relative">
          <div className="grid md:grid-cols-2 grid-cols-1 items-center gap-6">
            <div className="relative overflow-hidden after:content-[''] after:absolute after:inset-0 after:m-auto after:w-96 after:h-96 a after:rounded-full p-6 bg-white dark:bg-slate-900 rounded-md shadow dark:shadow-slate-800 lg:me-6">
              <div className="relative overflow-hidden rounded-lg shadow-md dark:shadow-gray-800 z-1">
                <img src={FinalGif} alt="" />

                <div className="absolute bottom-2/4 translate-y-2/4 start-0 end-0 text-center">
                  <Link
                    to="#!"
                    onClick={() => setOpen(true)}
                    className="lightbox lg:h-16 h-14 lg:w-16 w-14 rounded-full shadow-lg dark:shadow-gray-800 inline-flex items-center justify-center bg-white dark:bg-slate-900 hover:bg-amber-400 dark:hover:bg-amber-400 text-amber-400 hover:text-white duration-500 ease-in-out mx-auto"
                  >
                    <i className="mdi mdi-play inline-flex items-center justify-center text-2xl"></i>
                  </Link>
                </div>
              </div>
            </div>
            <ModalVideo
              channel="youtube"
              youtube={{mute: 0, autoplay: 0}}
              isOpen={isOpen}
              videoId="IzHpdcMNRGY"
              onClose={() => setOpen(false)}
            />
            <div className="">
              <h3 className="mb-4 md:text-3xl md:leading-normal text-2xl leading-normal font-semibold">
                <span className="font-bold">Learn smarter,</span> <br /> by
                using AI not manually
              </h3>
              <p className="text-slate-400 max-w-xl">
                At HertzAI, we build real-time reasoning modules in NLP And
                Computer Vision. We have embarked on a mission to revolutionize
                the educational experience for all students, especially those
                with special needs. Our short-term goal is to provide immediate
                analytics on student comprehension post-instruction via
                AI-assisted teaching, complemented by a conversational AI
                avatar. Our innovative platform boasts a fully autonomous,
                multimodal interactive teaching AI, complete with automatic
                curriculum building, assessment creation, and real-time revision
                capabilities. It operates seamlessly within existing educational
                frameworks and excites learners with gamified content in their
                vernacular language. Our long term goal is to evolve human
                knowledge at the speed of AI knowledge, not limited by language,
                demographics, or disabilities merging human intelligence with
                artificial intelligence by augmenting with brain (synthetic
                neo-cortex).
              </p>
              <p className="mt-2">
                We push boundaries by developing cutting edge AI solutions which
                shapes the DL/AI community trends and we care about its
                influence on the Assistance of humanity by creating ai
                assistants for everything humans do.{' '}
              </p>

              <ul className="list-none text-slate-400 mt-4">
                <li className="mb-2 flex items-center">
                  <FiCheckCircle className="text-amber-400 h-5 w-5 me-2" />{' '}
                  Present And Future Of Education Using AI
                </li>
                <li className="mb-2 flex items-center">
                  <FiCheckCircle className="text-amber-400 h-5 w-5 me-2" />{' '}
                  Tailored For Educational Institutions Of Today
                </li>
                <li className="mb-2 flex items-center">
                  <FiCheckCircle className="text-amber-400 h-5 w-5 me-2" />
                  Create Content Autonomously & With Human In The Loop{' '}
                </li>
              </ul>

              <div className="mt-4">
                <Link
                  to="https://hevolve.hertzai.com/"
                  className="hover:text-red-400 font-medium duration-500"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read More{' '}
                  <i className="mdi mdi-pink-right text-[20px] align-middle"></i>
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className="container relative md:mt-24 mt-16">
          <div className="grid grid-cols-1 pb-6 text-center">
            <h3 className="mb-4 md:text-3xl md:leading-normal text-2xl leading-normal font-semibold">
              The Team
            </h3>

            <p className="text-slate-400 max-w-xl mx-auto">
              A team so passionate about changing everyone's life for good using
              AI
            </p>
          </div>

          <div className="grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1 mt-6 gap-6">
            {teamData.map((item, index) => {
              return (
                <div
                  className="overflow-hidden relative w-full mx-auto bg-white dark:bg-slate-900 shadow hover:shadow-md dark:shadow-slate-800 rounded-md flex items-center duration-500"
                  key={index}
                >
                  <img
                    src={item.image}
                    alt=""
                    className="absolute -start-10 w-40 h-40 rounded-full shadow-lg"
                  />
                  <div className="min-w-0 py-10 ps-36 pe-6">
                    <Link
                      to=""
                      className="text-lg font-medium hover:text-amber-400"
                    >
                      {item.name}
                    </Link>
                    <p className="text-slate-400">{item.title}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
