/* eslint-disable no-unused-vars */
import AgentPoster from '../../assets/images/AgentPoster.png';
import HARTSpeechPlayer from '../../components/HART/HARTSpeechPlayer';
import OtpAuthModal from '../OtpAuthModal';

import {ChevronRight, Menu, Star, Plus, X} from 'lucide-react';
import React from 'react';
import {Link as RouterLink, useNavigate} from 'react-router-dom';


/**
 * AgentSidebar — desktop sticky sidebar + mobile hamburger menu.
 *
 * Extracted from Demopage.js to reduce file size.
 * All behaviour and styling is identical to the original inline JSX.
 */
const AgentSidebar = ({
  screenWidth,
  showContent,
  onMouseEnterSidebar,
  onMouseLeaveSidebar,
  isOpen,
  setIsOpen,
  isAuthenticated,
  isGuestMode,
  decryptedEmail,
  decryptedUserId,
  token,
  isTextMode,
  setIsTextMode,
  isModalOpen,
  setIsModalOpen,
  sessionExpiredMessage,
  isLocalRoute,
  items,
  handleCreateAgentClick,
  handleButtonClick,
  handleImgError,
  setShowAgentsOverlay,
  LogOutUser,
  toggleDropdown,
}) => {
  const navigate = useNavigate();

  if (screenWidth > 768) {
    /* ───────── Desktop sticky sidebar ───────── */
    return (
      <div
        onMouseEnter={onMouseEnterSidebar}
        onMouseLeave={onMouseLeaveSidebar}
        className={`sticky top-0 self-start group w-[20%] sm:w-[30%] md:w-[15%] lg:w-[20%] text-gray-300 p-4 flex flex-col h-screen overflow-hidden ${
          showContent ? 'bg-gray-900' : ''
        }`}
      >
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-semibold text-white">HevolveAI</h1>
        </div>

        <div
          className={`absolute left-0 w-full h-screen bg-gray-900 transition-opacity duration-300 ${
            showContent ? 'opacity-100 top-4' : 'opacity-0 top-0'
          }`}
        >
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-2xl font-semibold text-white ml-4">
              HevolveAI
            </h1>
          </div>

          <button
            onClick={handleCreateAgentClick}
            className={`flex items-center gap-2 mb-1 btn-press ${
              isAuthenticated
                ? 'text-orange-500 hover:text-orange-600'
                : 'text-gray-500 hover:text-gray-400 cursor-not-allowed'
            }`}
            title={
              isAuthenticated
                ? 'Create new Agent'
                : 'Please login to create an agent'
            }
          >
            <Plus className="w-4 h-4" />
            <span>Create new Agent</span>
            {!isAuthenticated && (
              <span className="text-xs">(Login required)</span>
            )}
          </button>

          <div className="mb-4 ml-4">
            <h2 className="text-lg mb-2">Starred</h2>
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <Star className="w-4 h-4" />
              <span>Star chats you use often</span>
            </div>
          </div>

          <div className="flex-1">
            <h2 className="text-sm mb-2 ml-4">Recents</h2>
            <div className="space-y-1">
              {items.map((chat, index) => (
                <div
                  onClick={() => handleButtonClick(chat)}
                  key={index}
                  className="flex items-center ml-1 justify-start gap-1 hover:bg-gray-800 p-2 rounded cursor-pointer"
                >
                  <img
                    src={
                      chat.teacher_image_url || chat.image_url || AgentPoster
                    }
                    alt={chat?.name}
                    className="md:w-6 md:h-6 lg:w-8 lg:h-8 rounded-full xl:w-8 xl:h-8"
                    onError={handleImgError}
                  />
                  <span className="truncate sm:text-base md:text-[1.2rem]">
                    {chat?.name}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowAgentsOverlay(true)}
              className="text-sm mt-2 ml-2 hover:text-white flex items-center gap-1 btn-press"
            >
              View All Agents
              <ChevronRight className="w-4 h-4" />
            </button>
            {isLocalRoute && (
              <div className="mt-3 mb-3 border-t border-gray-700 pt-3">
                <p className="text-xs text-gray-500 ml-3 mb-1">Hear HART OS speak</p>
                <HARTSpeechPlayer variant="sidebar" />
              </div>
            )}
            {!isLocalRoute && (
              <button className="flex justify-center flex-col w-full items-center xl:flex-row xl:justify-around">
                <a
                  href="https://play.google.com/store/apps/details?id=com.hertzai.hevolve&hl=en&gl=US&pcampaignid=pcampaignidMKT-Other-global-all-co-prtnr-py-PartBadge-Mar2515-1"
                  className="inline-block"
                >
                  <img
                    alt="Get it on Google Play"
                    src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                    className="w-32 h-12 object-contain"
                    onError={handleImgError}
                  />
                </a>
                <a
                  href="https://azurekong.hertzai.com/mkt-aws/examples/daf7beee-7HevolveAI_Agent_Companion_Setup_2.exe"
                  className="inline-block font-serif text-sm mb-4"
                >
                  <img
                    alt="Download HevolveAI Companion"
                    src="/companion.svg"
                    className="w-32 h-12 object-contain"
                    onError={handleImgError}
                  />
                </a>
              </button>
            )}

            <div className="mt-auto space-y-4 absolute bottom-0">
              <div
                onClick={toggleDropdown}
                className="flex items-center gap-2 cursor-pointer mb-5"
              >
                <button className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
                  <span className="text-white">
                    {decryptedEmail
                      ? decryptedEmail.charAt(0).toUpperCase()
                      : ''}
                  </span>
                </button>
                <span className="text-sm truncate">
                  {decryptedEmail && token && decryptedUserId
                    ? decryptedEmail
                    : isGuestMode
                      ? `Guest ${(localStorage.getItem('guest_user_id') || '').slice(-4)}`
                      : 'Welcome! Log in'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
                <span className="text-white">
                  {decryptedEmail ? decryptedEmail.charAt(0).toUpperCase() : ''}
                </span>
              </div>
              <span className="text-sm truncate">
                {decryptedEmail && token && decryptedUserId
                  ? decryptedEmail
                  : 'Welcome! Log in'}
              </span>
            </div>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        {isOpen && (
          <div
            style={{border: '1px solid gray'}}
            className="absolute bottom-20 right-0 left-1 border-white w-64 bg-gray-900 text-white rounded-lg p-4 z-10"
          >
            {/* Email Section */}
            <div className="flex items-center gap-2 mb-4 border-b border-gray-700 pb-2">
              <div className="bg-purple-500 text-white flex items-center justify-center w-8 h-8 rounded-full">
                R
              </div>
              <div>
                <p className="text-sm font-medium">Personal</p>
                <p className="text-xs text-gray-400">Pro plan</p>
              </div>
            </div>

            {/* Options List */}
            <ul className="space-y-2">
              <li
                onClick={() => navigate('/social')}
                className="cursor-pointer hover:bg-gray-800 p-2 rounded flex items-center gap-2"
              >
                🌐 Social
              </li>
              <li
                onClick={() => navigate('/social/kids')}
                className="cursor-pointer hover:bg-gray-800 p-2 rounded flex items-center gap-2"
              >
                🧒 Kids Learning
              </li>
              <li
                onClick={() => navigate('/admin')}
                className="cursor-pointer hover:bg-gray-800 p-2 rounded flex items-center gap-2"
              >
                ⚙️ Admin
              </li>
              <li
                onClick={() => navigate('/AboutHevolve')}
                className="cursor-pointer hover:bg-gray-800 p-2 rounded"
              >
                About Hevolve
              </li>
              <li
                onClick={() => navigate('/agents')}
                className="cursor-pointer hover:bg-gray-800 p-2 rounded"
              >
                Agents
              </li>
              <li
                onClick={() => navigate('/aboutus')}
                className="cursor-pointer hover:bg-gray-800 p-2 rounded"
              >
                About Us
              </li>
              <li
                onClick={() => navigate('/Plan')}
                className="cursor-pointer hover:bg-gray-800 p-2 rounded"
              >
                Pricing
              </li>
            </ul>

            <div className="flex justify-center items-center mt-4 space-x-2">
              {isAuthenticated ? (
                <span
                  className="py-[6px] px-4 text-sm text-center rounded btn-gradient"
                  style={{
                    background: 'linear-gradient(to right, #00e89d, #0078ff)',
                    color: '#FFFAE8',
                    cursor: 'pointer',
                  }}
                  onClick={LogOutUser}
                >
                  Logout
                </span>
              ) : (
                <>
                  <RouterLink onClick={() => setIsModalOpen(true)}>
                    <span
                      className="py-[6px] px-4 text-sm text-center rounded"
                      style={{
                        background:
                          'linear-gradient(to right, #00e89d, #0078ff)',
                        color: '#FFFAE8',
                        cursor: 'pointer',
                      }}
                    >
                      Login
                    </span>
                  </RouterLink>
                  <OtpAuthModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    message={sessionExpiredMessage}
                    forceGuestMode={isLocalRoute}
                  />
                  <RouterLink
                    to="#signup-section"
                    className="py-[6px] px-4 text-sm text-center rounded font-semibold text-white"
                    style={{
                      background: 'linear-gradient(to right, #00e89d, #0078ff)',
                      cursor: 'pointer',
                    }}
                  >
                    Signup
                  </RouterLink>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ───────── Mobile hamburger menu ───────── */
  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="absolute left-4 top-4 text-white z-50"
        >
          <Menu className="w-6 h-6" />
        </button>
      )}

      {isOpen && (
        <div className="absolute left-0 w-full h-screen bg-gray-900 transition-all duration-300 p-2 z-50">
          <div className="flex justify-between items-center mb-1">
            <h1 className="text-2xl font-semibold text-white">HevolveAI</h1>
            <button onClick={() => setIsOpen(false)} className="text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          <button
            onClick={handleCreateAgentClick}
            className={`flex items-center gap-2 mb-1 ${
              isAuthenticated
                ? 'text-orange-500 hover:text-orange-600'
                : 'text-gray-500 hover:text-gray-400 cursor-not-allowed'
            }`}
            title={
              isAuthenticated
                ? 'Create new Agent'
                : 'Please login to create an agent'
            }
          >
            <Plus className="w-4 h-4" />
            <span>Create new Agent</span>
            {!isAuthenticated && (
              <span className="text-xs">(Login required)</span>
            )}
          </button>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Display Mode
            </label>
            <select
              value={isTextMode ? 'text' : 'default'}
              onChange={(e) => {
                if (e.target.value === 'text') {
                  setIsTextMode(true);
                } else if (e.target.value === 'default') {
                  setIsTextMode(false);
                }
              }}
              className="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <option value="default" className="bg-gray-800 text-white">
                Media Mode
              </option>
              <option value="text" className="bg-gray-800 text-white">
                Text Mode
              </option>
            </select>
          </div>

          {/* Rest of mobile menu content */}
          <div>
            <h2 className="text-sm mb-2 text-white">Recents</h2>
            <div className="space-y-0.5">
              {items.map((chat, index) => (
                <div
                  key={index}
                  onClick={() => handleButtonClick(chat)}
                  className="flex items-center gap-2 text-white hover:bg-gray-800 p-1 rounded cursor-pointer"
                >
                  <img
                    src={
                      chat.teacher_image_url || chat.image_url || AgentPoster
                    }
                    alt={chat?.name}
                    className="!w-6 !h-6 sm:!w-8 sm:!h-8 md:!w-10 md:!h-10 lg:!w-12 lg:!h-12 xl:!w-14 xl:!h-14 rounded-full"
                    onError={handleImgError}
                  />
                  <span className="truncate text-sm sm:text-base md:text-xl lg:text-2xl xl:text-3xl">
                    {chat?.name}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowAgentsOverlay(true)}
              className="text-sm mt-2 hover:text-white flex items-center gap-1"
            >
              View All Agents
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="justify-self-center">
            <a
              href="https://azurekong.hertzai.com/mkt-aws/examples/daf7beee-7HevolveAI_Agent_Companion_Setup_2.exe"
              download
              className="
        bg-gradient-to-r from-blue-500 to-green-500
        text-white
        border border-gray-600
        rounded-lg
        px-3 py-2
        text-sm
        focus:outline-none
        focus:ring-2
        focus:ring-blue-500
        focus:border-transparent
        hover:bg-gray-700
        transition-colors
        cursor-pointer
        min-w-[120px]
        inline-block
        text-center
      "
            >
              Install Windows Agent Companion
            </a>
          </div>

          {/* Google Play & Companion (hidden on /local) */}
          {!isLocalRoute && (
            <button className="flex justify-center flex-col w-full items-center xl:flex-row xl:justify-around">
              <a
                href="https://play.google.com/store/apps/details?id=com.hertzai.hevolve&hl=en&gl=US&pcampaignid=pcampaignidMKT-Other-global-all-co-prtnr-py-PartBadge-Mar2515-1"
                className="inline-block"
              >
                <img
                  alt="Get it on Google Play"
                  src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                  className="w-32 h-12 object-contain"
                />
              </a>
              <a
                href="https://azurekong.hertzai.com/mkt-aws/examples/daf7beee-7HevolveAI_Agent_Companion_Setup_2.exe"
                className="inline-block font-serif text-sm mb-4"
              >
                <img
                  alt="Download HevolveAI Companion"
                  src="/companion.svg"
                  className="w-32 h-12 object-contain"
                />
              </a>
            </button>
          )}

          <div className="mt-1">
            <ul className="space-y-1 text-white">
              <li
                onClick={() => {
                  setIsOpen(false);
                  navigate('/social');
                }}
                className="cursor-pointer text-sm sm:text-base md:text-xl lg:text-2xl xl:text-3xl hover:bg-gray-800 p-1 rounded flex items-center gap-2"
              >
                🌐 Social
              </li>
              <li
                onClick={() => {
                  setIsOpen(false);
                  navigate('/social/kids');
                }}
                className="cursor-pointer text-sm sm:text-base md:text-xl lg:text-2xl xl:text-3xl hover:bg-gray-800 p-1 rounded flex items-center gap-2"
              >
                🧒 Kids Learning
              </li>
              <li
                onClick={() => {
                  setIsOpen(false);
                  navigate('/admin');
                }}
                className="cursor-pointer text-sm sm:text-base md:text-xl lg:text-2xl xl:text-3xl hover:bg-gray-800 p-1 rounded flex items-center gap-2"
              >
                ⚙️ Admin
              </li>
              <li
                onClick={() => navigate('/AboutHevolve')}
                className="cursor-pointer text-sm sm:text-base md:text-xl lg:text-2xl xl:text-3xl hover:bg-gray-800 p-1 rounded flex items-center"
              >
                About Hevolve
              </li>
              <li
                onClick={() => navigate('/agents')}
                className="cursor-pointer text-sm sm:text-base md:text-xl lg:text-2xl xl:text-3xl hover:bg-gray-800 p-1 rounded flex items-center"
              >
                Agents
              </li>
              <li
                onClick={() => navigate('/aboutus')}
                className="cursor-pointer text-sm sm:text-base md:text-xl lg:text-2xl xl:text-3xl hover:bg-gray-800 p-1 rounded flex items-center"
              >
                About Us
              </li>
              <li
                onClick={() => navigate('/Plan')}
                className="cursor-pointer text-sm sm:text-base md:text-xl lg:text-2xl xl:text-3xl hover:bg-gray-800 p-1 rounded flex items-center"
              >
                Pricing
              </li>
            </ul>
          </div>

          <div className="left-4 flex items-center gap-2 cursor-pointer mt-2">
            <button className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
              <span className="text-white">
                {decryptedEmail ? decryptedEmail.charAt(0).toUpperCase() : ''}
              </span>
            </button>
            <span className="text-sm text-white">{decryptedEmail}</span>
          </div>

          <div className="mt-1 flex justify-center gap-1">
            <button
              className="py-2 px-4 rounded text-white btn-gradient"
              style={{
                background: 'linear-gradient(to right, #00e89d, #0078ff)',
                cursor: 'pointer',
              }}
              onClick={LogOutUser}
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AgentSidebar;
