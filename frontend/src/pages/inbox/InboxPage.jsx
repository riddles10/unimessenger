import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import ConversationList from './ConversationList';
import ChatView from './ChatView';
import LeadPanel from './LeadPanel';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const socket = io(API_BASE);

export default function InboxPage() {
  const [leads, setLeads] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('all'); // all | whatsapp | telegram | agent
  const [alerts, setAlerts] = useState(new Set());

  const selectedLead = leads.find(l => l.id === selectedLeadId);

  // Fetch leads
  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/api/leads`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setLeads(data);
    }
  }

  // Fetch messages when selecting a lead
  useEffect(() => {
    if (!selectedLeadId) return;
    fetchMessages(selectedLeadId);
  }, [selectedLeadId]);

  async function fetchMessages(leadId) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/api/leads/${leadId}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setMessages(data);
    }
  }

  // Socket.io events
  useEffect(() => {
    socket.on('new_message', (data) => {
      // Update message list if viewing this lead
      if (data.leadId === selectedLeadId) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          lead_id: data.leadId,
          direction: data.direction,
          text: data.message,
          platform: data.platform,
          sent_by: data.sentBy || (data.direction === 'inbound' ? 'user' : 'ai'),
          created_at: data.timestamp
        }]);
      }
      // Bump lead to top of list
      setLeads(prev => {
        const updated = prev.map(l =>
          l.id === data.leadId
            ? { ...l, updated_at: data.timestamp, last_message: data.message }
            : l
        );
        return updated.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      });
    });

    socket.on('funnel_update', (data) => {
      setLeads(prev => prev.map(l =>
        l.id === data.leadId ? { ...l, stage: data.stage || l.stage, intent: data.intent } : l
      ));
    });

    socket.on('agent_alert', (data) => {
      setAlerts(prev => new Set([...prev, data.leadId]));
    });

    socket.on('mode_changed', (data) => {
      setLeads(prev => prev.map(l =>
        l.id === data.leadId ? { ...l, mode: data.mode, assigned_agent_id: data.agentId } : l
      ));
    });

    return () => {
      socket.off('new_message');
      socket.off('funnel_update');
      socket.off('agent_alert');
      socket.off('mode_changed');
    };
  }, [selectedLeadId]);

  // Filter leads
  const filteredLeads = leads.filter(l => {
    if (filter === 'whatsapp') return l.preferred_channel === 'whatsapp';
    if (filter === 'telegram') return l.preferred_channel === 'telegram';
    if (filter === 'agent') return l.mode === 'agent';
    return true;
  });

  async function handleModeToggle(leadId, newMode) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/api/leads/${leadId}/mode`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mode: newMode })
    });
    if (res.ok) {
      setLeads(prev => prev.map(l =>
        l.id === leadId ? { ...l, mode: newMode } : l
      ));
    }
  }

  async function handleSendMessage(leadId, text) {
    const token = localStorage.getItem('token');
    await fetch(`${API_BASE}/api/leads/${leadId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });
  }

  async function handleUpdateLead(leadId, updates) {
    const token = localStorage.getItem('token');
    await fetch(`${API_BASE}/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });
    setLeads(prev => prev.map(l =>
      l.id === leadId ? { ...l, ...updates } : l
    ));
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left sidebar — conversation list */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-semibold text-gray-900">Pipsight Inbox</h1>
          <div className="flex gap-1 mt-3">
            {['all', 'whatsapp', 'telegram', 'agent'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs rounded-full capitalize ${
                  filter === f
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'agent' ? 'Agent Live' : f}
              </button>
            ))}
          </div>
        </div>
        <ConversationList
          leads={filteredLeads}
          selectedLeadId={selectedLeadId}
          onSelect={(id) => {
            setSelectedLeadId(id);
            setAlerts(prev => { const s = new Set(prev); s.delete(id); return s; });
          }}
          alerts={alerts}
        />
      </div>

      {/* Centre — chat view */}
      <div className="flex-1 flex flex-col">
        {selectedLead ? (
          <ChatView
            lead={selectedLead}
            messages={messages}
            onSendMessage={(text) => handleSendMessage(selectedLead.id, text)}
            onModeToggle={(mode) => handleModeToggle(selectedLead.id, mode)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Select a conversation to start
          </div>
        )}
      </div>

      {/* Right panel — lead details */}
      {selectedLead && (
        <div className="w-80 border-l border-gray-200 bg-white">
          <LeadPanel
            lead={selectedLead}
            messageCount={messages.length}
            onUpdateLead={(updates) => handleUpdateLead(selectedLead.id, updates)}
          />
        </div>
      )}
    </div>
  );
}
