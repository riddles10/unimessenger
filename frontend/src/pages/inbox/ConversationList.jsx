import React from 'react';
import Badge from '../../components/Badge';
import { STAGE_COLORS } from '../../utils/constants';

const ConversationList = ({ leads, selectedLeadId, onSelectLead, filter, setFilter }) => {
  const filters = ['All', 'WhatsApp', 'Telegram', 'Agent Mode'];
  
  const filteredLeads = leads.filter(lead => {
    if (filter === 'WhatsApp') return lead.channel === 'whatsapp';
    if (filter === 'Telegram') return lead.channel === 'telegram';
    if (filter === 'Agent Mode') return lead.mode === 'agent';
    return true;
  });

  return (
    <div className="w-[280px] h-full flex flex-col bg-[#0B0E14] border-r border-[#2a2e39] overflow-hidden flex-shrink-0 hidden md:flex">
      <div className="p-4 border-b border-[#2a2e39]">
        <h2 className="text-white font-semibold text-lg mb-3">Chats</h2>
        <div className="flex flex-wrap gap-2">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                filter === f 
                  ? 'bg-[#00e5ff] text-black border-[#00e5ff]' 
                  : 'bg-transparent text-[#8a91a4] border-[#2a2e39] hover:bg-[#131722]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {filteredLeads.map(lead => {
          const isSelected = selectedLeadId === lead.id;
          const stageStyle = STAGE_COLORS[lead.stage];
          
          const date = new Date(lead.updated_at || Date.now());
          const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          return (
            <div
              key={lead.id}
              onClick={() => onSelectLead(lead.id)}
              className={`p-4 border-b border-[#2a2e39] cursor-pointer transition-colors relative ${
                isSelected ? 'bg-[#1e2433] border-l-2 border-l-[#00e5ff]' : 'bg-transparent hover:bg-[#1a1f2e] border-l-2 border-l-transparent'
              }`}
            >
              {lead.shouldAlertAgent && (
                <span className="absolute top-4 left-2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff3366] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff3366]"></span>
                </span>
              )}
              
              <div className="flex justify-between items-start mb-1 pl-2">
                <span className="text-white font-semibold truncate max-w-[140px]">{lead.name}</span>
                <span className="text-[#8a91a4] text-xs whitespace-nowrap">{timeString}</span>
              </div>
              
              <div className="flex items-center gap-2 mb-2 pl-2">
                <Badge 
                  colorStyles={{
                    bg: lead.channel === 'whatsapp' ? 'rgba(0,255,136,0.1)' : 'rgba(0,229,255,0.1)',
                    text: lead.channel === 'whatsapp' ? '#00ff88' : '#00e5ff',
                  }}
                >
                  {lead.channel === 'whatsapp' ? 'WA' : 'TG'}
                </Badge>
                
                {stageStyle && (
                  <Badge colorStyles={stageStyle}>
                    {lead.stage ? lead.stage.replace('_', ' ') : 'new lead'}
                  </Badge>
                )}
              </div>
              
              <div className="pl-2">
                <p className="text-[#8a91a4] text-[0.85rem] truncate">
                  {lead.lastMessage || 'No messages yet...'}
                </p>
              </div>
            </div>
          );
        })}
        {filteredLeads.length === 0 && (
          <div className="p-4 text-center text-[#8a91a4] text-sm mt-10">
            No conversations found.
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationList;
