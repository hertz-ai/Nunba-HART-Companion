/* eslint-disable import/order, valid-jsdoc, prefer-promise-reject-errors */
import React, {Component} from 'react';
import '../css/font-awesome.min.css';
import '../css/hevolveStyle.css';
import {CHATBOT_API_URL} from '../config/apiBase';
import {chatApi} from '../services/socialApi';
import {v4 as uuidv4} from 'uuid';

class HevolveDemo extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isOpen: false,
      BOT_IMG: `url("/bot.png")`,
      PERSON_IMG: `url("/bot.png")`,
      BOT_NAME: props.agentName || 'HBot',
      PERSON_NAME: 'User',
      assessment: 'False',
      question_no: 0,
      sending: false,
      agentStatus: null,
    };
    this.sendTextToBot = this.sendTextToBot.bind(this);
    this.get = this.get.bind(this);
    this.appendMessage = this.appendMessage.bind(this);
    this.botResponse = this.botResponse.bind(this);
    this.formatDate = this.formatDate.bind(this);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.agentName !== this.props.agentName) {
      this.setState({BOT_NAME: this.props.agentName || 'HBot'});
    }
  }

  /**
   * Determine whether to use the local agent chat API or the legacy chatbot API.
   * If promptId prop is provided, route through the local /chat endpoint.
   */
  isLocalAgent() {
    return !!(this.props.promptId || this.props.createAgent);
  }

  sendTextToBot(event) {
    event.preventDefault();

    const msgText = this.get('.msger-input').value;
    if (!msgText || this.state.sending) return;

    this.appendMessage(
      this.state.PERSON_NAME,
      this.state.PERSON_IMG,
      'right',
      msgText
    );
    this.get('.msger-input').value = '';
    this.setState({sending: true});

    if (this.isLocalAgent()) {
      this.sendToLocalAgent(msgText);
    } else {
      this.sendToLegacyBot(msgText);
    }
  }

  /** Send message to the local Flask /chat endpoint (agent pipeline) */
  sendToLocalAgent(msgText) {
    // Fallback chain aligned with NunbaChatProvider's storage-key
    // scoping — a truly-fresh guest should send user_id='guest', not
    // the literal '1' (which collapses every new install to the same
    // per-user bucket on the backend).  See J204 regression guard.
    //
    // `window.__NUNBA_GUEST_ID__` is the hardware-derived stable id
    // Flask injects so a WebView2 cache wipe (uninstall/reinstall)
    // doesn't mint a fresh guest on the same hardware — J201.
    const hwGuestId =
      (typeof window !== 'undefined' && window.__NUNBA_GUEST_ID__) || null;
    const userId =
      this.props.userId ||
      localStorage.getItem('hevolve_access_id') ||
      localStorage.getItem('guest_user_id') ||
      hwGuestId ||
      'guest';
    const promptId = this.props.promptId || 0;

    const payload = {
      user_id: userId,
      prompt_id: promptId,
      prompt: msgText,
    };
    if (this.props.createAgent) {
      payload.create_agent = true;
    }

    chatApi
      .chat(payload)
      .then((data) => {
        const reply = data.response || data.text || 'No response';
        this.setState({agentStatus: data.Agent_status || null});
        this.botResponse(reply);
      })
      .catch((err) => {
        const errMsg = err?.error || err?.message || 'Failed to reach agent';
        this.botResponse('[Error] ' + errMsg);
      })
      .finally(() => {
        this.setState({sending: false});
      });
  }

  /** Send message to the legacy external chatbot API */
  sendToLegacyBot(msgText) {
    const dataToSend = JSON.stringify({
      request_id: uuidv4(),
      text: msgText,
      user_id: 1,
      teacher_avatar_id: 1,
      video_req: false,
      conversation_id: 'random text',
    });

    fetch(CHATBOT_API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: dataToSend,
    })
      .then((resp) => {
        if (resp.ok) {
          return resp.json();
        }
        return Promise.reject('server');
      })
      .then((dataJson) => {
        this.setState({
          assessment: dataJson.assessment,
          question_no: dataJson.question_no,
        });
        const botReply = dataJson.text || dataJson.response || 'No response';
        this.botResponse(botReply);
      })
      .catch((err) => {
        if (err !== 'server') {
          this.botResponse('[Error] Could not reach server');
        }
      })
      .finally(() => {
        this.setState({sending: false});
      });
  }

  appendMessage(name, img, side, text) {
    const msgHTML = `
      <div class="msg ${side}-msg">
        <div class="msg-img"></div>
        <div class="msg-bubble">
          <div class="msg-info">
            <div class="msg-info-name">${name}</div>
            <div class="msg-info-time">${this.formatDate(new Date())}</div>
          </div>
          <div class="msg-text">${text}</div>
        </div>
      </div>
    `;

    const chatEl = this.get('.msger-chat');
    if (chatEl) {
      chatEl.insertAdjacentHTML('beforeend', msgHTML);
      chatEl.scrollTop = chatEl.scrollHeight;
    }
  }

  botResponse(msgText) {
    const delay = Math.min(msgText.split(' ').length * 100, 1500);
    setTimeout(() => {
      this.appendMessage(
        this.state.BOT_NAME,
        this.state.BOT_IMG,
        'left',
        msgText
      );
    }, delay);
  }

  get(selector, root = document) {
    return root.querySelector(selector);
  }

  formatDate(date) {
    const h = '0' + date.getHours();
    const m = '0' + date.getMinutes();
    return `${h.slice(-2)}:${m.slice(-2)}`;
  }

  render() {
    const headerTitle = this.props.createAgent
      ? `Creating Agent: ${this.state.BOT_NAME}`
      : this.isLocalAgent()
        ? `Chat with ${this.state.BOT_NAME}`
        : 'Teach me a Topic Chat';

    const statusBadge = this.state.agentStatus
      ? ` [${this.state.agentStatus}]`
      : '';

    const welcomeMsg = this.props.createAgent
      ? "Hi! I'll help you create a new agent. Tell me about what you want your agent to do."
      : this.isLocalAgent()
        ? `Hi! I'm ${this.state.BOT_NAME}. How can I help you?`
        : "Hi, Welcome to Hevolve! Let's start !!";

    return (
      <React.Fragment>
        <section className="msger">
          <header className="msger-header">
            <div
              style={{color: 'black', fontWeight: '500'}}
              className="msger-header-title"
            >
              <i className="fas fa-comment-alt"></i>
              {headerTitle}
              {statusBadge}
            </div>
            <div className="msger-header-options">
              {this.state.sending && (
                <span
                  style={{marginRight: 8, fontSize: '0.85em', color: '#999'}}
                >
                  typing...
                </span>
              )}
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
                  <div className="msg-info-name">{this.state.BOT_NAME}</div>
                </div>
                <div className="msg-text">{welcomeMsg}</div>
              </div>
            </div>
          </main>

          <form className="msger-inputarea" onSubmit={this.sendTextToBot}>
            <input
              type="text"
              className="msger-input"
              placeholder="Enter your message..."
              disabled={this.state.sending}
            ></input>
            <button
              type="submit"
              className="msger-send-btn"
              disabled={this.state.sending}
            >
              {this.state.sending ? '...' : 'Send'}
            </button>
          </form>
        </section>
      </React.Fragment>
    );
  }
}

export default HevolveDemo;
