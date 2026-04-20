import {SnackbarContent} from '@mui/material';
import Container from '@mui/material/Container';
import Snackbar from '@mui/material/Snackbar';
import React, {useEffect, useState} from 'react';
import ModalVideo from 'react-modal-video';
import {Link, useLocation} from 'react-router-dom';
import {Modal, ModalHeader, ModalBody} from 'reactstrap';

import './font-awesome.min.css';
import './hevolvestyle.css';
import {CHATBOT_API_URL} from '../../config/apiBase';

import {v4 as uuidv4} from 'uuid';

import {logger} from '../../utils/logger';

const HevolveDemo = () => {
  const [isOpen, setIsOpen] = useState(false);
  const BOT_IMG = `url("../../assets/images/bot.png")`;
  const PERSON_IMG = `url('../../assets/images/bot.png)`;
  const BOT_NAME = 'HBot';
  const PERSON_NAME = 'User';
  const [assessment, setAssessment] = useState('False');
  const [questionNo, setQuestionNo] = useState(0);
  const BOT_MSGS = [
    'Hi, how are you?',
    "Ohh... I can't understand what you trying to say. Sorry!",
    "I like to play games... But I don't know how to play!",
    'Sorry if my answers are not relevant. :))',
    'I feel sleepy! :(',
  ];

  const location = useLocation();
  const {agentData} = location.state || {};
  logger.log(agentData);
  const sendTextToBot = (event) => {
    event.preventDefault();
    logger.log('Entered method sendTextToBot()');

    const msgText = document.querySelector('.msger-input').value;
    logger.log('The input text -> ' + msgText);
    if (!msgText) return;

    appendMessage(PERSON_NAME, PERSON_IMG, 'right', msgText);
    document.querySelector('.msger-input').value = '';

    const dataToSend = JSON.stringify({
      request_id: uuidv4(),
      text: msgText,
      user_id: 1,
      teacher_avatar_id: 1,
      video_req: false,
      conversation_id: 'random text',
    });
    logger.log(dataToSend);
    axios
      .post(CHATBOT_API_URL, dataToSend)
      .then((resp) => {
        if (resp.status === 200) {
          return resp.data;
        } else {
          logger.log('Status: ' + resp.status);
          logger.log(resp);
          return Promise.reject('server');
        }
      })
      .then((dataJson) => {
        logger.log(dataJson);
        setAssessment(dataJson.assessment);
        setQuestionNo(dataJson.question_no);
        const botReply = dataJson['text'];
        botResponse(botReply);
      })
      .catch((err) => {
        if (err === 'server') return;
        logger.log(err);
      });
  };

  const appendMessage = (name, img, side, text) => {
    const msgHTML = `
      <div class="msg ${side}-msg">
        <div class="msg-img" ></div>
        <div class="msg-bubble">
          <div class="msg-info">
            <div class="msg-info-name msg-text2">${name}</div>
            <div class="msg-info-time msg-text2">${formatDate(new Date())}</div>
          </div>
          <div class="msg-text msg-text2">${text}</div>
        </div>
      </div>
    `;

    get('.msger-chat').insertAdjacentHTML('beforeend', msgHTML);
    get('.msger-chat').scrollTop += 500;
  };

  const botResponse = (msgText) => {
    const delay = msgText.split(' ').length * 100;
    setTimeout(() => {
      appendMessage(BOT_NAME, BOT_IMG, 'left', msgText);
    }, delay);
  };

  const get = (selector, root = document) => {
    return root.querySelector(selector);
  };

  const formatDate = (date) => {
    const h = '0' + date.getHours();
    const m = '0' + date.getMinutes();
    return `${h.slice(-2)}:${m.slice(-2)}`;
  };

  const routeToContactUs = () => {
    document
      .querySelector(
        '#root > div > header > div.navbar-wrapper.navbar-fixed > div > div > div.navbar-nav-wrapper > ul > li:nth-child(10) > a'
      )
      .click();
  };

  const openModal = () => {
    logger.log('Entered method - openModal()');
    const videoPart = document.getElementById('videoPart');
    videoPart.style.animationFillMode = 'none';
    setIsOpen(true);
  };

  return (
    <React.Fragment>
      <section className="msger">
        <header className="msger-header">
          <div
            style={{color: 'black', fontWeight: '500'}}
            className="msger-header-title"
          >
            <i className="fas fa-comment-alt"></i> {agentData?.name}
          </div>
          <div className="msger-header-options">
            <span>
              <i className="fas fa-cog"></i>
            </span>
          </div>
        </header>

        <main className="msger-chat">
          <div className="msg left-msg">
            <div
              className="msg-img"
              style={{backgroundImage: `url("/bot.png")`}}
            ></div>
            <div className="msg-bubble">
              <div className="msg-info">
                <div style={{color: 'black'}} className="msg-info-name">
                  HBot
                </div>
              </div>
              <div style={{color: 'black'}} className="msg-text">
                Hi, Welcome to {agentData?.name}! Let's start !!
              </div>
            </div>
          </div>
        </main>

        <form className="msger-inputarea" onSubmit={sendTextToBot}>
          <input
            style={{color: 'black'}}
            type="text"
            className="msger-input"
            placeholder="Enter your message..."
          />
          <button type="submit" className="msger-send-btn">
            Send
          </button>
        </form>
      </section>
    </React.Fragment>
  );
};

export default HevolveDemo;
