import {
  UPLOAD_IMAGE_URL,
  UPLOAD_AUDIO_URL,
  CREATE_PROMPT_URL,
} from '../config/apiBase';
import {logger} from '../utils/logger';

import {X, Upload} from 'lucide-react';
import {useState, useRef, useEffect} from 'react';
import {v4 as uuidv4} from 'uuid';


const CreateAgentForm = ({onClose, onSubmit, userId}) => {
  const [agentName, setAgentName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestId, setRequestId] = useState('');
  const imageInputRef = useRef(null);
  const audioInputRef = useRef(null);

  useEffect(() => {
    setRequestId(uuidv4());
  }, []);

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);

      // Upload image to API
      const formData = new FormData();
      formData.append('image', file);
      formData.append('user_id', userId);
      formData.append('vtoonify', 'true');
      formData.append('request_id', requestId);
      formData.append('name', agentName);

      try {
        const response = await fetch(UPLOAD_IMAGE_URL, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Failed to upload image');
        }

        const result = await response.json();
        logger.log('Image uploaded successfully:', result);
      } catch (error) {
        console.error('Error uploading image:', error);
      }
    }
  };

  const handleAudioChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setAudioFile(file);

      const formData = new FormData();
      formData.append('audio', file);
      formData.append('user_id', userId);
      formData.append('request_id', requestId);

      try {
        const response = await fetch(UPLOAD_AUDIO_URL, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Failed to upload audio');
        }

        const result = await response.json();
        logger.log('Audio uploaded successfully:', result);
      } catch (error) {
        console.error('Error uploading audio:', error);
      }
    }
  };
  logger.log(imageFile, 'hi');
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const createPromptData = {
        prompt: prompt,
        request_id: requestId,
        name: agentName,
        user_id: userId,
        isPublic: isPublic,
        image_url: '',
      };

      const response = await fetch(CREATE_PROMPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createPromptData),
      });

      if (!response.ok) {
        throw new Error('Failed to create agent');
      }

      const result = await response.json();
      logger.log('Agent created successfully:', result);

      onSubmit(result);

      onClose();
    } catch (error) {
      console.error('Error creating agent:', error);
    } finally {
      setIsSubmitting(false);
      setRequestId(null);
    }
  };

  return (
    <div
      className="bg-gray-800 rounded-lg p-6 h-3/4 w-2/4 overflow-y-auto shadow-lg absolute z-50 
        top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
    >
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-semibold text-white">Create New Agent</h2>
        <button onClick={onClose} className="text-white hover:text-gray-300">
          <X className="w-6 h-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Agent Name Input */}
        <div className="mb-2">
          <label htmlFor="agentName" className="block text-white mb-2">
            Agent Name
          </label>
          <input
            type="text"
            id="agentName"
            className="w-full bg-gray-700 text-white rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            required
          />
        </div>

        {/* Image and Audio Upload in Same Row */}
        <div className="flex flex-row space-x-2 mb-2">
          <div className="flex-1">
            <label className="block text-white mb-2">Agent Image</label>
            <div
              className="border-2 border-dashed border-gray-500 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer h-24 w-44"
              onClick={() => imageInputRef.current.click()}
            >
              {imagePreview ? (
                <div className="relative w-12 h-12">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-8 h-8 object-cover rounded-full"
                  />
                  <button
                    type="button"
                    className="absolute top-0 right-0 bg-red-500 rounded-full p-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageFile(null);
                      setImagePreview('');
                    }}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-gray-400 mb-2" />
                  <p className="text-gray-400 text-center text-sm">
                    Upload an image for your agent
                  </p>
                </>
              )}
              <input
                type="file"
                ref={imageInputRef}
                onChange={handleImageChange}
                accept="image/*"
                className="hidden"
              />
            </div>
          </div>

          {/* Audio Upload */}
          <div className="flex-1">
            <label className="block text-white mb-2">Agent Voice (Audio)</label>
            <div
              className="border-2 border-dashed border-gray-500 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer h-24 w-44"
              onClick={() => audioInputRef.current.click()}
            >
              {audioFile ? (
                <div className="flex items-center justify-between w-full">
                  <span className="text-gray-300 truncate">
                    {audioFile.name}
                  </span>
                  <button
                    type="button"
                    className="bg-red-500 rounded-full p-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAudioFile(null);
                    }}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-gray-400 mb-2" />
                  <p className="text-gray-400 text-center text-sm">
                    Upload an audio file for your agent's voice
                  </p>
                </>
              )}
              <input
                type="file"
                ref={audioInputRef}
                onChange={handleAudioChange}
                accept="audio/*"
                className="hidden"
              />
            </div>
          </div>
        </div>

        {/* Prompt Input */}
        <div className="mb-2">
          <label htmlFor="prompt" className="block text-white mb-2">
            Agent Prompt
          </label>
          <textarea
            id="prompt"
            className="w-full bg-gray-700 text-white rounded p-2 h-12 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter instructions for your agent..."
            required
          />
        </div>

        {/* isPublic Checkbox */}
        <div className="mb-6 flex items-center">
          <input
            type="checkbox"
            id="isPublic"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="w-4 h-4 rounded bg-gray-700 border-gray-600 focus:ring-blue-500 focus:ring-2"
          />
          <label htmlFor="isPublic" className="ml-2 text-white">
            Make this agent public
          </label>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2 px-4 rounded text-white font-medium flex items-center justify-center"
          style={{
            background: 'linear-gradient(to right, #00e89d, #0078ff)',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? 'Creating...' : 'Create Agent'}
        </button>
      </form>
    </div>
  );
};

export default CreateAgentForm;
