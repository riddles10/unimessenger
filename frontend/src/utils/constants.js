export const STAGE_COLORS = {
  new_lead: { bg: 'rgba(0,229,255,0.1)', text: '#00e5ff', border: '#00e5ff' },
  qualified: { bg: 'rgba(168,85,247,0.1)', text: '#a855f7', border: '#a855f7' },
  demo_sent: { bg: 'rgba(234,179,8,0.1)', text: '#eab308', border: '#eab308' },
  negotiating: { bg: 'rgba(249,115,22,0.1)', text: '#f97316', border: '#f97316' },
  converted: { bg: 'rgba(0,255,136,0.1)', text: '#00ff88', border: '#00ff88' },
};

export const STAGES_ORDER = [
  'new_lead',
  'qualified',
  'demo_sent',
  'negotiating',
  'converted'
];

export const INTENT_COLORS = {
  browsing: { bg: 'transparent', text: 'var(--color-text-muted)', border: 'var(--color-border-subtle)' },
  interested: { bg: 'rgba(0,229,255,0.1)', text: 'var(--color-electric-blue)', border: 'var(--color-electric-blue)' },
  objecting: { bg: 'rgba(245,158,11,0.1)', text: 'var(--color-amber)', border: 'var(--color-amber)' },
  ready_to_buy: { bg: 'rgba(0,255,136,0.1)', text: 'var(--color-neon-green)', border: 'var(--color-neon-green)' }
};

export const BACKEND_URL = 'https://unimessenger.onrender.com';
export const AUTH_TOKEN = 'mock-supabase-jwt';
