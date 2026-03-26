import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Loader,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import React, {useState, useEffect, useRef} from 'react';
import {EffectCoverflow} from 'swiper/modules';
import {Swiper, SwiperSlide} from 'swiper/react';

import 'swiper/css';
import 'swiper/css/effect-coverflow';
import {chatApi} from '../services/socialApi';
import {logger} from '../utils/logger';

function AIAssistantCarousel({userId}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const videoRefs = useRef({});
  const [videoStates, setVideoStates] = useState({});
  const swiperRef = useRef(null);

  // Hover state for individual cards
  const [hoveredCard, setHoveredCard] = useState(null);
  logger.log('🔑 User ID:123', userId);

  const fetchAssistants = async () => {
    try {
      setLoading(true);
      logger.log('🌐 Fetching assistants from API...');

      let allAssistants = [];

      const res = await chatApi.getPrompts(userId);
      const responseData = res || {};
      allAssistants = responseData.prompts || responseData || [];
      if (!Array.isArray(allAssistants)) allAssistants = [];
      logger.log(`📊 Assistants received: ${allAssistants.length}`);

      logger.log(`📊 Total merged assistants: ${allAssistants.length}`);

      // Filter assistants that have video content (existing logic)
      const validAssistants = allAssistants.filter((assistant) => {
        const hasName = assistant.name && assistant.name.trim() !== '';
        const hasIntroVideo = !!assistant.description;
        const hasIdleVideo =
          assistant.fillers &&
          assistant.fillers.length > 0 &&
          assistant.fillers.some((filler) => filler.video_link);

        return hasName && (hasIntroVideo || hasIdleVideo);
      });

      logger.log(`✅ Valid assistants found: ${validAssistants.length}`);
      setAssistants(validAssistants);
    } catch (err) {
      setError(err.message);
      console.error('❌ Error fetching assistants:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch assistants on component mount
  useEffect(() => {
    fetchAssistants();
  }, []);

  // Navigation functions
  const nextSlide = () => {
    if (swiperRef.current && swiperRef.current.swiper) {
      swiperRef.current.swiper.slideNext();
    }
  };

  const prevSlide = () => {
    if (swiperRef.current && swiperRef.current.swiper) {
      swiperRef.current.swiper.slidePrev();
    }
  };

  const toggleCenterVideo = (assistant, cardKey) => {
    const videoRef = videoRefs.current[cardKey];
    if (videoRef) {
      if (isPlaying) {
        logger.log(`⏸️ PAUSING CENTER CARD VIDEO: ${assistant.name}`);
        videoRef.pause();
      } else {
        logger.log(`▶️ RESUMING CENTER CARD VIDEO: ${assistant.name}`);
        videoRef.play().catch(console.error);
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleVideoDemo = (assistant) => {
    // Intro video is in description field, idle video is in fillers
    const introVideo = assistant.description;
    const idleVideo = assistant.fillers?.find(
      (filler) => filler.type === 'idle'
    )?.video_link;

    const demoVideo = introVideo || idleVideo;
    if (demoVideo) {
      window.open(demoVideo, '_blank');
    }
  };

  const handleVideoEnded = (cardKey, assistant) => {
    const introVideo = assistant.description;
    const idleVideo = assistant.fillers?.find(
      (filler) => filler.type === 'idle'
    )?.video_link;

    logger.log(`🎬 VIDEO ENDED: ${assistant.name}`);
    logger.log(`🎥 Intro Video URL: ${introVideo || 'N/A'}`);
    logger.log(`🔄 Idle Video URL: ${idleVideo || 'N/A'}`);

    // If intro video ended and idle video exists, switch to idle
    if (introVideo && idleVideo && videoStates[cardKey] === 'intro') {
      logger.log(`✅ INTRO VIDEO COMPLETED: ${assistant.name}`);
      logger.log(`🔄 NOW SWITCHING TO IDLE VIDEO: ${idleVideo}`);
      setVideoStates((prev) => ({...prev, [cardKey]: 'idle'}));

      // Small delay to ensure smooth transition
      setTimeout(() => {
        const videoRef = videoRefs.current[cardKey];
        if (videoRef && isPlaying) {
          logger.log(`▶️ THIS IS THE IDLE VIDEO NOW PLAYING: ${idleVideo}`);
          videoRef.play().catch(console.error);
        }
      }, 100);
    }
  };

  const getVideoSource = (assistant, cardKey) => {
    const introVideo = assistant.description;
    const idleVideo = assistant.fillers?.find(
      (filler) => filler.type === 'idle'
    )?.video_link;

    // Initialize video state if not set
    if (!videoStates[cardKey]) {
      if (introVideo) {
        setVideoStates((prev) => ({...prev, [cardKey]: 'intro'}));
        return introVideo;
      } else if (idleVideo) {
        setVideoStates((prev) => ({...prev, [cardKey]: 'idle'}));
        return idleVideo;
      }
    }

    // Return appropriate video based on current state
    if (videoStates[cardKey] === 'intro' && introVideo) {
      return introVideo;
    } else if (videoStates[cardKey] === 'idle' && idleVideo) {
      return idleVideo;
    } else if (idleVideo) {
      return idleVideo;
    } else if (introVideo) {
      return introVideo;
    }

    return null;
  };

  const shouldVideoLoop = (assistant, cardKey) => {
    const idleVideo = assistant.fillers?.find(
      (filler) => filler.type === 'idle'
    )?.video_link;
    const introVideo = assistant.description;

    // Loop if it's idle video or if only idle video exists
    return videoStates[cardKey] === 'idle' || (!introVideo && idleVideo);
  };

  // Handle slide change
  const handleSlideChange = (swiper) => {
    setCurrentIndex(swiper.realIndex);
    logger.log(`🔄 Slide changed to index: ${swiper.realIndex}`);

    // Pause all videos first
    Object.values(videoRefs.current).forEach((video) => {
      if (video) video.pause();
    });

    // Reset video states for new slide
    const newVideoStates = {};
    const currentAssistant = assistants[swiper.realIndex];
    if (currentAssistant) {
      const cardKey = `${currentAssistant.prompt_id}`;
      const introVideo = currentAssistant.description;
      const idleVideo = currentAssistant.fillers?.find(
        (filler) => filler.type === 'idle'
      )?.video_link;

      if (introVideo) {
        newVideoStates[cardKey] = 'intro';
      } else if (idleVideo) {
        newVideoStates[cardKey] = 'idle';
      }
    }
    setVideoStates(newVideoStates);

    // Only auto-play the CENTER card video
    const timer = setTimeout(() => {
      if (currentAssistant) {
        const cardKey = `${currentAssistant.prompt_id}`;
        const centerVideoRef = videoRefs.current[cardKey];

        const introVideo = currentAssistant.description;
        const idleVideo = currentAssistant.fillers?.find(
          (filler) => filler.type === 'idle'
        )?.video_link;

        logger.log(`🎯 CENTER CARD: ${currentAssistant.name}`);
        logger.log(`🎥 Intro Video URL: ${introVideo || 'N/A'}`);
        logger.log(`🔄 Idle Video URL: ${idleVideo || 'N/A'}`);

        if (centerVideoRef && isPlaying) {
          if (newVideoStates[cardKey] === 'intro' && introVideo) {
            logger.log(
              `▶️ THIS IS THE INTRO VIDEO OF CENTER CARD: ${introVideo}`
            );
          } else if (newVideoStates[cardKey] === 'idle' && idleVideo) {
            logger.log(
              `▶️ THIS IS THE IDLE VIDEO OF CENTER CARD: ${idleVideo} (no intro available)`
            );
          }
          centerVideoRef.play().catch(console.error);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-gray-900 to-black">
        <div className="text-center">
          <Loader className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Loading AI Assistants...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-gray-900 to-black">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">
            Error loading assistants: {error}
          </p>
          <button
            onClick={fetchAssistants}
            className="px-6 py-3 bg-white bg-opacity-20 hover:bg-opacity-30 text-white font-semibold rounded-lg transition-all duration-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // No assistants found
  if (assistants.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-gray-900 to-black">
        <div className="text-center">
          <p className="text-white text-lg">
            No valid assistants with video content found.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 overflow-x-hidden">
      <div className="max-w-full mx-auto w-full px-4">
        <div className="relative">
          {/* Carousel Container */}
          <div className="relative h-[450px] flex items-center justify-center mb-8">
            <Swiper
              ref={swiperRef}
              effect={'coverflow'}
              grabCursor={true}
              centeredSlides={true}
              slidesPerView={3}
              spaceBetween={-50}
              loop={assistants.length > 1}
              modules={[EffectCoverflow]}
              coverflowEffect={{
                rotate: 25,
                stretch: -20,
                depth: 120,
                modifier: 1.5,
                slideShadows: false,
              }}
              onSlideChange={handleSlideChange}
              className="w-full h-full swiper-3d-enhanced"
              style={{
                perspective: '1200px',
                perspectiveOrigin: 'center center',
                overflow: 'visible',
                paddingTop: '20px',
                paddingBottom: '20px',
                userSelect: 'none',
                touchAction: 'pan-y pinch-zoom',
                willChange: 'transform',
              }}
              breakpoints={{
                320: {
                  slidesPerView: 1.5,
                  spaceBetween: -30,
                  coverflowEffect: {
                    rotate: 30,
                    stretch: -15,
                    depth: 100,
                    modifier: 1.2,
                    slideShadows: false,
                  },
                },
                640: {
                  slidesPerView: 2.2,
                  spaceBetween: -40,
                  coverflowEffect: {
                    rotate: 28,
                    stretch: -18,
                    depth: 110,
                    modifier: 1.3,
                    slideShadows: false,
                  },
                },
                1024: {
                  slidesPerView: 3,
                  spaceBetween: -50,
                  coverflowEffect: {
                    rotate: 25,
                    stretch: -20,
                    depth: 120,
                    modifier: 1.5,
                    slideShadows: false,
                  },
                },
              }}
            >
              {assistants.map((assistant, slideIndex) => {
                const cardKey = `${assistant.prompt_id}`;
                const videoSource = getVideoSource(assistant, cardKey);
                const shouldLoop = shouldVideoLoop(assistant, cardKey);
                const isHovered = hoveredCard === cardKey;
                const isCenterCard = slideIndex === currentIndex;

                return (
                  <SwiperSlide
                    key={assistant.prompt_id || assistant.id}
                    className="!h-[384px] flex justify-center items-center"
                  >
                    <div
                      className={`group relative overflow-hidden rounded-2xl shadow-2xl transition-all cursor-pointer ${
                        isCenterCard
                          ? 'ring-4 ring-white ring-opacity-50 transform scale-115 z-10'
                          : 'opacity-60 hover:opacity-95 transform scale-95 hover:shadow-3xl hover:ring-2 hover:ring-white hover:ring-opacity-30'
                      } duration-300`}
                      style={{
                        width: isHovered ? '400px' : '360px',
                        height: isHovered ? '420px' : '384px',
                        transformStyle: 'preserve-3d',
                        willChange: 'transform, opacity',
                        transitionProperty: 'all',
                        transitionDuration: '300ms',
                      }}
                      onMouseEnter={() => setHoveredCard(cardKey)}
                      onMouseLeave={() => setHoveredCard(null)}
                    >
                      {/* Background video/image */}
                      <div className="absolute inset-0 w-full h-full">
                        {videoSource ? (
                          <video
                            ref={(el) => (videoRefs.current[cardKey] = el)}
                            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                            muted
                            loop={shouldLoop}
                            playsInline
                            poster={assistant.teacher_image_url}
                            onEnded={() => handleVideoEnded(cardKey, assistant)}
                            onLoadStart={() => {
                              const video = videoRefs.current[cardKey];
                              if (video) {
                                video.onerror = () => {
                                  video.style.display = 'none';
                                };
                              }
                            }}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                          >
                            <source src={videoSource} type="video/mp4" />
                          </video>
                        ) : (
                          <img
                            src={assistant.teacher_image_url}
                            alt={assistant.name}
                            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        )}
                      </div>

                      {/* Content overlay with enhanced hover effects from first component */}
                      <div className="relative z-10 p-6 h-full flex flex-col justify-between transition-all duration-300">
                        <div className="mb-4 flex justify-between items-start relative z-10">
                          <span className="inline-block px-3 py-1 text-xs font-semibold text-white bg-black bg-opacity-50 rounded-full backdrop-blur-sm group-hover:bg-opacity-40 group-hover:scale-105 transition-all duration-300 shadow-lg">
                            AI AGENT
                          </span>
                          {isCenterCard && videoSource && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCenterVideo(assistant, cardKey);
                              }}
                              className="p-2 bg-black bg-opacity-60 hover:bg-opacity-80 text-white rounded-full backdrop-blur-sm transition-all duration-300 hover:scale-110 shadow-lg"
                            >
                              {isPlaying ? (
                                <Pause size={16} />
                              ) : (
                                <Play size={16} />
                              )}
                            </button>
                          )}
                        </div>

                        <div className="flex-1 flex flex-col justify-end relative z-10">
                          <h3
                            className="text-xl font-bold text-white mb-3 group-hover:text-opacity-100 group-hover:transform group-hover:translateY(-1) transition-all duration-300 line-clamp-2 drop-shadow-lg"
                            style={{textShadow: '2px 2px 4px rgba(0,0,0,0.8)'}}
                          >
                            {assistant.name}
                          </h3>
                          <p
                            className="text-gray-200 text-sm leading-relaxed mb-4 group-hover:text-white group-hover:transform group-hover:translateY(-1) transition-all duration-300 line-clamp-3 drop-shadow-md"
                            style={{textShadow: '1px 1px 3px rgba(0,0,0,0.8)'}}
                          >
                            {assistant.prompt}
                          </p>
                          {videoSource && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVideoDemo(assistant);
                              }}
                              className="self-start px-4 py-2 bg-black bg-opacity-60 hover:bg-opacity-80 text-white text-sm font-semibold rounded-lg backdrop-blur-sm transition-all duration-300 transform hover:scale-110 hover:-translate-y-1 border border-white border-opacity-30 hover:border-opacity-60 shadow-xl"
                            >
                              Video Call Now ▶
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </SwiperSlide>
                );
              })}
            </Swiper>
          </div>

          {/* Navigation Buttons - Enhanced styling from first component */}
          {assistants.length > 1 && (
            <div className="flex justify-center space-x-4 mb-6">
              <button
                onClick={prevSlide}
                className="p-3 bg-white bg-opacity-10 hover:bg-opacity-20 text-white rounded-full backdrop-blur-sm transition-all duration-300 transform hover:scale-110 border border-white border-opacity-20"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={nextSlide}
                className="p-3 bg-white bg-opacity-10 hover:bg-opacity-20 text-white rounded-full backdrop-blur-sm transition-all duration-300 transform hover:scale-110 border border-white border-opacity-20"
              >
                <ChevronRight size={24} />
              </button>
            </div>
          )}

          {/* Five Dots Pagination - Enhanced from first component */}
          {assistants.length > 1 && (
            <div className="flex justify-center space-x-3">
              {[0, 1, 2, 3, 4].map((dotIndex) => (
                <div
                  key={dotIndex}
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    dotIndex === 2
                      ? 'bg-gradient-to-r from-purple-400 to-blue-500 shadow-lg shadow-purple-500/50 scale-125'
                      : 'bg-white bg-opacity-30 border border-white border-opacity-40'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Custom CSS for line clamping */}
      <style>{`
                .line-clamp-2 {
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                
                .line-clamp-3 {
                    display: -webkit-box;
                    -webkit-line-clamp: 3;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
            `}</style>
    </div>
  );
}

export default AIAssistantCarousel;
