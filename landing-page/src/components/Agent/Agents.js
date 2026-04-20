import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ToastContainer, toast} from 'react-toastify';

import 'react-toastify/dist/ReactToastify.css';
import Footer from '../footer';
import Navbar from '../navbar';

import './agents.css';
import {X} from 'lucide-react';

import AgentPoster from '../../assets/images/AgentPoster.png';
import {chatApi} from '../../services/socialApi';

const Agents = ({
  isOverlay = false,
  onClose = () => {},
  onAgentSelect = () => {},
  predefinedAgents = null,
}) => {
  const [agentsData, setAgentsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredAgents, setFilteredAgents] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        if (predefinedAgents && predefinedAgents.length > 0) {
          const validAgents = predefinedAgents.filter(
            (agent) => agent.name && agent.name.trim() !== ''
          );
          setAgentsData(validAgents);
          setFilteredAgents(validAgents);
          setLoading(false);
          return;
        }

        // Otherwise fetch from API
        const res = await chatApi.getPrompts();
        const data = res?.prompts || res?.data?.prompts || res || [];

        // Filter out agents without a name
        const validAgents = (data || []).filter(
          (agent) => agent.name && agent.name.trim() !== ''
        );
        setAgentsData(validAgents);
        setFilteredAgents(validAgents);
      } catch (error) {
        console.error('Error fetching agents:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();
  }, [predefinedAgents]);

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);

    const filtered = agentsData.filter((agent) =>
      agent.name.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredAgents(filtered);
  };

  if (loading) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 ${isOverlay ? 'text-white p-12' : 'min-h-[50vh]'}`}
      >
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2.5 h-2.5 rounded-full"
              style={{
                background: 'linear-gradient(135deg, #6C63FF, #9B94FF)',
                animation: 'agentDotPulse 1.2s ease-in-out infinite',
                animationDelay: `${i * 150}ms`,
              }}
            />
          ))}
        </div>
        <span className="text-sm text-gray-400 tracking-wide">
          Loading agents...
        </span>
        <style>{`
                    @keyframes agentDotPulse {
                        0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                        40% { opacity: 1; transform: scale(1.2); }
                    }
                `}</style>
      </div>
    );
  }

  if (isOverlay) {
    return (
      <div
        className="fixed inset-0 w-full z-50 flex justify-center items-center overflow-y-auto"
        style={{background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)'}}
      >
        <div
          className="bg-gray-900 rounded-2xl shadow-2xl max-h-[95vh] w-[95vw] max-w-4xl flex flex-col"
          style={{border: '1px solid rgba(108, 99, 255, 0.1)'}}
        >
          <div className="flex justify-between items-center p-5 border-b border-gray-800">
            <h2 className="text-xl font-bold text-white">All Agents</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white rounded-full p-1 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="flex justify-center m-4">
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="p-3 rounded-xl border border-gray-700 bg-gray-800/80 text-white placeholder-gray-500 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all duration-200"
            />
          </div>

          {/* Agents Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="agents-grid">
              {filteredAgents.length === 0 ? (
                <div className="no-agents-message text-white">
                  No agents match your search. Please try a different query.
                </div>
              ) : (
                filteredAgents.map((agent, index) => (
                  <AgentCard
                    key={index}
                    agent={agent}
                    isOverlay={true}
                    onSelect={() => onAgentSelect(agent)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Regular standalone view
  return (
    <>
      <div className="bg-[#212A31]">
        <Navbar />

        <div className="min-h-screen bg-[#212A31] pt-28">
          {/* Search Bar */}
          <div className="flex justify-center mb-8">
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="p-3 rounded-xl border border-gray-700 bg-gray-800/80 text-white placeholder-gray-500 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all duration-200"
            />
          </div>

          <div className="agents-grid">
            {filteredAgents.length === 0 ? (
              <div className="no-agents-message">
                No agents match your search. Please try a different query.
              </div>
            ) : (
              filteredAgents.map((agent, index) => (
                <AgentCard key={index} agent={agent} isOverlay={false} />
              ))
            )}
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
};

const AgentCard = ({agent, isOverlay = false, onSelect = () => {}}) => {
  const navigate = useNavigate();

  const handleButtonClick = () => {
    if (isOverlay) {
      onSelect(agent);
      return;
    }

    const agentName = agent.name.replace(/\s+/g, '-');
    navigate(`/agents/${agentName}`, {
      state: {
        agentData: agent,
      },
    });
  };

  return (
    <div
      onClick={handleButtonClick}
      className="relative flex flex-col overflow-hidden rounded-md cursor-pointer group"
      style={{
        background: '#212A31',
        border: '1px solid rgba(108, 99, 255, 0.12)',
        backdropFilter: 'blur(16px)',
        transition: 'all 0.3s cubic-bezier(0.2, 0, 0, 1)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow =
          '0 12px 40px rgba(108, 99, 255, 0.2), 0 0 0 1px rgba(108, 99, 255, 0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.2)';
      }}
    >
      {/* Image */}
      <div className="relative overflow-hidden" style={{aspectRatio: '4/3'}}>
        <img
          src={agent.teacher_image_url || agent.image_url || AgentPoster}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          alt={agent.name}
        />
        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, #212A31 0%, transparent 50%)',
          }}
        />
      </div>

      {/* Content */}
      <div className="px-6 pt-4 pb-12 flex flex-col justify-center items-center relative">
        <h3 className="font-bold text-xl mb-2 text-center text-white">
          {agent.name}
        </h3>
        <h3 className="text-slate-400 text-center line-clamp-1">
          {agent.video_text && agent.video_text !== 'This is Static Description'
            ? agent.video_text
            : 'Agent description goes here.'}
        </h3>
      </div>

      {/* CTA Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleButtonClick();
        }}
        className="absolute bottom-0 left-0 w-full text-white font-semibold py-2.5 text-sm tracking-wide transition-all duration-200 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #6C63FF, #9B94FF)',
          borderRadius: '0 0 6px 6px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background =
            'linear-gradient(135deg, #5A52E0, #8A83F0)';
          e.currentTarget.style.boxShadow =
            '0 -4px 16px rgba(108, 99, 255, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background =
            'linear-gradient(135deg, #6C63FF, #9B94FF)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        Talk To Agent
      </button>
    </div>
  );
};

export default Agents;
