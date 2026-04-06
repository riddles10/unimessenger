import React, { useState, useEffect } from 'react';
import { Gear, SignOut } from '@phosphor-icons/react';
import ConversationList from './ConversationList';
import ChatView from './ChatView';
import LeadPanel from './LeadPanel';
import SettingsModal from '../../components/SettingsModal';
import NewConversationModal from '../../components/NewConversationModal';
import { fetchLeads, fetchMessages, toggleMode, lookupLead, markLeadRead } from '../../utils/api';
import { getSocket } from '../../utils/socket';

const InboxPage = ({ user, onLogout }) => {
  const [leads, setLeads] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('All');
  const [sortKey, setSortKey] = useState(() => localStorage.getItem('inbox_sort') || 'recent');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Persist sort preference across sessions
  useEffect(() => {
    localStorage.setItem('inbox_sort', sortKey);
  }, [sortKey]);

  const [isNewConvoOpen, setIsNewConvoOpen] = useState(false);
  const [newConvoInitialValues, setNewConvoInitialValues] = useState(null);

  // Fetch initial leads
  useEffect(() => {
    const loadLeads = async () => {
      try {
        const data = await fetchLeads();
        setLeads(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load leads', err);
      }
    };
    loadLeads();
  }, []);

  // Deep-link handling: when the inbox is opened from a Pipsight Slack
  // notification, the URL carries `?pipsight_user_id=…` (and optionally
  // `phone`, `name`, `email`). Look up the matching lead and either select
  // it or open the new-conversation modal pre-filled.
  //
  // Runs exactly once on mount. The URL is cleaned up afterwards so a
  // refresh / re-render doesn't re-fire the action.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pipsightUserId = params.get('pipsight_user_id');
    const phone = params.get('phone');
    const email = params.get('email');
    const name = params.get('name');

    if (!pipsightUserId && !phone && !email) return;

    const cleanUrl = () => {
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    (async () => {
      try {
        const lead = await lookupLead({
          pipsight_user_id: pipsightUserId,
          phone,
          email,
        });

        if (lead) {
          // Make sure the lead exists in local state before selecting it,
          // otherwise ConversationList won't be able to render the row.
          setLeads((prev) => (prev.some((l) => l.id === lead.id) ? prev : [lead, ...prev]));
          setSelectedLeadId(lead.id);
        } else if (phone || pipsightUserId) {
          // No lead yet — open the modal pre-filled so the agent can start one
          setNewConvoInitialValues({
            name: name || '',
            phone: phone || '',
          });
          setIsNewConvoOpen(true);
        }
      } catch (err) {
        console.error('Deep-link lookup failed', err);
      } finally {
        cleanUrl();
      }
    })();
  }, []);

  // Fetch messages when lead selected
  useEffect(() => {
    if (!selectedLeadId) return;
    
    const loadMessages = async () => {
      try {
        const data = await fetchMessages(selectedLeadId);
        setMessages(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load messages', err);
      }
    };
    loadMessages();
  }, [selectedLeadId]);

  // Socket setup
  useEffect(() => {
    const socket = getSocket();

    socket.on('new_message', ({ leadId, message }) => {
      // Add message if viewing this lead
      if (leadId === selectedLeadId) {
        setMessages(prev => [...prev, message]);
      }

      // Update lead preview in place. ConversationList re-sorts on every
      // render based on lead.updated_at, so we don't need to manually move
      // the lead within the array — bumping updated_at is enough.
      //
      // Unread count: only inbound (senderType === 'user') messages count,
      // and only when the agent isn't currently viewing the conversation.
      const isInbound = message.senderType === 'user';
      const isViewing = leadId === selectedLeadId;

      setLeads(prev => prev.map(l => {
        if (l.id !== leadId) return l;
        return {
          ...l,
          lastMessage: message.text,
          updated_at: message.createdAt || new Date().toISOString(),
          unreadCount: isInbound && !isViewing
            ? (l.unreadCount || 0) + 1
            : (l.unreadCount || 0),
        };
      }));
    });

    socket.on('funnel_update', ({ leadId, stage, intent }) => {
      setLeads(prev => prev.map(l => 
        l.id === leadId ? { ...l, stage, intent } : l
      ));
    });

    socket.on('agent_alert', ({ leadId }) => {
      setLeads(prev => prev.map(l => 
        l.id === leadId ? { ...l, shouldAlertAgent: true } : l
      ));
    });

    socket.on('mode_changed', ({ leadId, mode }) => {
      setLeads(prev => prev.map(l => 
        l.id === leadId ? { ...l, mode } : l
      ));
    });

    return () => {
      socket.off('new_message');
      socket.off('funnel_update');
      socket.off('agent_alert');
      socket.off('mode_changed');
    };
  }, [selectedLeadId]);

  const handleSelectLead = (id) => {
    setSelectedLeadId(id);
    // Optimistically clear the unread badge + alert dot the moment the agent
    // opens the conversation, then persist the read receipt server-side.
    setLeads(prev => prev.map(l =>
      l.id === id ? { ...l, shouldAlertAgent: false, unreadCount: 0 } : l
    ));
    markLeadRead(id).catch(err => console.error('Failed to mark lead as read', err));
  };

  const handleToggleMode = async (mode) => {
    if (!selectedLeadId) return;
    try {
      // Optimistically update
      setLeads(prev => prev.map(l => 
        l.id === selectedLeadId ? { ...l, mode } : l
      ));
      await toggleMode(selectedLeadId, mode);
    } catch (err) {
      console.error('Failed to toggle mode', err);
    }
  };

  // After the support agent sends an outbound message: refresh the leads list
  // (so a brand-new lead row appears) and select the conversation.
  const handleOutboundSent = async (newLeadId) => {
    try {
      const data = await fetchLeads();
      setLeads(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to refresh leads after outbound send', err);
    }
    if (newLeadId) setSelectedLeadId(newLeadId);
  };

  const selectedLead = leads.find(l => l.id === selectedLeadId);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0B0E14] text-white font-sans">
      {/* Top Header Logo Bar as requested in layout logic */}
      <div className="h-[56px] w-full border-b border-[#2a2e39] bg-[#131722] flex items-center px-6 flex-shrink-0 z-10">
        <div className="w-8 h-8 rounded bg-[#00e5ff] flex items-center justify-center mr-4 text-black font-bold">P</div>
        <h1 className="font-semibold text-lg tracking-wide border-r border-[#2a2e39] pr-4 mr-4">Pipsight Inbox</h1>
        <span className="text-[#8a91a4] text-sm hidden sm:inline-block">Agent: <strong className="text-white">{user?.email || 'Agent'}</strong></span>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#8a91a4] hover:text-[#00e5ff] hover:bg-[#1e2433] transition-colors"
            title="Settings"
          >
            <Gear size={22} weight="bold" />
          </button>
          <button
            onClick={onLogout}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#8a91a4] hover:text-[#ff3366] hover:bg-[#1e2433] transition-colors"
            title="Sign out"
          >
            <SignOut size={20} weight="bold" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <ConversationList
          leads={leads}
          selectedLeadId={selectedLeadId}
          onSelectLead={handleSelectLead}
          filter={filter}
          setFilter={setFilter}
          sortKey={sortKey}
          setSortKey={setSortKey}
          onNewConversation={() => setIsNewConvoOpen(true)}
        />
        <ChatView 
          lead={selectedLead}
          messages={messages}
          onToggleMode={handleToggleMode}
        />
        <LeadPanel
          lead={selectedLead}
        />
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <NewConversationModal
        isOpen={isNewConvoOpen}
        onClose={() => {
          setIsNewConvoOpen(false);
          setNewConvoInitialValues(null);
        }}
        onSent={handleOutboundSent}
        initialValues={newConvoInitialValues}
      />
    </div>
  );
};

export default InboxPage;
