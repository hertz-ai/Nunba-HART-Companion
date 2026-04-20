import autobahn from 'autobahn';
import axios from 'axios';

let connectionInstance = null;
let reconnectTimer = null;
let statusCheckInterval = null;
let isConnecting = false;
let connectionAttempts = 0;
let currentUserId = null;
let GlobalPromptId = null;
let currentRequestId = null;
let agentInstallationSuccess = true;
let hasReceivedActionRequest = false;
const MAX_RECONNECT_ATTEMPTS = 5;

const processedMessages = new Set();
let messageCleanupTimer = null;
let activeSubscriptions = new Map();

let isProcedureRegistered = {
  execute: false,
  screenshot: false,
  action: false,
};

let previousCompanionStatus = {
  isInstalled: null,
  isRunning: null,
  deviceId: null,
  logFile: null,
};

const logResponse = (type, data) => {
  const timestamp = new Date().toISOString();
  postWorkerMessage('LOG', {type, data, timestamp, userId: currentUserId});
};

const postWorkerMessage = (type, payload) => {
  try {
    postMessage({type, payload});
  } catch (error) {
    console.error('Error posting message:', error);
  }
};

const generateMessageId = (data, topic) => {
  if (data?.request_id) {
    return `${data.request_id}_${topic}`;
  }
  return `${Date.now()}_${topic}_${JSON.stringify(data).slice(0, 50)}`;
};

const cleanupProcessedMessages = () => {
  if (messageCleanupTimer) {
    clearInterval(messageCleanupTimer);
  }

  messageCleanupTimer = setInterval(
    () => {
      processedMessages.clear();
      logResponse('MESSAGE_CLEANUP', {clearedCount: processedMessages.size});
    },
    5 * 60 * 1000
  );
};

const checkCompanionAppStatus = async () => {
  try {
    const response = await axios.get('http://localhost:5000/status');
    logResponse('COMPANION_STATUS_RESPONSE', response.data);

    const isOperational = response.data.status === 'operational';
    const storedInstallationStatus =
      self.localStorage?.getItem('companionAppInstalled') === 'true';
    const finalInstallationStatus = storedInstallationStatus || true;

    if (!storedInstallationStatus) {
      postWorkerMessage('UPDATE_LOCAL_STORAGE', {
        key: 'companionAppInstalled',
        value: 'true',
      });
    }

    return {
      isInstalled: finalInstallationStatus,
      isRunning: isOperational,
      deviceId: response.data.device_id,
      logFile: response.data.log_file,
    };
  } catch (error) {
    logResponse('COMPANION_STATUS_ERROR', {error: error.message});

    const storedInstallationStatus =
      self.localStorage?.getItem('companionAppInstalled') === 'true';
    const finalInstallationStatus =
      storedInstallationStatus || previousCompanionStatus.isInstalled || false;

    return {
      isInstalled: finalInstallationStatus,
      isRunning: false,
      deviceId: null,
      logFile: null,
    };
  }
};

const hasStatusChanged = (newStatus, previousStatus) => {
  return (
    newStatus.isInstalled !== previousStatus.isInstalled ||
    newStatus.isRunning !== previousStatus.isRunning ||
    newStatus.deviceId !== previousStatus.deviceId
  );
};

const handlePeriodicStatusCheck = async () => {
  try {
    // CHECK CONNECTION HEALTH EVERY 3 SECONDS
    const isConnected =
      connectionInstance &&
      connectionInstance.session &&
      connectionInstance.session.isOpen;

    console.log('🔍 Periodic status check - Connection health:', {
      hasInstance: !!connectionInstance,
      hasSession: !!connectionInstance?.session,
      isOpen: connectionInstance?.session?.isOpen,
      isConnecting,
    });

    if (!isConnected && !isConnecting) {
      console.log(
        '💔 Connection lost during status check, initiating reconnection'
      );
      logResponse('CONNECTION_LOST_DURING_STATUS_CHECK', {});
      console.log(currentUserId);
      handleReconnection(wsUri, currentUserId, GlobalPromptId, 8, 5000);
      return;
    } else if (isConnected) {
      console.log('✅ Connection healthy during status check');
      await verifyBaseTopic();
      await verifySubscriptions();
    }

    const currentStatus = await checkCompanionAppStatus();

    if (hasStatusChanged(currentStatus, previousCompanionStatus)) {
      console.log('📊 Companion status changed:', {
        previous: previousCompanionStatus,
        current: currentStatus,
      });
      logResponse('STATUS_CHANGED', {
        previous: previousCompanionStatus,
        current: currentStatus,
      });

      postWorkerMessage('COMPANION_STATUS_UPDATE', {
        ...currentStatus,
        promptId: GlobalPromptId,
        showUI: hasReceivedActionRequest,
        fromActionRequest: false,
      });

      agentInstallationSuccess = currentStatus.isInstalled;
      previousCompanionStatus = {...currentStatus};
    } else {
      if (Math.random() < 0.05) {
        console.log('📊 Companion status unchanged:', currentStatus);
      }
    }
  } catch (error) {
    console.log('💥 Error in periodic status check:', error.message);
    logResponse('PERIODIC_STATUS_CHECK_ERROR', {error: error.message});
  }
};

