import { BACKEND_URL } from './constants';

function getHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

// ── Auth ────────────────────────────────────────────────────────

export const login = async (email, password) => {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
};

export const verifyToken = async () => {
  const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
    headers: getHeaders()
  });
  if (!res.ok) throw new Error('Token invalid');
  return res.json();
};

export const fetchLeads = async () => {
  const res = await fetch(`${BACKEND_URL}/api/leads`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch leads: ${res.status}`);
  return res.json();
};

export const fetchMessages = async (leadId) => {
  const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}/messages`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);
  return res.json();
};

export const toggleMode = async (leadId, mode) => {
  const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}/mode`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ mode })
  });
  if (!res.ok) throw new Error(`Failed to toggle mode: ${res.status}`);
  return res.json();
};

export const sendMessage = async (leadId, text) => {
  const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}/messages`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);
  return res.json();
};

export const updateLead = async (leadId, updates) => {
  const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error(`Failed to update lead: ${res.status}`);
  return res.json();
};
