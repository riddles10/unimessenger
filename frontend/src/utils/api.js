import { BACKEND_URL, AUTH_TOKEN } from './constants';
import { mockLeads, mockMessages } from './mockData';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`
};

// Simple in-memory mutation for mock state to persist during the session
let localLeads = [...mockLeads];
let localMessages = { ...mockMessages };

export const fetchLeads = async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/leads`, { headers });
    if (!res.ok) throw new Error('API failed');
    return res.json();
  } catch (err) {
    // Fallback to simulation
    console.log('Using mock leads');
    return localLeads;
  }
};

export const fetchMessages = async (leadId) => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}/messages`, { headers });
    if (!res.ok) throw new Error('API failed');
    return res.json();
  } catch (err) {
    // Fallback to simulation
    console.log(`Using mock messages for ${leadId}`);
    return localMessages[leadId] || [];
  }
};

export const toggleMode = async (leadId, mode) => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mode })
    });
    if (!res.ok) throw new Error('API failed');
    return res.json();
  } catch (err) {
    const lead = localLeads.find(l => l.id === leadId);
    if (lead) lead.mode = mode;
    return { success: true };
  }
};

export const sendMessage = async (leadId, text) => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error('API failed');
    return res.json();
  } catch (err) {
    const lead = localLeads.find(l => l.id === leadId);
    const newMessage = {
      id: `m_${Date.now()}`,
      text: text,
      senderType: lead?.mode === 'agent' ? 'agent' : 'ai',
      platform: lead?.channel || 'whatsapp',
      createdAt: new Date().toISOString()
    };
    if (!localMessages[leadId]) localMessages[leadId] = [];
    localMessages[leadId].push(newMessage);
    if (lead) {
      lead.lastMessage = text;
      lead.updated_at = new Date().toISOString();
    }
    return newMessage;
  }
};

export const updateLead = async (leadId, updates) => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('API failed');
    return res.json();
  } catch (err) {
    const lead = localLeads.find(l => l.id === leadId);
    if (lead) {
      Object.assign(lead, updates);
    }
    return lead;
  }
};
