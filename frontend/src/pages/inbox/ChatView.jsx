import React, { useState, useEffect, useRef } from 'react';
import { PaperPlaneRight, WhatsappLogo, TelegramLogo, DeviceMobile } from '@phosphor-icons/react';
import AgentModeToggle from './AgentModeToggle';
import { sendMessage } from '../../utils/api';

const ChatView = ({ lead, messages, onToggleMode }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || !lead || lead.mode !== 'agent') return;

    try {
      await sendMessage(lead.id, inputText);
      setInputText('');
    } catch (err) {
      console.error(err);
    }
  };

  if (!lead) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0B0E14]">
        <div className="w-16 h-16 rounded-full bg-[#131722] flex items-center justify-center mb-4">
          <span className="text-2xl text-[#2a2e39] font-bold">P</span>
        </div>
        <p className="text-[#8a91a4]">Select a conversation to start</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0B0E14] h-full overflow-hidden">
      {/* Header */}
      <div className="h-[72px] px-6 flex items-center justify-between border-b border-[#2a2e39] bg-[#0B0E14] flex-shrink-0">
        <div>
          <h2 className="text-white font-semibold flex items-center gap-2">
            {lead.name}
            {lead.channel === 'whatsapp' ? <WhatsappLogo className="text-[#00ff88]" /> : <TelegramLogo className="text-[#00e5ff]" />}
          </h2>
          <p className="text-[#8a91a4] text-xs mt-1">{lead.phone || lead.email || 'No contact details'}</p>
        </div>
        <AgentModeToggle mode={lead.mode} onToggle={onToggleMode} />
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="text-center text-[#8a91a4] text-sm my-8 flex items-center gap-4">
            <div className="flex-1 h-px bg-[#2a2e39]" />
            Start of conversation
            <div className="flex-1 h-px bg-[#2a2e39]" />
          </div>
        ) : null}

        {messages.map((msg, idx) => {
          const isUser = msg.senderType === 'user';
          const isAI = msg.senderType === 'ai';
          const isAgent = msg.senderType === 'agent';
          
          let bgClass = 'bg-[#1e2433]';
          let borderClass = 'border-transparent';
          let labelText = 'User';
          let labelColorClass = 'text-[#8a91a4]';

          if (isAI) {
            bgClass = 'bg-[rgba(245,158,11,0.08)]';
            borderClass = 'border-[#f59e0b]';
            labelText = 'AI';
            labelColorClass = 'text-[#f59e0b]';
          } else if (isAgent) {
            bgClass = 'bg-[rgba(255,51,102,0.08)]';
            borderClass = 'border-[#ff3366]';
            labelText = 'Agent';
            labelColorClass = 'text-[#ff3366]';
          }

          const date = new Date(msg.createdAt || Date.now());
          const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          return (
            <div key={msg.id || idx} className="flex justify-start w-full">
              <div className={`max-w-[75%] rounded-[12px] p-3 px-4 border ${bgClass} ${borderClass} relative`}>
                <div className="flex justify-between items-center mb-1 gap-4">
                  <span className={`text-xs font-semibold ${labelColorClass}`}>{labelText}</span>
                  <div className="flex items-center gap-1">
                    {msg.surface === 'app' ? (
                      <span className="text-[0.65rem] text-[#8a91a4] bg-[#1e2433] px-1.5 py-0.5 rounded">App</span>
                    ) : null}
                    {(msg.platform === 'whatsapp' || (!msg.platform && lead.channel === 'whatsapp')) ? (
                      <WhatsappLogo size={14} className="text-[#8a91a4]" />
                    ) : msg.platform === 'telegram' ? (
                      <TelegramLogo size={14} className="text-[#8a91a4]" />
                    ) : msg.surface === 'app' ? (
                      <DeviceMobile size={14} className="text-[#8a91a4]" />
                    ) : (
                      <WhatsappLogo size={14} className="text-[#8a91a4]" />
                    )}
                  </div>
                </div>
                <p className="text-[#d1d4dc] text-[0.95rem] whitespace-pre-wrap">{msg.text}</p>
                <div className="text-right mt-1">
                  <span className="text-[#8a91a4] text-[0.75rem]">{timeStr}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose Bar */}
      <div className="p-4 bg-[#0B0E14] border-t border-[#2a2e39] flex-shrink-0">
        {lead.mode === 'ai' ? (
          <div className="px-4 py-3 bg-[#131722] rounded-full text-center border border-[#2a2e39]">
            <span className="text-[#8a91a4] text-sm">Switch to Agent mode to reply</span>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex gap-2 relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 bg-[#131722] border border-[#2a2e39] rounded-[28px] px-5 py-3 text-white focus:outline-none focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff] transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="w-[48px] h-[48px] rounded-full flex items-center justify-center shrink-0 disabled:opacity-50 transition-opacity flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #00e5ff, #00bfff)' }}
            >
              <PaperPlaneRight weight="fill" className="text-black" size={20} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChatView;