const startPeriodicStatusCheck = () => {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
  }

  statusCheckInterval = setInterval(() => {
    handlePeriodicStatusCheck();
  }, 3000);

  logResponse('PERIODIC_STATUS_CHECK_STARTED', {intervalMs: 3000});
  console.log('Started periodic companion app status checking every 3 seconds');
};

const stopPeriodicStatusCheck = () => {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
    statusCheckInterval = null;
    logResponse('PERIODIC_STATUS_CHECK_STOPPED', {});
    console.log('Stopped periodic companion app status checking');
  }
};

async function handleAction(args, kwargs, details) {
  const {action} = kwargs;
  console.log(details, args, kwargs, 'hi ramesh');
  const promptIDAction = args[0]?.prompt_id;
  console.log(args, 'hiiii');

  if (promptIDAction) {
    GlobalPromptId = promptIDAction;
    logResponse('PROMPT_ID_UPDATED', {promptId: GlobalPromptId});
    console.log('Received promptId:', GlobalPromptId);

    hasReceivedActionRequest = true;

    const initialStatus = await checkCompanionAppStatus();
    agentInstallationSuccess = initialStatus.isInstalled;
    previousCompanionStatus = {...initialStatus};

    postWorkerMessage('COMPANION_STATUS_UPDATE', {
      ...initialStatus,
      promptId: GlobalPromptId,
      showUI: true,
      fromActionRequest: true,
    });

    logResponse('COMPANION_APP_STATUS', {
      installed: initialStatus.isInstalled,
      deviceId: initialStatus.deviceId,
      promptId: GlobalPromptId,
      showUI: true,
      fromActionRequest: true,
    });

    if (connectionInstance && connectionInstance.session) {
      logResponse('REGISTERING_PROCEDURES_WITH_PROMPTID', {
        promptId: GlobalPromptId,
      });
      await registerProcedures(connectionInstance.session, currentUserId);
    }
  }

  try {
    const result = await performAction(currentUserId, action);
    console.log(
      `Action executed successfully for UserID=${currentUserId}, PromptID=${GlobalPromptId}:`,
      result
    );
    return result;
  } catch (error) {
    console.error(
      `Error handling action for UserID=${currentUserId}, PromptID=${GlobalPromptId}:`,
      error.message
    );
    throw error;
  }
}

const performAction = async (userId, action) => {
  logResponse('PERFORMING_ACTION', {userId, action, promptId: GlobalPromptId});

  return {
    status: 'success',
    message: `Action '${action}' performed for user ${userId} with promptId ${GlobalPromptId}`,
    data: {},
  };
};

const handleScreenshot = async (args) => {
  console.log(`screenshot() called with ${JSON.stringify(args)}`);
  logResponse('SCREENSHOT_PROCEDURE_CALLED', {args});

  try {
    const response = await axios.get('http://localhost:5000/screenshot', {
      responseType: 'arraybuffer',
    });

    const base64Image = Buffer.from(response.data, 'binary').toString('base64');

    console.log('Screenshot captured and encoded to base64');
    logResponse('SCREENSHOT_ENCODED', {
      size: base64Image.length,
      preview: base64Image.substring(0, 100) + '...',
    });

    return {
      base64_image: base64Image,
      success: true,
    };
  } catch (error) {
    logResponse('SCREENSHOT_PROCEDURE_ERROR', {error: error.message});
    return {
      success: false,
      error: error.message,
    };
  }
};

