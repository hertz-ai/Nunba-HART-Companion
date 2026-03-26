import client1 from '../../src/assets/images/client/Client1.jpg';
import client3 from '../../src/assets/images/client/Client3.jpg';
import client4 from '../../src/assets/images/client/Client4.jpg';
import client6 from '../../src/assets/images/client/Client6.jpg';
import monisha from '../assets/images/client/Monisha.png';
import Sahil from '../assets/images/client/Sahil.png';

import React from 'react';
import {Link} from 'react-router-dom';

export default function Clients() {
  const clientData = [
    {
      image: client1,
      name: 'Garv Soni',

      desc: 'Hevolve has revolutionized my learning experience! The AI-driven educational platform not only made icon design accessible, but the resources provided have turned me into a proficient designer. A must-try for anyone looking to enhance their skills.',
    },
    {
      image: Sahil,
      name: 'Sahil Kureshi',
      desc: "Hevolve stands out as a game-changer in the education sector. The interactive AI avatars provide engaging content, making learning enjoyable. The platform's versatility caters to various learning styles, ensuring a comprehensive educational experience.",
    },
    {
      image: client3,
      name: 'Suraj Mishra',
      desc: "Hevolve's intuitive interface and personalized learning paths have made a significant impact on my educational journey. The AI-driven recommendations ensure that I receive tailored content, enhancing my overall learning experience.",
    },
    {
      image: client4,
      name: 'Ramesh Nailwal',
      desc: 'Hevolve is revolutionizing the education landscape with its innovative approach. The dynamic AI avatars offer immersive learning experiences, transforming education into an enjoyable journey. With its adaptability to different learning styles, Hevolve ensures that every student receives a comprehensive and personalized education.',
    },
    {
      image: monisha,
      name: 'Monisha',
      desc: "I appreciate Hevolve's commitment to continuous improvement. Updates and new features are consistently rolled out, enhancing the overall user experience. The app has become an indispensable tool in my academic journey.",
    },
    {
      image: client6,
      name: 'Rajesh Gouda',
      desc: "Hevolve's dedication to constant enhancement is truly commendable. With regular updates and the introduction of new features, the platform continually elevates the user experience. It has undeniably become an integral part of my academic journey, providing invaluable support and resources.",
    },
  ];
  return (
    <>
      <div
        style={{marginBottom: '12rem'}}
        className="container relative md:mt-24 mt-16"
      >
        <div className="grid grid-cols-1 pb-6 text-center">
          <h3 className="mb-4 md:text-3xl md:leading-normal text-2xl leading-normal font-semibold">
            10000+ Human & AI Agents 1 Million Conversations Till Date
          </h3>

          <p className="text-slate-400 max-w-xl mx-auto">
            Hevolve has transformed the way we learn and teach. It's a
            game-changer in the education sector, providing innovative tools and
            resources for a seamless educational experience. Highly
            recommended!"
          </p>
        </div>

        <div className="grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1 mt-6 gap-6">
          {clientData.map((item, index) => {
            return (
              <div className="grid grid-cols-1 gap-6 h-fit" key={index}>
                <div className="rounded-lg shadow dark:shadow-gray-800 p-6 border-b-4 border-amber-400 bg-white dark:bg-slate-900 h-fit">
                  <div className="flex items-center pb-6 border-b border-gray-100 dark:border-gray-800">
                    <img
                      src={item.image}
                      className="h-16 w-16 rounded-full shadow dark:shadow-gray-800"
                      alt=""
                    />

                    <div className="ps-4">
                      <Link
                        to=""
                        className="text-lg hover:text-amber-400 duration-500 ease-in-out"
                      >
                        {item.name}
                      </Link>
                      <p className="text-slate-400">User</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <p className="text-slate-400">{item.desc}</p>
                    <ul className="list-none mb-0 text-amber-400 mt-2">
                      <li className="inline">
                        <i className="mdi mdi-star"></i>
                      </li>
                      <li className="inline">
                        <i className="mdi mdi-star"></i>
                      </li>
                      <li className="inline">
                        <i className="mdi mdi-star"></i>
                      </li>
                      <li className="inline">
                        <i className="mdi mdi-star"></i>
                      </li>
                      <li className="inline">
                        <i className="mdi mdi-star"></i>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
