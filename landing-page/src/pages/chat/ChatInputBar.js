/* eslint-disable no-unused-vars */
import {
  SendHorizontal,
  Image,
  FileText,
  Mic,
  Volume2,
  VolumeX,
  ClipboardPaste,
  Camera,
  Brain,
  Ear,
} from 'lucide-react';
import React from 'react';

/**
 * ChatInputBar -- message input area with queue, file uploads, TTS, mic, and send.
 *
 * Extracted from Demopage.js to reduce file size.
 * All behaviour and styling is identical to the original inline JSX.
 */
const ChatInputBar = ({
  // ── State ──
  messageQueue,
  setMessageQueue,
  editingQueueId,
  setEditingQueueId,
  pdfFile,
  userImage,
  showAgentMentionList,
  setShowAgentMentionList,
  allAgents,
  mentionFilter,
  setMentionFilter,
  inputMessage,
  setInputMessage,
  isAuthenticated,
  ttsEnabled,
  setTtsEnabled,
  isRecording,
  textareaRef,

  // ── Callbacks ──
  handleRemovePdf,
  handleRemoveImage,
  selectMentionedAgent,
  handleFocus,
  handleBlur,
  handleKeyPress,
  handleSend,
  handleStart,
  handleStop,
  handleImageSelect,
  handlePdfSelect,
  setIsModalOpen,
  onClipboardPaste,
  onCameraCapture,
  onMemoryOpen,
  onToggleAlwaysListening,
  alwaysListening,
}) => {
  return (
    <div className="bg-black pt-4 border-t border-gray-700 flex justify-center flex-col mt-2 mb-2 sticky bottom-0 z-10">
      {/* Message Queue */}
      {messageQueue.length > 0 && (
        <div className="px-4 pb-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              Queued ({messageQueue.length})
            </span>
            <span className="text-xs text-gray-600 italic">click to edit</span>
          </div>
          {messageQueue.map((q, idx) => {
            const isEditing = editingQueueId === q.id;
            return (
              <div
                key={q.id}
                className={`flex items-center gap-2 rounded px-3 py-1.5 group transition-all duration-200 cursor-text ${
                  isEditing
                    ? 'bg-gray-800 ring-1 ring-purple-500/60 shadow-[0_0_8px_rgba(108,99,255,0.2)]'
                    : 'bg-gray-900 hover:bg-gray-800/80 hover:ring-1 hover:ring-gray-600/40'
                }`}
                onClick={() => setEditingQueueId(q.id)}
              >
                <span
                  className={`text-xs transition-colors duration-200 ${isEditing ? 'text-purple-400' : 'text-gray-600'}`}
                >
                  {idx + 1}.
                </span>
                <input
                  type="text"
                  value={q.text}
                  onChange={(e) => {
                    setMessageQueue((prev) =>
                      prev.map((item) =>
                        item.id === q.id
                          ? {...item, text: e.target.value}
                          : item
                      )
                    );
                  }}
                  onFocus={() => setEditingQueueId(q.id)}
                  onBlur={() => setEditingQueueId(null)}
                  className={`flex-1 bg-transparent text-sm outline-none transition-colors duration-200 ${
                    isEditing ? 'text-white' : 'text-gray-300'
                  }`}
                />
                {isEditing && (
                  <span className="text-[10px] text-purple-400/70 whitespace-nowrap">
                    editing
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMessageQueue((prev) =>
                      prev.filter((item) => item.id !== q.id)
                    );
                  }}
                  className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all text-xs ml-1"
                  aria-label="Remove queued message"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
      {pdfFile && (
        <div className="relative inline-block mt-4">
          <span className="text-gray-400">Uploaded PDF: {pdfFile.name}</span>
          <button
            onClick={handleRemovePdf}
            className="text-red-600 hover:text-red-800 p-1 ml-2"
          >
            Remove
          </button>
        </div>
      )}
      {userImage && (
        <div className="relative inline-block mt-4">
          <span className="text-gray-700"> Uploaded Image: </span>
          <img
            src={userImage}
            alt="Uploaded"
            className="w-16 h-16 object-cover rounded-lg shadow-md mt-2"
          />
          <button
            onClick={handleRemoveImage}
            className="text-red-600 hover:text-red-800 p-1 ml-2"
          >
            Remove
          </button>
        </div>
      )}

      <div className="flex items-center w-[95%] relative ml-1">
        {/* /h Agent mention dropdown */}
        {showAgentMentionList && (
          <div className="absolute bottom-full left-0 w-64 max-h-48 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 mb-1">
            {allAgents.length > 0 ? (
              allAgents
                .filter(
                  (a) =>
                    !mentionFilter ||
                    a.name?.toLowerCase().includes(mentionFilter)
                )
                .map((agent) => (
                  <div
                    key={agent.prompt_id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectMentionedAgent(agent);
                    }}
                    className="px-3 py-2 hover:bg-gray-800 cursor-pointer text-sm text-white flex items-center gap-2"
                  >
                    <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                    {agent.name || `Agent ${agent.prompt_id}`}
                  </div>
                ))
            ) : (
              <div className="px-3 py-2 text-gray-500 text-sm">
                No agents available
              </div>
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          disabled={!isAuthenticated}
          value={inputMessage}
          onChange={(e) => {
            const val = e.target.value;
            setInputMessage(val);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;

            if (e.target.scrollHeight > 200) {
              e.target.style.height = '200px';
              e.target.style.overflowY = 'scroll';
            } else {
              e.target.style.overflowY = 'hidden';
            }

            // /h agent mention detection
            const cursorPos = e.target.selectionStart;
            const textBeforeCursor = val.substring(0, cursorPos);
            const hMatch = textBeforeCursor.match(/\/h\s*(\S*)$/);
            if (hMatch) {
              setShowAgentMentionList(true);
              setMentionFilter(hMatch[1].toLowerCase());
            } else {
              setShowAgentMentionList(false);
            }
          }}
          placeholder="Message..."
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyPress={handleKeyPress}
          className="w-full text-black border bg-[#fff8ea] text-base border-gray-200 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] break-words overflow-wrap-anywhere whitespace-pre-wrap transition-all duration-200"
          style={{
            minHeight: '44px',
            maxHeight: '200px',
            wordWrap: 'break-word',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        />

        {!isAuthenticated && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="absolute text-white bg-black p-2 rounded-lg top-[40px] left-0"
          >
            Please login to talk to agent.
          </button>
        )}

        <button
          onClick={() => document.getElementById('fileInput').click()}
          className="text-gray-400 hover:text-gray-600 p-1"
          aria-label="Upload image"
        >
          <Image className="w-5 h-5" />
        </button>

        <button
          onClick={() => document.getElementById('pdfInput').click()}
          className="text-gray-400 hover:text-gray-600 p-1"
          aria-label="Upload PDF"
        >
          <FileText className="w-5 h-5" />
        </button>

        {/* TTS Toggle Button */}
        <button
          onClick={() => setTtsEnabled(!ttsEnabled)}
          className={`p-1 btn-press ${
            ttsEnabled
              ? 'text-green-500 hover:text-green-700'
              : 'text-gray-400 hover:text-gray-600'
          }`}
          title={
            ttsEnabled
              ? 'Text-to-Speech enabled (click to disable)'
              : 'Text-to-Speech disabled (click to enable)'
          }
        >
          {ttsEnabled ? (
            <Volume2 className="w-5 h-5" />
          ) : (
            <VolumeX className="w-5 h-5" />
          )}
        </button>

        {!isRecording ? (
          <button
            onClick={handleStart}
            className="text-green-500 hover:text-green-700 p-1 flex items-center gap-1 btn-press"
            title="Voice input"
          >
            <Mic className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="text-red-500 hover:text-red-700 p-1 flex items-center gap-1 btn-press"
          >
            <span>Stop</span>
          </button>
        )}

        {/* Clipboard paste */}
        {onClipboardPaste && (
          <button onClick={onClipboardPaste}
            className="text-gray-400 hover:text-purple-400 p-1 btn-press" title="Paste from clipboard"
            aria-label="Paste from clipboard">
            <ClipboardPaste className="w-4 h-4" />
          </button>
        )}

        {/* Camera capture */}
        {onCameraCapture && (
          <button onClick={onCameraCapture}
            className="text-gray-400 hover:text-blue-400 p-1 btn-press" title="Take photo"
            aria-label="Take photo">
            <Camera className="w-4 h-4" />
          </button>
        )}

        {/* Memory panel */}
        {onMemoryOpen && (
          <button onClick={onMemoryOpen}
            className="text-gray-400 hover:text-pink-400 p-1 btn-press" title="Memories"
            aria-label="Open memories">
            <Brain className="w-4 h-4" />
          </button>
        )}

        {/* Always-listening toggle */}
        {onToggleAlwaysListening && (
          <button onClick={onToggleAlwaysListening}
            className={`p-1 btn-press ${alwaysListening ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'}`}
            title={alwaysListening ? 'Stop listening for "Hey Nunba"' : 'Listen for "Hey Nunba"'}>
            <Ear className="w-4 h-4" />
            {alwaysListening && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse motion-reduce:animate-none" />
            )}
          </button>
        )}

        <button
          data-send-btn
          disabled={!isAuthenticated}
          onClick={handleSend}
          aria-label="Send message"
          className="p-1 rounded-lg transition-all duration-200 hover:scale-110 active:scale-90 motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
          style={{
            background: inputMessage.trim()
              ? 'linear-gradient(135deg, #6C63FF, #9B94FF)'
              : 'transparent',
            color: inputMessage.trim() ? '#fff' : '#9CA3AF',
            boxShadow: inputMessage.trim()
              ? '0 2px 12px rgba(108, 99, 255, 0.35)'
              : 'none',
          }}
        >
          <SendHorizontal className="w-5 h-5" />
        </button>

        <input
          type="file"
          id="fileInput"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />
        <input
          type="file"
          id="pdfInput"
          accept="application/pdf"
          onChange={handlePdfSelect}
          className="hidden"
        />
      </div>
    </div>
  );
};

export default ChatInputBar;