const handleExecute = async (args) => {
  console.log(`execute() called with ${JSON.stringify(args)}`);
  logResponse('EXECUTE_PROCEDURE_CALLED', {args});

  try {
    const payload = {command: args.flat()};
    console.log(`Payload: ${JSON.stringify(payload)}`);
    logResponse('PAYLOAD_LOGGED', {payload});

    const response = await axios.post('http://localhost:5000/execute', payload);
    logResponse('EXECUTE_RESPONSE_RECEIVED', {response: response.data});

    return response.data;
  } catch (error) {
    logResponse('EXECUTE_PROCEDURE_ERROR', {error: error.message});
    throw error;
  }
};

const executeAction = (actionData) => {
  logResponse('EXECUTING_ACTION', actionData);

  const {request_id, command} = actionData;

  if (!connectionInstance || !connectionInstance.session) {
    logResponse('ACTION_ERROR', 'No active WAMP session');
    postWorkerMessage('ACTION_ERROR', 'No active WAMP session');
    return;
  }

  if (!GlobalPromptId) {
    logResponse('ACTION_ERROR', 'Missing prompt ID for action execution');
    postWorkerMessage('ACTION_ERROR', 'Missing prompt ID for action execution');
    return;
  }

  const executeUri = `com.hertzai.hevolve.action.${GlobalPromptId}.${currentUserId}.win_exec`;
  const screenshotUri = `com.hertzai.hevolve.action.${GlobalPromptId}.${currentUserId}.win_screenshot`;
  console.log('screenshotUri:', screenshotUri);
  console.log('executeUri:', executeUri);

  logResponse('CALLING_RPC', {uri: executeUri, command});
  logResponse('CALLING_RPC', {uri: screenshotUri, command});
};

