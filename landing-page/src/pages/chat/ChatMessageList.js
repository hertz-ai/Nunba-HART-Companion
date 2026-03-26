/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import SetupProgressCard from './SetupProgressCard';
import ThinkingProcessContainer from './ThinkingProcessContainer';
import TypeWriterForSubtitle from './TypeWriterSubtitle';
import WorkflowFlowchart from './WorkflowFlowchart';

import hourglassAnimation from '../../assets/hourglass-lottie.json';

import Lottie from 'lottie-react';
import {FileText} from 'lucide-react';
import React, {useState, useEffect} from 'react';

const THINKING_VERBS = [
  'Analyzing',
  'Understanding',
  'Reasoning',
  'Composing',
  'Evaluating',
  'Exploring',
  'Connecting',
  'Synthesizing',
  'Reflecting',
  'Processing',
  'Interpreting',
  'Considering',
];

/** Cycles through verbs while the LLM is processing */
function CyclingVerb() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setIdx((i) => (i + 1) % THINKING_VERBS.length),
      2000
    );
    return () => clearInterval(id);
  }, []);
  return (
    <span
      key={idx}
      className="inline-block text-xs text-gray-400"
      style={{
        animation: 'verbFadeSwap 2s ease-in-out infinite',
      }}
    >
      {THINKING_VERBS[idx]}...
    </span>
  );
}

/**
 * ChatMessageList renders the scrollable list of chat messages.
 *
 * Extracted from Demopage.js to keep the main component focused on
 * orchestration logic rather than presentation.
 *
 * Props:
 *  - messages           Array of message objects
 *  - setMessages        State setter (needed for thinking-container toggles)
 *  - isRequestInFlight  Whether an HTTP request is currently pending
 *  - currentThinkingId  ID of the active thinking process (hides loading dots)
 *  - animatingMessageIndex  Index of the message currently animating (typewriter)
 *  - duration           Duration for the typewriter animation
 *  - isTextMode         Whether the chat is in text-only mode (no avatar video)
 *  - videoUrl           Current video URL (used for idle detection)
 *  - idleVideoUrl       The idle-loop video URL
 *  - progress           PDF upload progress percentage
 *  - messagesEndRef     Ref attached to the scroll-anchor div
 *  - onPdfClick         Callback when user clicks "View Uploaded PDF"
 *  - onImageClick       Callback when user clicks an uploaded image thumbnail
 *  - onImgError         Callback for broken image fallback
 *  - onRetryMessage     Callback to retry a failed message
 *  - onDeleteMessage    Callback to delete/cancel a message
 *  - setCodeContent     Callback to display code in the code viewer
 */
