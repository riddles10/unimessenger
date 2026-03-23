export const mockLeads = [
  {
    id: 'l1',
    name: 'Alex Johnson',
    phone: '+1 (555) 019-2034',
    email: 'alex.j@example.com',
    channel: 'whatsapp',
    stage: 'qualified',
    intent: 'interested',
    mode: 'agent',
    msgCount: 4,
    daysInFunnel: 2,
    score: 85,
    shouldAlertAgent: true,
    lastMessage: 'Can you show me how the trading bot works?',
    updated_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    notes: 'Seems very interested in algorithmic features.'
  },
  {
    id: 'l2',
    name: 'Sarah Chen',
    phone: '+44 7700 900077',
    email: 'sarah.c@example.com',
    channel: 'telegram',
    stage: 'demo_sent',
    intent: 'browsing',
    mode: 'ai',
    msgCount: 12,
    daysInFunnel: 5,
    score: 60,
    shouldAlertAgent: false,
    lastMessage: 'Thanks, I will review the demo video later today.',
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    notes: ''
  }
];

export const mockMessages = {
  'l1': [
    { id: 'm1', text: 'Hi, I saw your ad for Pipsight on Instagram.', senderType: 'user', platform: 'whatsapp', createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
    { id: 'm2', text: 'Hello Alex! Welcome to Pipsight. How can we help you boost your trading today?', senderType: 'ai', platform: 'whatsapp', createdAt: new Date(Date.now() - 1000 * 60 * 14).toISOString() },
    { id: 'm3', text: 'Can you show me how the trading bot works?', senderType: 'user', platform: 'whatsapp', createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
  ],
  'l2': [
    { id: 'm4', text: 'Hello', senderType: 'user', platform: 'telegram', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
    { id: 'm5', text: 'Hi Sarah. Here is the demo video you requested: [Link]', senderType: 'agent', platform: 'telegram', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 23).toISOString() },
    { id: 'm6', text: 'Thanks, I will review the demo video later today.', senderType: 'user', platform: 'telegram', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
  ]
};
