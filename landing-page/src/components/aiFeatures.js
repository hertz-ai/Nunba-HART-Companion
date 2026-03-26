import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import RedeemIcon from '@mui/icons-material/Redeem';
import RepeatOnIcon from '@mui/icons-material/RepeatOn';
import SentimentSatisfiedAltIcon from '@mui/icons-material/SentimentSatisfiedAlt';
import React from 'react';

export default function AiFeatures() {
  const featureData = [
    {
      icon: RedeemIcon,
      title: 'Addressing Learning Difficulty Stigma and Inclusivity',
      desc: 'Our platform fosters inclusivity by addressing the learning difficulty stigma head-on.',
    },
    {
      icon: AccessTimeIcon,
      title: 'Prioritizing Understanding Over Consumption',
      desc: "It's not just about consuming content, it's about understanding.",
    },
    {
      icon: AutoStoriesIcon,
      title: 'Seamless Learning Experience',
      desc: 'Experience a learning journey like no other with our platform.',
    },
    {
      icon: SentimentSatisfiedAltIcon,
      title: 'Personalized Autonomy',
      desc: 'Our platform gives you the autonomy to learn on your own terms.',
    },
    {
      icon: RepeatOnIcon,
      title: 'Web App for AI Agents and Institutions',
      desc: 'Empowering educators with our web app tailored for seamless integration into educational institutions.',
    },
    {
      icon: PersonOutlineIcon,
      title: 'Ethical AI Implementation',
      desc: 'We prioritize ethical AI implementation to ensure fairness, transparency and accountability.',
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
            We are the present. We are the future!
          </h3>

          <p className="text-slate-400 max-w-xl mx-auto">
            Yes, we are not just shaping the future of education – we are the
            present, leading the charge toward a new era of learning and
            discovery. With our innovative AI platform, we're bridging the gap
            between the present and the future, empowering learners to thrive in
            an ever-evolving world.
          </p>
        </div>

        <div className="grid md:grid-cols-3 grid-cols-1 mt-6 gap-6">
          {featureData.map((item, index) => {
            const Icon = item.icon;
            return (
              <div className="group flex duration-500 xl:p-3" key={index}>
                <div
                  style={{
                    backgroundColor: '#00f0c5',
                    borderColor: '#FFFAE8',
                    transition: 'background-color 0.3s ease',
                  }}
                  className="flex align-middle justify-center items-center w-14 h-14 mt-1  border-2 group-hover:bg-#0197f7-400   rounded-lg text-2xl shadow-sm  duration-500"
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 ms-4">
                  <h4 className="mb-0 text-lg font-semibold">{item.title}</h4>
                  <p className="text-slate-400 mt-2">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
