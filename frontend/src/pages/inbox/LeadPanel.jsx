import { useState } from 'react';

const FUNNEL_STAGES = ['new_lead', 'qualified', 'demo_sent', 'negotiating', 'converted'];

const STAGE_LABELS = {
  new_lead: 'New Lead',
  qualified: 'Qualified',
  demo_sent: 'Demo Sent',
  negotiating: 'Negotiating',
  converted: 'Converted'
};

const STAGE_COLORS = {
  new_lead: 'bg-blue-500',
  qualified: 'bg-purple-500',
  demo_sent: 'bg-yellow-500',
  negotiating: 'bg-orange-500',
  converted: 'bg-green-500'
};

function ChannelIndicator({ channel }) {
  if (channel === 'whatsapp') {
    return <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">WhatsApp</span>;
  }
  if (channel === 'telegram') {
    return <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Telegram</span>;
  }
  return <span className="text-xs text-gray-400">Unknown</span>;
}

export default function LeadPanel({ lead, messageCount, onUpdateLead }) {
  const [notes, setNotes] = useState(lead.notes || '');

  const currentStageIdx = FUNNEL_STAGES.indexOf(lead.stage);
  const daysInFunnel = lead.created_at
    ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)
    : 0;

  function handleNotesBlur() {
    if (notes !== (lead.notes || '')) {
      onUpdateLead({ notes });
    }
  }

  return (
    <div className="p-4 overflow-y-auto h-full">
      {/* Lead info */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-900 text-lg">{lead.name || 'Unknown'}</h3>
        <p className="text-sm text-gray-500 mt-1">{lead.phone}</p>
        {lead.email && <p className="text-sm text-gray-500">{lead.email}</p>}
        <div className="mt-2">
          <ChannelIndicator channel={lead.preferred_channel} />
        </div>
      </div>

      {/* Funnel progress */}
      <div className="mb-6">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Funnel Stage</h4>
        <div className="space-y-2">
          {FUNNEL_STAGES.map((stage, idx) => {
            const isActive = idx <= currentStageIdx;
            const isCurrent = idx === currentStageIdx;
            return (
              <div key={stage} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                  isActive ? STAGE_COLORS[stage] : 'bg-gray-200'
                } ${isCurrent ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`} />
                <span className={`text-sm ${isCurrent ? 'font-semibold text-gray-900' : isActive ? 'text-gray-700' : 'text-gray-400'}`}>
                  {STAGE_LABELS[stage]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Intent */}
      {lead.intent && (
        <div className="mb-6">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Intent</h4>
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 capitalize">
            {lead.intent?.replace(/_/g, ' ')}
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="mb-6">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Engagement</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-lg font-semibold text-gray-900">{messageCount}</div>
            <div className="text-[10px] text-gray-500">Messages</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-lg font-semibold text-gray-900">{daysInFunnel}</div>
            <div className="text-[10px] text-gray-500">Days in Funnel</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-lg font-semibold text-gray-900">{lead.lead_score || 0}</div>
            <div className="text-[10px] text-gray-500">Lead Score</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-lg font-semibold text-gray-900 capitalize">{lead.mode}</div>
            <div className="text-[10px] text-gray-500">Mode</div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</h4>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Add notes about this lead..."
          rows={4}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>
    </div>
  );
}
