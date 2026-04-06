import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Plus, ArrowsDownUp, Check } from '@phosphor-icons/react';
import Badge from '../../components/Badge';
import { STAGE_COLORS } from '../../utils/constants';

const SORT_OPTIONS = [
  { key: 'recent', label: 'Most recent' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'name',   label: 'Name A–Z' },
  { key: 'unread', label: 'Most unread' },
];

const FILTERS = ['All', 'Unread', 'WhatsApp', 'Telegram', 'Agent Mode'];

const ConversationList = ({
  leads,
  selectedLeadId,
  onSelectLead,
  filter,
  setFilter,
  sortKey,
  setSortKey,
  onNewConversation,
}) => {
  const [sortOpen, setSortOpen] = useState(false);
  const sortBtnRef = useRef(null);

  // Close the sort menu when clicking outside it
  useEffect(() => {
    if (!sortOpen) return;
    const onDocClick = (e) => {
      if (sortBtnRef.current && !sortBtnRef.current.contains(e.target)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [sortOpen]);

  // Filter + sort. Computed from props on every render so that socket-driven
  // updates to lead.updated_at / lead.unreadCount immediately re-order the
  // list — no manual splice/unshift needed in the parent.
  const visibleLeads = useMemo(() => {
    const filtered = leads.filter((lead) => {
      if (filter === 'WhatsApp')   return lead.channel === 'whatsapp';
      if (filter === 'Telegram')   return lead.channel === 'telegram';
      if (filter === 'Agent Mode') return lead.mode === 'agent';
      if (filter === 'Unread')     return (lead.unreadCount || 0) > 0;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortKey === 'unread') {
        const diff = (b.unreadCount || 0) - (a.unreadCount || 0);
        if (diff !== 0) return diff;
        // Tie-break unread sort by recency so identical-unread leads still feel ordered
        return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
      }
      const aTime = new Date(a.updated_at || 0).getTime();
      const bTime = new Date(b.updated_at || 0).getTime();
      if (sortKey === 'oldest') return aTime - bTime;
      return bTime - aTime; // 'recent' (default)
    });

    return sorted;
  }, [leads, filter, sortKey]);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label || 'Most recent';

  return (
    <div className="w-[280px] h-full flex flex-col bg-[#0B0E14] border-r border-[#2a2e39] overflow-hidden flex-shrink-0 hidden md:flex">
      <div className="p-4 border-b border-[#2a2e39]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-lg">Chats</h2>
          {onNewConversation && (
            <button
              onClick={onNewConversation}
              className="w-8 h-8 rounded-full flex items-center justify-center text-black bg-[#00e5ff] hover:bg-[#00bfff] shadow-[0_0_10px_rgba(0,229,255,0.4)] transition-colors"
              title="New conversation"
            >
              <Plus size={16} weight="bold" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {FILTERS.map((f) => (
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

        {/* Sort dropdown */}
        <div className="relative" ref={sortBtnRef}>
          <button
            onClick={() => setSortOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-[#8a91a4] hover:text-white transition-colors"
            title="Sort conversations"
          >
            <ArrowsDownUp size={12} />
            <span>Sort: <span className="text-[#d1d4dc]">{currentSortLabel}</span></span>
          </button>

          {sortOpen && (
            <div className="absolute top-full left-0 mt-1 bg-[#131722] border border-[#2a2e39] rounded-lg shadow-xl z-20 min-w-[160px] overflow-hidden">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    setSortKey(opt.key);
                    setSortOpen(false);
                  }}
                  className={`flex items-center justify-between w-full text-left px-3 py-2 text-xs transition-colors ${
                    sortKey === opt.key
                      ? 'bg-[#1e2433] text-[#00e5ff]'
                      : 'text-[#d1d4dc] hover:bg-[#1e2433]'
                  }`}
                >
                  <span>{opt.label}</span>
                  {sortKey === opt.key && <Check size={12} weight="bold" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {visibleLeads.map((lead) => {
          const isSelected = selectedLeadId === lead.id;
          const stageStyle = STAGE_COLORS[lead.stage];
          const unread = lead.unreadCount || 0;

          const date = new Date(lead.updated_at || Date.now());
          const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          return (
            <div
              key={lead.id}
              onClick={() => onSelectLead(lead.id)}
              className={`p-4 border-b border-[#2a2e39] cursor-pointer transition-colors relative ${
                isSelected
                  ? 'bg-[#1e2433] border-l-2 border-l-[#00e5ff]'
                  : 'bg-transparent hover:bg-[#1a1f2e] border-l-2 border-l-transparent'
              }`}
            >
              {lead.shouldAlertAgent && (
                <span className="absolute top-4 left-2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff3366] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff3366]"></span>
                </span>
              )}

              <div className="flex justify-between items-start mb-1 pl-2 gap-2">
                <span className={`truncate max-w-[140px] ${unread > 0 && !isSelected ? 'text-white font-bold' : 'text-white font-semibold'}`}>
                  {lead.name}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {unread > 0 && !isSelected && (
                    <span
                      className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#00e5ff] text-black text-[10px] font-bold flex items-center justify-center shadow-[0_0_6px_rgba(0,229,255,0.5)]"
                      title={`${unread} unread`}
                    >
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                  <span className="text-[#8a91a4] text-xs whitespace-nowrap">{timeString}</span>
                </div>
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
                <p className={`text-[0.85rem] truncate ${unread > 0 && !isSelected ? 'text-[#d1d4dc]' : 'text-[#8a91a4]'}`}>
                  {lead.lastMessage || 'No messages yet...'}
                </p>
              </div>
            </div>
          );
        })}
        {visibleLeads.length === 0 && (
          <div className="p-4 text-center text-[#8a91a4] text-sm mt-10">
            No conversations found.
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationList;
