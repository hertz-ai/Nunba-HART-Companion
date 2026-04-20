import Imageposter from '../assets/images/AgentPoster.png';
import {logger} from '../utils/logger';

import {faArrowRight} from '@fortawesome/free-solid-svg-icons';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import React from 'react';
import {useNavigate} from 'react-router-dom';


export default function Features({classlist}) {
  const navigate = useNavigate();
  const items = [
    {
      name: 'Personalised Learning',
      description:
        'https://azurekong.hertzai.com/mkt-azure/examples/17241c6b4cf56076-6cropped6083415096635437748_pred_fls_eea108c8_a0dc8712-5AudioCutter_But_what_is_a_GPT__Visual_intro_to_Transformers___Chapter_5_Deep_L_audio_embed.mp4',
      video_text: 'This is Static Description',
      prompt_id: 31,
      image_url:
        'http://aws_rasa.hertzai.com:5459/output/06a28a94-695b-11ef-afea-000d3af074c1.png',
      teacher_avatar_id: 2352,
      teacher_image_url:
        'https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/4cf56076-6cropped6083415096635437748.png',
      videos: {},
    },

    {
      name: 'Speech Therapist',
      description:
        'https://azurekong.hertzai.com/mkt-azure/examples/74eaec428f4c3958-9cropped_image_pred_fls_f4203dae_bf375f78-eLily_audio_embed.mp4',
      video_text: 'This is Static Description',
      prompt_id: 54,
      image_url:
        'http://aws_rasa.hertzai.com:5459/output/25dfe16e-a6a4-11ef-a097-42010aa00006.png',
      teacher_avatar_id: 2759,
      teacher_image_url:
        'https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/8f4c3958-9cropped_image.png',
      videos: {},
    },

    {
      name: 'Spoken English Agent',
      description:
        'https://azurekong.hertzai.com/mkt-azure/examples/77047ca627b62c6e-fcropped6488793763494973038_pred_fls_de571ca5_79b9078f-5Hindi_F_Tyagi_audio_embed.mp4',
      video_text: 'This is Static Description',
      prompt_id: 42,
      image_url:
        'https://azurekong.hertzai.com/mkt-azure/examples/2e22d428-0language.png',
      teacher_avatar_id: 1802,
      teacher_image_url:
        'https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/27b62c6e-fcropped6488793763494973038.png',
      videos: {},
    },

    {
      name: 'Casual Conversation',
      description:
        'https://azurekong.hertzai.com/mkt-aws/examples/6b0b571a0eb999d2-5cropped7430334565963533161_pred_fls_14acb2ce_a8a34380-6AUDIO20241017_112732_audio_embed.mp4',
      video_text: 'This is Static Description',
      prompt_id: 38,
      image_url:
        'http://aws_rasa.hertzai.com:5459/output/c85c3068-8c4c-11ef-bfda-42010aa00006.png',
      teacher_avatar_id: 2686,
      teacher_image_url:
        'https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/0eb999d2-5cropped7430334565963533161.png',
      videos: {},
    },

    {
      name: 'Revision assistance',
      description: null,
      video_text: 'This is Static Description',
      prompt_id: 48,
      image_url:
        'http://aws_rasa.hertzai.com:5459/output/8fc43ae2-a124-11ef-a35b-42010aa00006.png',
      teacher_avatar_id: 2735,
      teacher_image_url:
        'https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/cf9788e4-ccropped_image.png',
      videos: {},
    },

    {
      name: 'Vernacular Learning',
      description:
        'https://azurekong.hertzai.com/mkt-azure/examples/77047ca627b62c6e-fcropped6488793763494973038_pred_fls_de571ca5_79b9078f-5Hindi_F_Tyagi_audio_embed.mp4',
      video_text: 'This is Static Description',
      prompt_id: 17,
      image_url:
        'http://aws_rasa.hertzai.com:5459/output/a3ea1800-3de4-11ef-ad08-000d3af074c1.png',
      teacher_avatar_id: 1802,
      teacher_image_url:
        'https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/27b62c6e-fcropped6488793763494973038.png',
      videos: {},
    },
  ];

  const handleButtonClick = (agent) => {
    logger.log(agent);
    const agentName = agent.name.replace(/\s+/g, '-');
    if (agent.name === 'Personalised Learning') {
      navigate('/personalisedlearning', {state: {agentData: agent}});
    } else {
      navigate('/agents', {state: {agentData: agent}});
    }
  };
  return (
    <>
      <div style={{marginBottom: '12rem'}} className={classlist}>
        <div className="grid grid-cols-1 pb-6 text-center">
          <h3 className="mb-4 md:text-3xl md:leading-normal text-2xl leading-normal font-semibold">
            Human + Evolution + AI = HevolveAI{' '}
          </h3>
          <p className="text-slate-400 max-w-xl mx-auto">
            Taking Human Evolution To The Next Step With AI{' '}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 md:grid-cols-2 grid-cols-2 mt-6 gap-6">
          {items.map((item, index) => (
            <div
              style={{backgroundColor: '#212A31', border: '1px solid grey'}}
              className="relative overflow-hidden bg-white dark:bg-slate-900 rounded-md shadow dark:shadow-gray-800"
              key={index}
            >
              <div
                style={{backgroundColor: '#212A31'}}
                className=" pb-0 relative overflow-hidden after:content-[''] after:absolute after:inset-0 after:mx-auto after:w-72 after:h-72 after:rounded-full"
              >
                <img
                  src={
                    item.image_url.startsWith('http://aws_rasa.hertzai.com')
                      ? item.teacher_image_url
                      : Imageposter
                  }
                  className="relative rounded-t-md shadow-md dark:shadow-slate-700 z-1"
                  alt=""
                />
              </div>

              <div className="p-6">
                <h5 className="text-lg font-semibold">{item.name}</h5>
                <p className="text-slate-400 mt-3">{item.video_text}</p>
              </div>

              <div className="flex justify-center pb-4">
                <button
                  onClick={() => handleButtonClick(item)}
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-transform duration-300 transform hover:scale-110"
                >
                  Talk To Agent
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={() => navigate('/agents')}
            style={{color: 'black'}}
            className="px-4 py-2 bg-blue-600 rounded-lg transition-colors duration-300 hover:bg-blue-700 flex items-center"
          >
            View All Agents
            <FontAwesomeIcon icon={faArrowRight} style={{marginLeft: '10px'}} />
          </button>
        </div>
      </div>
    </>
  );
}
