import FirstGif from '../Gif/2.16.gif';
import SecondGif from '../Gif/3.20.gif';
import ThirdGif from '../Gif/3.40.gif';
import six from '../Gif/six.gif';
import TeachemeBook from '../Gif/teachmeBook.gif';
import verncular from '../Gif/verncular.gif';

import React from 'react';

export default function Features({classlist}) {
  const featuresData = [
    {
      image: ThirdGif,
      title: 'AI Generative Avatars.',
      desc: 'Engage in immersive learning experiences with AI generative avatars, powered by advanced algorithms that emulate human-like teaching and conversation.',
    },
    {
      image: SecondGif,
      title: 'Personalized Learning.',
      desc: "Experience education that's personalized just for you. Whether you're a visual learner, an auditory learner or somewhere in between, Hevolve adapts to your needs to ensure an effective and enjoyable learning journey.",
    },
    {
      image: FirstGif,
      title: 'Learn in Your Own Language.',
      desc: 'Break down language barriers and learn in a way that feels natural to you. Our platform offers vernacular teaching, allowing you to access educational content and interact with avatars in your preferred language.',
    },
    {
      image: verncular,
      title: 'Interactive Assessments.',
      desc: 'Enhance your learning experience with interactive assessments. Receive real-time feedback and track your progress, making your educational journey more engaging and effective.',
    },
    {
      image: TeachemeBook,
      title: 'Interactive Book Learning.',
      desc: 'Engage in interactive learning experiences with your uploaded books. The AI adapts to your learning style, offering a dynamic and personalized approach to studying the material in your books.',
    },
    {
      image: six,
      title: 'Adaptive Content Delivery.',
      desc: 'Enjoy a personalized learning experience with adaptive content delivery. Our platform tailors content based on your progress, ensuring you receive the right information at the right time.',
    },
  ];
  return (
    <>
      <div style={{marginBottom: '12rem'}} className={classlist}>
        <div className="grid grid-cols-1 pb-6 text-center">
          <h3 className="mb-4 md:text-3xl md:leading-normal text-2xl leading-normal font-semibold">
            AI Agents + Knowledge = HevolveAI{' '}
          </h3>

          <p className="text-slate-400 max-w-xl mx-auto">
            We are pioneering the AI-first approach to education, where
            artificial intelligence takes centre stage in transforming the
            learning experience.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1 mt-6 gap-6">
          {featuresData.map((item, index) => {
            return (
              <div
                style={{
                  backgroundColor: '#212A31 !important',
                  border: '1px solid grey',
                }}
                className="relative overflow-hidden bg-white dark:bg-slate-900 rounded-md shadow dark:shadow-gray-800"
                key={index}
              >
                <div
                  style={{backgroundColor: '#212A31 !important'}}
                  className="p-6 pb-0 relative overflow-hidden after:content-[''] after:absolute after:inset-0 after:mx-auto after:w-72 after:h-72  after:rounded-full"
                >
                  <img
                    src={item.image}
                    className="relative rounded-t-md shadow-md dark:shadow-slate-700 z-1"
                    alt=""
                  />
                </div>

                <div className="p-6">
                  <h5 className="text-lg font-semibold">{item.title}</h5>
                  <p className="text-slate-400 mt-3">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