const ChatMessageList = ({
  messages,
  setMessages,
  isRequestInFlight,
  currentThinkingId,
  animatingMessageIndex,
  duration,
  isTextMode,
  videoUrl,
  idleVideoUrl,
  progress,
  messagesEndRef,
  onPdfClick,
  onImageClick,
  onImgError,
  onRetryMessage,
  onDeleteMessage,
  setCodeContent,
  onExecutePlan,
  onSetupLlm,
  onConfigureLlm,
}) => {
  const isIdleVideo = (url) => url === idleVideoUrl;

  return (
    <div className="w-full px-3 py-4 space-y-6">
      {messages.map((message, index) => {
        if (message.type === 'thinking_container') {
          return (
            <ThinkingProcessContainer
              key={`thinking-container-${message.id}-${index}`}
              thinkingMessages={message.thinkingSteps}
              isMainExpanded={message.isMainExpanded}
              isContainerCompleted={message.isCompleted}
              onToggleMain={() => {
                setMessages((prev) =>
                  prev.map((msg, msgIndex) =>
                    msgIndex === index
                      ? {
                          ...msg,
                          isMainExpanded: !msg.isMainExpanded,
                        }
                      : msg
                  )
                );
              }}
              onToggleIndividual={(stepId) => {
                setMessages((prev) =>
                  prev.map((msg, msgIndex) =>
                    msgIndex === index
                      ? {
                          ...msg,
                          thinkingSteps: msg.thinkingSteps.map((step) =>
                            step.id === stepId
                              ? {
                                  ...step,
                                  isExpanded: !step.isExpanded,
                                }
                              : step
                          ),
                        }
                      : msg
                  )
                );
              }}
            />
          );
        }

        if (message.type === 'workflow_flowchart' && message.recipe) {
          return (
            <WorkflowFlowchart
              key={`flowchart-${message.promptId || index}`}
              recipe={message.recipe}
            />
          );
        }

        if (message.type === 'setup_progress') {
          return (
            <SetupProgressCard
              key={`setup-${message.jobType || index}`}
              steps={message.steps || []}
              jobType={message.jobType || ''}
              isComplete={message.isComplete || false}
            />
          );
        }

        if (message.type === 'llm_setup_card' && message.setupCard) {
          const card = message.setupCard;
          const sizeMb = card.size_mb;
          const sizeLabel =
            sizeMb >= 1024
              ? `${(sizeMb / 1024).toFixed(1)} GB`
              : `${sizeMb} MB`;
          return (
            <div
              key={`llm-setup-${index}`}
              className="rounded-lg p-6 shadow-sm animate-slide-in-left"
              style={{
                maxWidth: '75%',
                backgroundColor: '#1a2332',
                color: '#FFFFFF',
                border: '1px solid #6C63FF',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  style={{
                    color: '#6C63FF',
                    fontWeight: 'bold',
                    fontSize: '1.1em',
                  }}
                >
                  Local LLM Setup
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor:
                      card.gpu_mode === 'GPU' ? '#4CAF5033' : '#FF980033',
                    color: card.gpu_mode === 'GPU' ? '#4CAF50' : '#FF9800',
                  }}
                >
                  {card.gpu_mode}
                </span>
              </div>
              {message.content && (
                <p className="text-sm text-gray-300 mb-3">{message.content}</p>
              )}
              <div className="text-sm space-y-1 mb-4" style={{color: '#ccc'}}>
                <div>
                  <strong>Model:</strong> {card.model_name}
                </div>
                <div>
                  <strong>Size:</strong> {sizeLabel}
                </div>
                <div>
                  <strong>Details:</strong> {card.description}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => onSetupLlm?.(card)}
                  disabled={isRequestInFlight}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: isRequestInFlight ? '#4a4a4a' : '#6C63FF',
                    color: '#fff',
                    cursor: isRequestInFlight ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isRequestInFlight ? 'Setting up...' : 'Auto Setup'}
                </button>
                <button
                  onClick={() => onConfigureLlm?.()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: 'transparent',
                    color: '#999',
                    border: '1px solid #555',
                    cursor: 'pointer',
                  }}
                >
                  I'll Configure
                </button>
              </div>
            </div>
          );
        }

        if (message.type === 'plan_card' && message.plan) {
          const plan = message.plan;
          return (
            <div
              key={`plan-card-${index}`}
              className="rounded-lg p-6 shadow-sm animate-slide-in-left"
              style={{
                maxWidth: '75%',
                backgroundColor: '#1a2332',
                color: '#FFFFFF',
                border: '1px solid #6C63FF',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  style={{
                    color: '#6C63FF',
                    fontWeight: 'bold',
                    fontSize: '1.1em',
                  }}
                >
                  Proposed Plan
                </span>
                {plan.matched_agent_id && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{backgroundColor: '#6C63FF33', color: '#6C63FF'}}
                  >
                    Agent matched
                  </span>
                )}
                {plan.requires_new_agent && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{backgroundColor: '#FF6B6B33', color: '#FF6B6B'}}
                  >
                    New agent needed
                  </span>
                )}
              </div>
              {message.content && (
                <p className="text-sm text-gray-300 mb-3">{message.content}</p>
              )}
              <ol className="space-y-2 mb-4">
                {(plan.steps || []).map((step) => (
                  <li
                    key={step.step_num}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{backgroundColor: '#6C63FF', color: '#fff'}}
                    >
                      {step.step_num}
                    </span>
                    <span>{step.description}</span>
                  </li>
                ))}
              </ol>
              <div className="flex gap-3">
                <button
                  onClick={() => onExecutePlan?.(plan, message.prompt_id)}
                  disabled={isRequestInFlight}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: isRequestInFlight ? '#4a4a4a' : '#6C63FF',
                    color: '#fff',
                    cursor: isRequestInFlight ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isRequestInFlight ? 'Executing...' : 'Execute Plan'}
                </button>
                <button
                  onClick={() => {
                    // Remove the plan card and let user rephrase
                    setMessages((prev) => prev.filter((_, i) => i !== index));
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: 'transparent',
                    color: '#999',
                    border: '1px solid #555',
                    cursor: 'pointer',
                  }}
                >
                  Modify
                </button>
              </div>
            </div>
          );
        }

        return (
          <div key={index}>
            <div
              className={`rounded-lg p-6 shadow-sm overflow-visible ${message.type === 'user' ? 'animate-slide-in-right' : 'animate-slide-in-left'}`}
              style={{
                maxWidth: '75%',
                backgroundColor:
                  message.type === 'user' ? '#EFEAAA' : '#212A31',
                color: message.type === 'user' ? '#000000' : '#FFFFFF',
                animationDelay: `${Math.min(index * 30, 300)}ms`,
                animationFillMode: 'both',
              }}
            >
              <div className="flex-1 space-y-4">
                <div
                  className={
                    message.type === 'user'
                      ? 'text-black font-bold'
                      : 'text-white'
                  }
                >
                  {message.type === 'user' && (
                    <div className="space-y-2">
                      <div>{message.content}</div>

                      {message.pdf && (
                        <div className="flex flex-col gap-2 mt-2">
                          <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-gray-500" />
                            <span className="text-sm text-gray-700">
                              Understanding the Content: {progress}%
                            </span>
                          </div>

                          <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 transition-all duration-300 ease-out rounded-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(0, progress)
                                )}%`,
                              }}
                            />
                          </div>

                          <button
                            onClick={() => onPdfClick(message.pdf)}
                            className="text-blue-600 hover:text-blue-800 underline flex items-center gap-2"
                          >
                            <FileText className="w-5 h-5" />
                            View Uploaded PDF
                          </button>
                        </div>
                      )}

                      {message.image && (
                        <div className="mt-2">
                          <img
                            src={message.image}
                            alt="Uploaded"
                            className="w-16 h-16 rounded-lg shadow-md cursor-pointer"
                            onClick={() => onImageClick(message.image)}
                            onError={onImgError}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {message.type === 'assistant' && (
                    <>
                      {isTextMode ? (
                        <div>{message.content}</div>
                      ) : animatingMessageIndex === index && duration > 0 ? (
                        <TypeWriterForSubtitle
                          text={message.content}
                          duration={duration}
                          isIdle={isIdleVideo(videoUrl)}
                        />
                      ) : (
                        <div>{message.content}</div>
                      )}
                      {/* Intelligence source badge */}
                      {message.source && (
                        <div className="flex items-center gap-1 mt-2 opacity-50 text-xs">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: message.source?.includes('local')
                                ? '#2ECC71'
                                : '#6C63FF',
                            }}
                          />
                          {message.source?.includes('local') ? 'Local' : 'Hive'}
                        </div>
                      )}
                    </>
                  )}

                  {message.type === 'system' && (
                    <div className="text-center text-sm text-gray-400 italic">
                      {message.content}
                    </div>
                  )}
                </div>

                {message.code && (
                  <button
                    onClick={() => setCodeContent(message.code)}
                    className="bg-blue-500 text-white px-3 py-1 rounded-md"
                  >
                    Show Code
                  </button>
                )}
              </div>
            </div>

            {/* Message status — outside bubble */}
            {message.type === 'user' &&
              message.status &&
              message.status !== 'sent' && (
                <div className="mt-1 px-1" style={{maxWidth: '75%'}}>
                  <style>{`
                @keyframes sendDotPulse {
                  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                  40% { opacity: 1; transform: scale(1.2); }
                }
                @keyframes retrySpinner { to { transform: rotate(360deg); } }
              `}</style>

                  {message.status === 'retrying' && (
                    <div
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                      style={{
                        background: 'rgba(234, 179, 8, 0.08)',
                        border: '1px solid rgba(234, 179, 8, 0.15)',
                      }}
                    >
                      <span
                        className="inline-block w-3.5 h-3.5 rounded-full"
                        style={{
                          border: '2px solid #EAB308',
                          borderTopColor: 'transparent',
                          animation: 'retrySpinner 0.8s linear infinite',
                        }}
                      />
                      <span className="text-[11px] text-yellow-400/90 flex-1">
                        {message.error}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteMessage(message.messageId);
                        }}
                        className="text-[11px] text-gray-500 hover:text-red-400 transition-colors font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {message.status === 'failed' && (
                    <div
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                      style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.15)',
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        className="text-red-400 flex-shrink-0"
                      >
                        <circle
                          cx="7"
                          cy="7"
                          r="6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="none"
                        />
                        <path
                          d="M7 4v3.5M7 9.5v.01"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="text-[11px] text-red-400/90 flex-1">
                        {message.error}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRetryMessage(message.messageId);
                        }}
                        className="text-[11px] font-semibold text-red-300 hover:text-white px-2 py-0.5 rounded-md transition-all"
                        style={{background: 'rgba(239, 68, 68, 0.2)'}}
                      >
                        Retry
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteMessage(message.messageId);
                        }}
                        className="text-[11px] text-gray-500 hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
          </div>
        );
      })}

      {isRequestInFlight && !currentThinkingId && (
        <div className="flex items-center justify-start gap-2 py-2 px-1">
          <style>{`
            @keyframes verbFadeSwap {
              0% { opacity: 0; transform: translateY(4px); }
              15% { opacity: 1; transform: translateY(0); }
              85% { opacity: 1; transform: translateY(0); }
              100% { opacity: 0; transform: translateY(-4px); }
            }
          `}</style>
          <Lottie
            animationData={hourglassAnimation}
            loop
            style={{width: 24, height: 24}}
          />
          <CyclingVerb />
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessageList;