const handleTopicData = (data, topic) => {
  try {
    logResponse('RECEIVED_DATA', {topic, data});

    const messageId = generateMessageId(data, topic);
    if (processedMessages.has(messageId)) {
      logResponse('DUPLICATE_MESSAGE_SKIPPED', {messageId, topic});
      return;
    }
    processedMessages.add(messageId);

    if (data?.percentage !== undefined) {
      postWorkerMessage('PROGRESS_UPDATE', data.percentage);
      logResponse('PROGRESS', {percentage: data.percentage, from: topic});
      return;
    }

    let processedData = data;

    if (typeof data === 'string') {
      logResponse('STRING_DATA', {data, from: topic});
      try {
        const cleanedData = data.replace(/'/g, '"').replace(/None/g, 'null');
        processedData = JSON.parse(cleanedData);
        logResponse('PARSED_DATA', {data: processedData, from: topic});
      } catch (parseError) {
        logResponse('PARSE_ERROR', {
          error: parseError.message,
          data,
          from: topic,
        });
        processedData = data;
      }
    }

    postWorkerMessage('DATA_RECEIVED', {
      data: processedData,
      sourceTopic: topic,
      messageId: messageId,
    });

    // Dispatch social events (notifications, votes, achievements) to dedicated handler
    if (topic.includes('hevolve.social.')) {
      postWorkerMessage('SOCIAL_EVENT', processedData);
    }

    // Dispatch pupit/TTS audio events — realtimeService picks these up for NunbaChat
    if (topic.includes('pupit.')) {
      postWorkerMessage('SOCIAL_EVENT', {type: 'pupit', data: processedData});
    }

    if (topic.includes('hevolve.action')) {
      logResponse('ACTION_TRIGGERED', {actionData: processedData});
      executeAction(processedData);
    }
  } catch (error) {
    logResponse('DATA_PROCESSING_ERROR', {error: error.message, topic});
    postWorkerMessage('ERROR', {
      message: 'Failed to process data',
      from: topic,
      error: error.message,
    });
  }
};

const subscribeToTopic = (session, topic) => {
  // CHECK IF ALREADY SUBSCRIBED
  if (activeSubscriptions && activeSubscriptions.has(topic)) {
    console.log('⚠️ Already subscribed to topic:', topic);
    logResponse('ALREADY_SUBSCRIBED', {topic});
    return Promise.resolve(activeSubscriptions.get(topic));
  }

  console.log('📡 Attempting to subscribe to topic:', topic);
  return new Promise((resolve, reject) => {
    try {
      session
        .subscribe(topic, (args) => {
          console.log('📨 Received message on topic:', topic, 'data:', args[0]);
          logResponse('RECEIVED_MESSAGE', {topic, data: args[0]});
          if (!Array.isArray(args) || args.length === 0) {
            console.log('❌ Invalid message format for topic:', topic);
            logResponse('INVALID_MESSAGE', {topic, args});
            return;
          }
          handleTopicData(args[0], topic);
        })
        .then(
          (subscription) => {
            // TRACK ACTIVE SUBSCRIPTION
            if (!activeSubscriptions) activeSubscriptions = new Map();
            activeSubscriptions.set(topic, subscription);
            console.log(
              '✅ Successfully subscribed to topic:',
              topic,
              'ID:',
              subscription.id
            );
            logResponse('SUBSCRIPTION_SUCCESS', {topic, id: subscription.id});
            resolve(subscription);
          },
          (error) => {
            console.log(
              '❌ Subscription failed for topic:',
              topic,
              'Error:',
              error.message
            );
            logResponse('SUBSCRIPTION_ERROR', {topic, error: error.message});
            reject(error);
          }
        );
    } catch (error) {
      console.log(
        '💥 Exception during subscription for topic:',
        topic,
        'Error:',
        error.message
      );
      logResponse('SUBSCRIPTION_EXCEPTION', {topic, error: error.message});
      reject(error);
    }
  });
};

const verifyBaseTopic = async () => {
  // 1. Make sure userId is available
  if (!currentUserId || typeof currentUserId !== 'string') {
    console.warn('⚠️ Skipping base topic check - currentUserId not ready yet');
    return;
  }

  // 2. Build topic from global
  const baseTopic = `com.hertzai.hevolve.action.${currentUserId}`;

  // 3. Ensure session is alive
  if (!connectionInstance?.session?.isOpen) {
    console.warn('⚠️ Session not open, cannot check base topic');
    return;
  }

  // 4. Check subscription
  const subscription = activeSubscriptions.get(baseTopic);

  if (subscription && subscription.active) {
    console.log(`✅ Base topic is alive121: ${baseTopic}`);
    logResponse('BASE_TOPIC_ALIVE', {topic: baseTopic});
  } else {
    console.log(`❌ Base topic not active, re-subscribing: ${baseTopic}`);
    try {
      await subscribeToTopic(connectionInstance.session, baseTopic);
      logResponse('BASE_TOPIC_RESUBSCRIBED', {topic: baseTopic});
    } catch (err) {
      console.error(
        `❌ Failed to re-subscribe base topic: ${baseTopic}`,
        err.message
      );
      logResponse('BASE_TOPIC_RESUBSCRIBE_FAILED', {
        topic: baseTopic,
        error: err.message,
      });
    }
  }
};

const verifySubscriptions = async () => {
  if (!connectionInstance?.session?.isOpen) return;

  for (const [topic, subscription] of activeSubscriptions.entries()) {
    if (subscription && subscription.active) {
      console.log(`✅ Topic is already alive 1: ${topic}`);
      logResponse('TOPIC_ALIVE', {topic});
    } else {
      console.log(`🔄 Re-subscribing to lost topic: ${topic}`);
      try {
        await subscribeToTopic(connectionInstance.session, topic);
        logResponse('RESUBSCRIBED_TOPIC', {topic});
      } catch (err) {
        console.error(`❌ Failed to re-subscribe to ${topic}:`, err.message);
        logResponse('RESUBSCRIBE_FAILED', {topic, error: err.message});
      }
    }
  }
};

const checkProcedureRegistration = async (session, uri) => {
  try {
    await session.call('wamp.registration.get', [uri]);
    return true;
  } catch (error) {
    if (error.error === 'wamp.error.no_such_registration') {
      return false;
    }
    logResponse('CHECK_REGISTRATION_ERROR', {uri, error: error.message});
    return false;
  }
};

const registerBaseActionTopic = async (session) => {
  const actionUri = `com.hertzai.hevolve.action.${currentUserId}`;
  console.log('Registering base action topic:', actionUri);

  try {
    const isRegistered = await checkProcedureRegistration(session, actionUri);

    if (!isRegistered) {
      logResponse('REGISTERING_BASE_ACTION_TOPIC', {uri: actionUri});
      await session.register(actionUri, handleAction);
      isProcedureRegistered.action = true;
      logResponse('BASE_ACTION_TOPIC_REGISTERED', {uri: actionUri});
      console.log('Successfully registered base action topic:', actionUri);
    } else {
      logResponse('BASE_ACTION_TOPIC_ALREADY_REGISTERED', {uri: actionUri});
      isProcedureRegistered.action = true;
      console.log('Base action topic already registered:', actionUri);
    }
  } catch (error) {
    if (error.error === 'wamp.error.procedure_already_exists') {
      isProcedureRegistered.action = true;
      logResponse('BASE_ACTION_TOPIC_ALREADY_EXISTS', {uri: actionUri});
      console.log('Base action topic already exists:', actionUri);
    } else {
      logResponse('BASE_ACTION_TOPIC_REGISTRATION_ERROR', {
        error: error.message,
      });
      console.log('Failed to register base action topic', error);
    }
  }
};

const registerProcedures = async (session, userId) => {
  if (!GlobalPromptId) {
    logResponse('WARNING_NO_PROMPT_ID_FOR_REGISTRATION', {userId});
    console.log('No promptId available, cannot register procedures');
    postWorkerMessage('WARNING', {
      message:
        'No prompt ID available for registration. Will use prompt ID from next action.',
      userId,
    });
    return;
  }

  const procedureUri = `com.hertzai.hevolve.action.${GlobalPromptId}.${currentUserId}.win_exec`;
  const screenshotUri = `com.hertzai.hevolve.action.${GlobalPromptId}.${currentUserId}.win_screenshot`;

  console.log('Registering procedures with promptId:', GlobalPromptId);
  console.log('procedureUri:', procedureUri);
  console.log('screenshotUri:', screenshotUri);
  logResponse('REGISTERING_WITH', {
    promptId: GlobalPromptId,
    userId: currentUserId,
  });

  try {
    isProcedureRegistered.screenshot = await checkProcedureRegistration(
      session,
      screenshotUri
    );

    if (!isProcedureRegistered.screenshot) {
      logResponse('REGISTERING_PROCEDURE', {
        procedure: 'screenshot',
        uri: screenshotUri,
      });
      await session.register(screenshotUri, handleScreenshot);
      isProcedureRegistered.screenshot = true;
      logResponse('PROCEDURE_REGISTERED', {
        procedure: 'screenshot',
        uri: screenshotUri,
      });
      console.log(
        'Successfully registered screenshot procedure:',
        screenshotUri
      );
    } else {
      logResponse('PROCEDURE_ALREADY_REGISTERED', {
        procedure: 'screenshot',
        uri: screenshotUri,
      });
      console.log('Screenshot procedure already registered:', screenshotUri);
    }
  } catch (error) {
    if (error.error === 'wamp.error.procedure_already_exists') {
      isProcedureRegistered.screenshot = true;
      logResponse('PROCEDURE_ALREADY_EXISTS', {
        procedure: 'screenshot',
        uri: screenshotUri,
      });
      console.log('Screenshot procedure already exists:', screenshotUri);
    } else {
      logResponse('PROCEDURE_REGISTRATION_ERROR', {
        procedure: 'screenshot',
        error: error.message,
      });
      console.log('Failed to register screenshot procedure', error);
    }
  }

  try {
    isProcedureRegistered.execute = await checkProcedureRegistration(
      session,
      procedureUri
    );

    if (!isProcedureRegistered.execute) {
      logResponse('REGISTERING_PROCEDURE', {
        procedure: 'execute',
        uri: procedureUri,
      });
      await session.register(procedureUri, handleExecute);
      isProcedureRegistered.execute = true;
      logResponse('PROCEDURE_REGISTERED', {
        procedure: 'execute',
        uri: procedureUri,
      });
      console.log('Successfully registered execute procedure:', procedureUri);
    } else {
      logResponse('PROCEDURE_ALREADY_REGISTERED', {
        procedure: 'execute',
        uri: procedureUri,
      });
      console.log('Execute procedure already registered:', procedureUri);
    }
  } catch (error) {
    if (error.error === 'wamp.error.procedure_already_exists') {
      isProcedureRegistered.execute = true;
      logResponse('PROCEDURE_ALREADY_EXISTS', {
        procedure: 'execute',
        uri: procedureUri,
      });
      console.log('Execute procedure already exists:', procedureUri);
    } else {
      logResponse('PROCEDURE_REGISTRATION_ERROR', {
        procedure: 'execute',
        error: error.message,
      });
      console.log('Failed to register execute procedure', error);
    }
  }

  if (isProcedureRegistered.screenshot && isProcedureRegistered.execute) {
    console.log(
      'REGISTRATION SUCCESSFUL: Both procedures registered successfully!'
    );
    logResponse('ALL_PROCEDURES_REGISTERED', {
      promptId: GlobalPromptId,
      userId: currentUserId,
      procedures: [procedureUri, screenshotUri],
    });
  }
};

let _wampTicket = '';

async function fetchWampTicket() {
  try {
    const res = await axios.get('http://localhost:5000/api/wamp/ticket');
    _wampTicket = res.data?.ticket || '';
    logResponse('WAMP_TICKET_FETCHED', {hasTicket: !!_wampTicket});
  } catch (err) {
    _wampTicket = '';
    logResponse('WAMP_TICKET_FETCH_FAILED', {error: err.message});
  }
}

function initCrossbar({
  wsUri,
  userId,
  maxRetries = 8,
  retryDelay = 5000,
  currentRequestId,
}) {
  currentUserId = userId;
  console.log('Effective userId:', userId, currentRequestId);

  if (
    connectionInstance &&
    connectionInstance.session &&
    connectionInstance.session.isOpen
  ) {
    console.log(
      '⚠️ Connection already exists and is open, skipping initialization'
    );
    return;
  }

  if (isConnecting) {
    console.log('⚠️ Connection attempt already in progress');
    return;
  }

  isConnecting = true;
  logResponse('WAITING_FOR_PROMPT_ID', {userId});
  logResponse('INIT_CONNECTION', {userId, wsUri});

  try {
    if (connectionInstance) {
      console.log('🔄 Closing existing connection');
      connectionInstance.close();
    }

    isProcedureRegistered = {
      execute: false,
      screenshot: false,
      action: false,
    };

    cleanupProcessedMessages();

    // Build connection options — use ticket auth when ticket is available
    const connOpts = {
      url: wsUri,
      realm: 'realm1',
      retry_if_unreachable: false,
      max_retries: 0,
      debug: true,
      protocols: ['wamp.2.json'],
    };

    if (_wampTicket) {
      connOpts.authmethods = ['ticket'];
      connOpts.authid = userId || 'client';
      connOpts.onchallenge = (session, method) => {
        if (method === 'ticket') {
          return _wampTicket;
        }
        throw new Error('Unsupported auth method: ' + method);
      };
    }

    connectionInstance = new autobahn.Connection(connOpts);

    connectionInstance.onopen = async (session) => {
      isConnecting = false;
      connectionAttempts = 0;
      logResponse('CONNECTION_OPEN', {sessionId: session.id});
      postWorkerMessage('CONNECTION_STATUS', 'Connected');

      startPeriodicStatusCheck();

      try {
        console.log('Connection opened, registering base action topic...');
        await registerBaseActionTopic(session);
      } catch (error) {
        logResponse('REGISTER_BASE_ACTION_TOPIC_ERROR', {error: error.message});
        console.log('Failed to register base action topic:', error);
      }

      const topics = [
        `com.hertzai.pupit.${userId}`,
        `com.hertzai.hevolve.analogy.${userId}`,
        `com.hertzai.hevolve.chat.${userId}`,
        `com.hertzai.hevolve.${userId}`,
        `com.hertzai.bookparsing.${userId}`,
        `com.hertzai.hevolve.social.${userId}`,
        `com.hertzai.hevolve.channel.response.${userId}`,
        `com.hertzai.hevolve.channel.presence.${userId}`,
        `com.hertzai.hevolve.hive.${userId}`,
      ];

      const uniqueTopics = [...new Set(topics)];
      const subscriptionPromises = uniqueTopics.map((topic) =>
        subscribeToTopic(session, topic)
      );

      try {
        const subscriptions = await Promise.allSettled(subscriptionPromises);

        subscriptions.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            logResponse('TOPIC_SUBSCRIBED', {
              topic: uniqueTopics[index],
              status: 'success',
            });
          } else {
            logResponse('TOPIC_SUBSCRIPTION_FAILED', {
              topic: uniqueTopics[index],
              reason: result.reason?.message || 'Unknown error',
            });
          }
        });
      } catch (error) {
        logResponse('SUBSCRIPTION_PROCESS_ERROR', error.message);
      }
    };

    connectionInstance.onclose = async (reason, details) => {
      console.log('🔌 Connection closed:', reason, details);
      isConnecting = false;
      hasReceivedActionRequest = false;
      logResponse('CONNECTION_CLOSED', {reason, details});
      console.log('📤 Posted connection status: Disconnected');
      postWorkerMessage('CONNECTION_STATUS', 'Disconnected');

      console.log('⏹️ Stopping periodic status check');
      stopPeriodicStatusCheck();

      if (messageCleanupTimer) {
        console.log('🧹 Clearing message cleanup timer');
        clearInterval(messageCleanupTimer);
      }

      // CLEAR SUBSCRIPTIONS AND PROCEDURES ON DISCONNECT
      console.log('🗑️ Clearing active subscriptions and procedures');
      activeSubscriptions?.clear();
      isProcedureRegistered = {
        execute: false,
        screenshot: false,
        action: false,
      };
      logResponse('CLEARED_SUBSCRIPTIONS_AND_PROCEDURES', {reason, details});
      console.log('✅ Reset subscription and procedure tracking');

      if (reason !== 'closed') {
        console.log('🔄 Initiating reconnection for reason:', reason);
        handleReconnection(
          wsUri,
          userId,
          GlobalPromptId,
          maxRetries,
          retryDelay
        );
      } else {
        console.log('✋ Connection intentionally closed, no reconnection');
      }
    };

    connectionInstance.open();
  } catch (error) {
    logResponse('CONNECT_ERROR', error.message);
    isConnecting = false;
    postWorkerMessage('ERROR', {
      message: 'Connection failed',
      error: error.message,
    });
  }
}

