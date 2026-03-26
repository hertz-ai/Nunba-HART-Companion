/* eslint-disable react-hooks/exhaustive-deps */
import {logger} from '../../utils/logger';

import React, {useState, useRef, useEffect, useMemo} from 'react';

const ThinkingProcessContainer = ({
  thinkingMessages,
  onToggleMain,
  onToggleIndividual,
  isMainExpanded,
  isContainerCompleted,
}) => {
  const thinkingContentRef = useRef(null);
  const [displayedTexts, setDisplayedTexts] = useState({});
  const [animatingSteps, setAnimatingSteps] = useState(new Set());
  const [fullyDisplayedSteps, setFullyDisplayedSteps] = useState(new Set());
  const [liveTime, setLiveTime] = useState(0);

  useEffect(() => {
    logger.log('ThinkingProcessContainer Debug:');
    logger.log('  - isContainerCompleted:', isContainerCompleted);
    logger.log('  - thinkingMessages length:', thinkingMessages.length);
    logger.log('  - thinkingMessages:', thinkingMessages);
    logger.log(
      '  - Individual step completion:',
      thinkingMessages.map((msg) => ({
        id: msg.id,
        isCompleted: msg.isCompleted,
      }))
    );
  }, [isContainerCompleted, thinkingMessages]);

  const isReallyCompleted = useMemo(() => {
    logger.log('Computing isReallyCompleted:');
    logger.log('  - isContainerCompleted prop:', isContainerCompleted);

    if (isContainerCompleted === true) {
      logger.log('  Completed via isContainerCompleted prop');
      return true;
    }

    if (thinkingMessages.length > 0) {
      const allStepsCompleted = thinkingMessages.every(
        (msg) => msg.isCompleted === true
      );
      logger.log('  - All steps completed:', allStepsCompleted);

      if (allStepsCompleted) {
        logger.log('  Completed via all steps completed');
        return true;
      }
    }

    logger.log('  Not completed - still thinking');
    return false;
  }, [isContainerCompleted, thinkingMessages]);

  useEffect(() => {
    if (isMainExpanded && thinkingContentRef.current) {
      if (isReallyCompleted) {
        setTimeout(() => {
          thinkingContentRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }, 100);
      } else {
        setTimeout(() => {
          thinkingContentRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'end',
          });
        }, 100);
      }
    }
  }, [isMainExpanded, isReallyCompleted, thinkingMessages.length]);

  useEffect(() => {
    if (isMainExpanded && !isReallyCompleted && thinkingMessages.length > 0) {
      setTimeout(() => {
        thinkingContentRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'end',
        });
      }, 200);
    }
  }, [thinkingMessages.length]);

  useEffect(() => {
    if (isReallyCompleted) {
      logger.log('Stopping timer - thinking completed');
      return;
    }

    const interval = setInterval(() => {
      setLiveTime((prev) => prev + 0.3);
    }, 300);

    return () => {
      clearInterval(interval);
    };
  }, [isReallyCompleted]);

  useEffect(() => {
    if (!isReallyCompleted && thinkingMessages.length > 0 && liveTime === 0) {
      logger.log('Starting new thinking session');
    }
  }, [thinkingMessages, isReallyCompleted, liveTime]);

  useEffect(() => {
    const initialTexts = {};
    thinkingMessages.forEach((msg) => {
      initialTexts[msg.id] = '';
    });
    setDisplayedTexts(initialTexts);
    setAnimatingSteps(new Set());
    setFullyDisplayedSteps(new Set());
  }, [thinkingMessages]);

  const handleManualToggle = (stepId) => {
    const message = thinkingMessages.find((msg) => msg.id === stepId);

    onToggleIndividual(stepId);

    if (message && !message.isExpanded && message.content) {
      setAnimatingSteps((prev) => new Set([...prev, stepId]));

      setDisplayedTexts((prev) => ({
        ...prev,
        [stepId]: '',
      }));

      let index = 0;
      const text = message.content;

      const timer = setInterval(() => {
        if (index < text.length) {
          setDisplayedTexts((prev) => ({
            ...prev,
            [stepId]: text.slice(0, index + 1),
          }));
          index++;
        } else {
          clearInterval(timer);
          setAnimatingSteps((prev) => {
            const newSet = new Set(prev);
            newSet.delete(stepId);
            return newSet;
          });
          setFullyDisplayedSteps((prev) => new Set([...prev, stepId]));
          setDisplayedTexts((prev) => ({
            ...prev,
            [stepId]: text,
          }));
        }
      }, 20);
    }
  };

  const formatDuration = (durationInSeconds) => {
    if (!durationInSeconds) return '';
    if (durationInSeconds < 1) {
      return `${Math.round(durationInSeconds * 1000)}ms`;
    } else if (durationInSeconds < 60) {
      return `${durationInSeconds.toFixed(1)}s`;
    } else {
      const minutes = Math.floor(durationInSeconds / 60);
      const seconds = Math.round(durationInSeconds % 60);
      return `${minutes}m ${seconds}s`;
    }
  };

  const formatLiveTime = (timeInSeconds) => {
    if (timeInSeconds < 1) {
      return `${Math.round(timeInSeconds * 1000)}ms`;
    } else if (timeInSeconds < 60) {
      return `${timeInSeconds.toFixed(1)}s`;
    } else {
      const minutes = Math.floor(timeInSeconds / 60);
      const seconds = Math.round(timeInSeconds % 60);
      return `${minutes}m ${seconds}s`;
    }
  };

  const shouldAutoScroll = (content) => {
    if (!content) return false;
    const words = content.trim().split(/\s+/).length;
    const lines = content.split('\n').length;
    return words > 30 || lines > 2;
  };

  const getCurrentThinkingPreview = () => {
    if (!thinkingMessages || thinkingMessages.length === 0) return '';

    const latestStep = thinkingMessages[thinkingMessages.length - 1];

    if (!latestStep || !latestStep.content) return '';

    const words = latestStep.content.trim().split(/\s+/);
    const preview = words.slice(0, 6).join(' ');

    return words.length > 6 ? `${preview}...` : preview;
  };

  const totalDuration = thinkingMessages.reduce(
    (sum, msg) => sum + (msg.duration || 0),
    0
  );
  const currentPreview = getCurrentThinkingPreview();

  useEffect(() => {
    logger.log('Final render state:', {
      isReallyCompleted,
      isContainerCompleted,
      liveTime,
      totalDuration,
      thinkingMessagesCount: thinkingMessages.length,
    });
  }, [
    isReallyCompleted,
    isContainerCompleted,
    liveTime,
    totalDuration,
    thinkingMessages.length,
  ]);

  return (
    <div className="border border-gray-300 rounded-lg mb-4 overflow-hidden bg-gray-50 animate-fade-in-up">
      <button
        onClick={onToggleMain}
        className="w-full p-4 bg-gray-50 hover:bg-gray-100 text-left flex items-center justify-between transition-colors group"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex gap-1 flex-shrink-0">
            {isReallyCompleted ? (
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  className="text-white"
                >
                  <path
                    d="M3 6L5 8L9 4"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            ) : (
              <>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-0"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-200"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-[400ms]"></div>
              </>
            )}
          </div>

          <div className="flex flex-col items-start min-w-0 flex-1">
            <span className="text-gray-700 font-medium flex-shrink-0">
              {isReallyCompleted
                ? 'Thought process (completed)'
                : 'Thought process'}
            </span>

            {!isMainExpanded && !isReallyCompleted && currentPreview && (
              <span className="text-xs text-gray-500 truncate max-w-full mt-1 font-mono">
                {currentPreview}
              </span>
            )}

            {!isMainExpanded &&
              isReallyCompleted &&
              (totalDuration > 0 || liveTime > 0) && (
                <span className="text-xs text-gray-500 mt-1">
                  {totalDuration > 0
                    ? formatDuration(totalDuration)
                    : formatLiveTime(liveTime)}
                </span>
              )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {!isReallyCompleted ? (
            <span className="text-xs text-gray-500 font-mono">
              {formatLiveTime(liveTime)}
            </span>
          ) : (
            <span className="text-xs text-green-600 font-mono">
              ✓{' '}
              {totalDuration > 0
                ? formatDuration(totalDuration)
                : formatLiveTime(liveTime)}
            </span>
          )}

          <div
            className={`transform transition-transform duration-200 ${
              isMainExpanded ? 'rotate-180' : ''
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="text-gray-500"
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </button>

      {isMainExpanded && (
        <div
          className="border-t border-gray-200 bg-white"
          ref={thinkingContentRef}
        >
          <div className="p-4 space-y-3">
            {!isReallyCompleted ? (
              <div className="flex justify-between items-center bg-blue-50 p-2 rounded-md">
                <span className="text-sm text-blue-700 font-medium">
                  Thinking in progress...
                </span>
                <span className="text-sm text-blue-700 font-mono">
                  {formatLiveTime(liveTime)}
                </span>
              </div>
            ) : (
              <div className="flex justify-between items-center bg-green-50 p-2 rounded-md">
                <span className="text-sm text-green-700 font-medium">
                  ✓ Thinking completed
                </span>
                <span className="text-sm text-green-700 font-mono">
                  {totalDuration > 0
                    ? formatDuration(totalDuration)
                    : formatLiveTime(liveTime)}
                </span>
              </div>
            )}

            {thinkingMessages.map((message, index) => (
              <div
                key={message.id}
                className="border border-gray-200 rounded-md overflow-hidden"
              >
                <button
                  onClick={() => handleManualToggle(message.id)}
                  className="w-full p-3 bg-gray-50 hover:bg-gray-100 text-left flex items-center justify-between transition-colors text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="flex gap-1 flex-shrink-0">
                      {message.isCompleted || isReallyCompleted ? (
                        <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 8 8"
                            fill="none"
                            className="text-white"
                          >
                            <path
                              d="M2 4L3.5 5.5L6 2.5"
                              stroke="white"
                              strokeWidth="1"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      ) : (
                        <>
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse delay-0"></div>
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse delay-200"></div>
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse delay-[400ms]"></div>
                        </>
                      )}
                    </div>
                    <span className="text-gray-600 font-medium flex-shrink-0">
                      Step {index + 1}
                    </span>
                    {!message.isExpanded && message.content && (
                      <span className="text-xs text-gray-500 truncate min-w-0 font-mono">
                        {message.content.slice(0, 50)}
                        {message.content.length > 50 ? '...' : ''}
                      </span>
                    )}
                  </div>

                  <div
                    className={`transform transition-transform duration-200 flex-shrink-0 ${
                      message.isExpanded ? 'rotate-180' : ''
                    }`}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      className="text-gray-400"
                    >
                      <path
                        d="M3 4.5L6 7.5L9 4.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </button>

                {message.isExpanded && (
                  <div className="border-t border-gray-200 bg-white">
                    <div
                      className={`p-3 ${
                        shouldAutoScroll(message.content)
                          ? 'max-h-40 overflow-y-auto'
                          : ''
                      }`}
                    >
                      <div className="text-gray-700 whitespace-pre-wrap font-mono text-xs leading-relaxed">
                        {(() => {
                          if (animatingSteps.has(message.id)) {
                            return (
                              <>
                                {displayedTexts[message.id] || ''}
                                {displayedTexts[message.id] &&
                                  displayedTexts[message.id].length <
                                    (message.content?.length || 0) && (
                                    <span className="animate-pulse">|</span>
                                  )}
                              </>
                            );
                          }

                          if (
                            message.isCompleted ||
                            fullyDisplayedSteps.has(message.id) ||
                            isReallyCompleted
                          ) {
                            return message.content;
                          }

                          if (displayedTexts[message.id]) {
                            return displayedTexts[message.id];
                          }

                          return message.content;
                        })()}
                      </div>
                      {message.duration && (
                        <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
                          Step duration: {formatDuration(message.duration)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {(totalDuration > 0 || liveTime > 0) && isReallyCompleted && (
              <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500 text-center">
                Total thinking time:{' '}
                {totalDuration > 0
                  ? formatDuration(totalDuration)
                  : formatLiveTime(liveTime)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThinkingProcessContainer;
