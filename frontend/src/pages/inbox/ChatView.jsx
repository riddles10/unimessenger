import { useState, useRef, useEffect } from 'react';
import AgentModeToggle from './AgentModeToggle';

function ChannelBadge({ platform }) {
  if (platform === 'whatsapp') {
    return <span className="inline-flex items-center px-1 py-0.5 text-[9px] font-medium rounded bg-green-100 text-green-700">WA</span>;
  }
  if (platform === 'telegram') {
    return <span className="inline-flex items-center px-1 py-0.5 text-[9px] font-medium rounded bg-blue-100 text-blue-700">TG</span>;
  }
  return null;
}

function MessageBubble({ msg }) {
  const isInbound = msg.direction === 'inbound';
  const isAgent = msg.sent_by === 'agent';
  const isAI = msg.sent_by === 'ai';

  let bgColor = 'bg-gray-100 text-gray-900'; // default user inbound
  if (isAI) bgColor = 'bg-amber-50 text-gray-900 border border-amber-200';
  if (isAgent) bgColor = 'bg-red-50 text-gray-900 border border-red-200';

  const time = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'} mb-2`}>
      <div className={`max-w-[70%] rounded-lg px-3 py-2 ${bgColor}`}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-medium text-gray-500 uppercase">
            {isInbound ? 'User' : isAgent ? 'Agent' : 'AI'}
          </span>
          <ChannelBadge platform={msg.platform} />
        </div>
        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
        <span className="text-[10px] text-gray-400 mt-1 block text-right">{time}</span>
      </div>
    </div>
  );
}

export default function ChatView({ lead, messages, onSendMessage, onModeToggle }) {
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    onSendMessage(draft.trim());
    setDraft('');
  }

  const isAgentMode = lead.mode === 'agent';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div>
          <h2 className="font-semibold text-gray-900">{lead.name || lead.phone}</h2>
          <span className="text-xs text-gray-500">{lead.phone}</span>
        </div>
        <AgentModeToggle
          mode={lead.mode}
          assignedAgentId={lead.assigned_agent_id}
          onToggle={onModeToggle}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose bar */}
      <div className="border-t border-gray-200 bg-white p-3">
        {isAgentMode ? (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Send
            </button>
          </form>
        ) : (
          <div className="text-center py-2 text-sm text-gray-400" title="Switch to Agent mode to type manually">
            AI is handling this conversation. Switch to Agent mode to reply manually.
          </div>
        )}
      </div>
    </div>
  );
}