function publishConfirmation(userId, currentRequestId) {
  if (
    connectionInstance &&
    connectionInstance.session &&
    connectionInstance.session.isOpen
  ) {
    const topicToPublish = `com.hertzai.hevolve.confirmation`;

    const payload = {
      userId: userId,
      request_id: currentRequestId,
      topic: 'com.hertzai.hevolve.chat',
    };

    connectionInstance.session.publish(topicToPublish, [payload]);
    console.log('Published confirmation:', payload);
  } else {
    console.warn('Cannot publish confirmation: session not open.');
  }
}

function handleReconnection(wsUri, userId, promptId, maxRetries, retryDelay) {
  if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logResponse('RECONNECT_FAILED', 'Max reconnection attempts reached');
    postWorkerMessage('CONNECTION_STATUS', 'Failed');
    return;
  }

  connectionAttempts++;
  const backoffDelay = retryDelay * Math.pow(1.5, connectionAttempts - 1);
  logResponse('RECONNECT_SCHEDULED', {
    attempt: connectionAttempts,
    delay: backoffDelay,
  });

  reconnectTimer = setTimeout(() => {
    if (!isConnecting) {
      initCrossbar({wsUri, userId, promptId, maxRetries, retryDelay});
    }
  }, backoffDelay);
}

onmessage = function (e) {
  const {type, payload} = e.data;
  logResponse('RECEIVED_WORKER_MESSAGE', {type, payload});

  switch (type) {
    case 'INIT':
      logResponse('INIT_PAYLOAD', payload);
      // Fetch WAMP ticket before connecting (for LAN auth)
      fetchWampTicket().finally(() => {
        initCrossbar({
          wsUri: payload.wsUri,
          userId: payload.userId,
          promptId: payload.promptId,
          prompt_id: payload.prompt_id,
          maxRetries: payload.maxRetries,
          retryDelay: payload.retryDelay,
        });
      });
      break;

    case 'CHECK_COMPANION_STATUS':
      handlePeriodicStatusCheck();
      break;

    case 'SET_REQUEST_ID':
      currentRequestId = payload.request_Id;
      logResponse('REQUEST_ID_UPDATED', {requestId: currentRequestId});
      console.log('Worker updated with request ID:', currentRequestId);

      if (
        connectionInstance &&
        connectionInstance.session &&
        connectionInstance.session.isOpen
      ) {
        publishConfirmation(currentUserId, currentRequestId);
      }
      break;

    case 'CLOSE':
      logResponse('CLOSING_CONNECTION', {userId: currentUserId});

      stopPeriodicStatusCheck();

      if (messageCleanupTimer) {
        clearInterval(messageCleanupTimer);
      }
      processedMessages.clear();

      hasReceivedActionRequest = false;

      if (connectionInstance) {
        connectionInstance.close();
        connectionInstance = null;
      }

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      break;

    // ── Multiplayer Game Pub/Sub via WAMP ─────────────────────
    case 'GAME_SUBSCRIBE': {
      // Subscribe to a game session topic for real-time sync
      const {sessionId} = payload;
      const gameTopic = `com.hertzai.hevolve.game.${sessionId}`;
      if (connectionInstance?.session?.isOpen) {
        connectionInstance.session
          .subscribe(gameTopic, ([msg]) => {
            postWorkerMessage('GAME_EVENT', msg);
          })
          .then((sub) => {
            if (!activeSubscriptions) activeSubscriptions = new Map();
            activeSubscriptions.set(gameTopic, sub);
            logResponse('GAME_SUBSCRIBED', {sessionId, topic: gameTopic});
          })
          .catch((err) => {
            logResponse('GAME_SUBSCRIBE_ERROR', {error: err.message});
          });
      }
      break;
    }

    case 'GAME_PUBLISH': {
      // Publish a game move/event to all session participants
      const {sessionId: sid, event} = payload;
      const topic = `com.hertzai.hevolve.game.${sid}`;
      if (connectionInstance?.session?.isOpen) {
        connectionInstance.session.publish(
          topic,
          [event],
          {},
          {exclude_me: false}
        );
        logResponse('GAME_PUBLISHED', {sessionId: sid, eventType: event?.type});
      }
      break;
    }

    case 'GAME_UNSUBSCRIBE': {
      // Unsubscribe from a game session topic
      const {sessionId: usid} = payload;
      const utopic = `com.hertzai.hevolve.game.${usid}`;
      const sub = activeSubscriptions?.get(utopic);
      if (sub && connectionInstance?.session?.isOpen) {
        connectionInstance.session.unsubscribe(sub).catch(() => {});
        activeSubscriptions.delete(utopic);
        logResponse('GAME_UNSUBSCRIBED', {sessionId: usid});
      }
      break;
    }

    // ── Community Real-Time Pub/Sub via WAMP ─────────────────────
    case 'COMMUNITY_SUBSCRIBE': {
      const {communityId} = payload;
      const communityTopic = `com.hertzai.hevolve.community.${communityId}`;
      if (connectionInstance?.session?.isOpen) {
        connectionInstance.session
          .subscribe(communityTopic, ([msg]) => {
            postWorkerMessage('COMMUNITY_EVENT', {...msg, communityId});
          })
          .then((sub) => {
            if (!activeSubscriptions) activeSubscriptions = new Map();
            activeSubscriptions.set(communityTopic, sub);
            logResponse('COMMUNITY_SUBSCRIBED', {
              communityId,
              topic: communityTopic,
            });
          })
          .catch((err) => {
            logResponse('COMMUNITY_SUBSCRIBE_ERROR', {error: err.message});
          });
      }
      break;
    }

    case 'COMMUNITY_UNSUBSCRIBE': {
      const {communityId: ucid} = payload;
      const ucTopic = `com.hertzai.hevolve.community.${ucid}`;
      const cSub = activeSubscriptions?.get(ucTopic);
      if (cSub && connectionInstance?.session?.isOpen) {
        connectionInstance.session.unsubscribe(cSub).catch(() => {});
        activeSubscriptions.delete(ucTopic);
        logResponse('COMMUNITY_UNSUBSCRIBED', {communityId: ucid});
      }
      break;
    }

    default:
      logResponse('UNKNOWN_MESSAGE_TYPE', type);
  }
};
