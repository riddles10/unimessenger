import React, { useState, useEffect } from 'react';
import { Gear, SignOut } from '@phosphor-icons/react';
import ConversationList from './ConversationList';
import ChatView from './ChatView';
import LeadPanel from './LeadPanel';
import SettingsModal from '../../components/SettingsModal';
import { fetchLeads, fetchMessages, toggleMode } from '../../utils/api';
import { getSocket } from '../../utils/socket';

const InboxPage = ({ user, onLogout }) => {
  const [leads, setLeads] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('All');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
      
      // Update lead preview
      setLeads(prev => {
        const idx = prev.findIndex(l => l.id === leadId);
        if (idx === -1) return prev;
        const newLeads = [...prev];
        const lead = { ...newLeads[idx] };
        lead.lastMessage = message.text;
        lead.updated_at = message.createdAt || Date.now();
        // Bump to top
        newLeads.splice(idx, 1);
        newLeads.unshift(lead);
        return newLeads;
      });
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
    // Dismiss alert when selecting
    setLeads(prev => prev.map(l => 
      l.id === id ? { ...l, shouldAlertAgent: false } : l
    ));
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
    </div>
  );
};

export default InboxPage;
