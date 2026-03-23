const STAGE_COLORS = {
  new_lead: 'bg-blue-100 text-blue-700',
  qualified: 'bg-purple-100 text-purple-700',
  demo_sent: 'bg-yellow-100 text-yellow-700',
  negotiating: 'bg-orange-100 text-orange-700',
  converted: 'bg-green-100 text-green-700'
};

function ChannelBadge({ channel }) {
  if (channel === 'whatsapp') {
    return <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-700">WA</span>;
  }
  if (channel === 'telegram') {
    return <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-700">TG</span>;
  }
  return null;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function ConversationList({ leads, selectedLeadId, onSelect, alerts }) {
  return (
    <div className="flex-1 overflow-y-auto">
      {leads.length === 0 && (
        <div className="p-4 text-sm text-gray-400 text-center">No conversations yet</div>
      )}
      {leads.map(lead => (
        <button
          key={lead.id}
          onClick={() => onSelect(lead.id)}
          className={`w-full text-left p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
            selectedLeadId === lead.id ? 'bg-blue-50' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {alerts.has(lead.id) && (
                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
              )}
              <span className="font-medium text-sm text-gray-900 truncate">
                {lead.name || lead.phone || 'Unknown'}
              </span>
              <ChannelBadge channel={lead.preferred_channel} />
            </div>
            <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
              {timeAgo(lead.updated_at)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${STAGE_COLORS[lead.stage] || 'bg-gray-100 text-gray-600'}`}>
              {lead.stage?.replace(/_/g, ' ')}
            </span>
            {lead.mode === 'agent' && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700">LIVE</span>
            )}
          </div>
          {lead.last_message && (
            <p className="text-xs text-gray-500 mt-1 truncate">{lead.last_message}</p>
          )}
        </button>
      ))}
    </div>
  );
}
