import React, { useState, useEffect } from 'react';
import FunnelTracker from '../../components/FunnelTracker';
import Badge from '../../components/Badge';
import { WhatsappLogo, TelegramLogo } from '@phosphor-icons/react';
import { INTENT_COLORS } from '../../utils/constants';
import { updateLead } from '../../utils/api';

const LeadPanel = ({ lead }) => {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setNotes(lead?.notes || '');
  }, [lead?.id]); // Re-initialize when lead changes

  if (!lead) return <div className="w-[320px] bg-[#131722] border-l border-[#2a2e39] hidden lg:block flex-shrink-0" />;

  const handleNotesBlur = async () => {
    if (notes !== lead.notes) {
      try {
        await updateLead(lead.id, { notes });
      } catch (err) {
        console.error('Failed to save notes', err);
      }
    }
  };

  const intentStyle = INTENT_COLORS[lead.intent] || INTENT_COLORS.browsing;

  return (
    <div className="w-[320px] h-full bg-[#131722] border-l border-[#2a2e39] flex flex-col overflow-y-auto hidden lg:flex flex-shrink-0">
      {/* Contact Info */}
      <div className="p-6 border-b border-[#2a2e39] flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-[#1e2433] flex items-center justify-center mb-4">
          {lead.channel === 'whatsapp' ? (
            <WhatsappLogo size={32} className="text-[#00ff88]" />
          ) : (
            <TelegramLogo size={32} className="text-[#00e5ff]" />
          )}
        </div>
        <h2 className="text-white text-[1.1rem] font-semibold">{lead.name}</h2>
        <p className="text-[#8a91a4] text-sm mt-1">{lead.phone}</p>
        {lead.email && <p className="text-[#8a91a4] text-sm mt-1">{lead.email}</p>}
      </div>

      <div className="p-6 flex-1 flex flex-col gap-6">
        {/* Intent Badge */}
        <div className="flex flex-col gap-2">
          <span className="text-[#8a91a4] text-xs font-semibold uppercase tracking-wider">Intent</span>
          <div className="flex">
            <Badge colorStyles={intentStyle}>
              {lead.intent ? lead.intent.replace('_', ' ') : 'browsing'}
            </Badge>
          </div>
        </div>

        {/* Funnel Tracker */}
        <div className="flex flex-col gap-2">
          <span className="text-[#8a91a4] text-xs font-semibold uppercase tracking-wider">Funnel Stage</span>
          <FunnelTracker currentStage={lead.stage} />
        </div>

        {/* Engagement Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#1e2433] rounded-lg p-3 flex flex-col items-center justify-center border border-[#2a2e39]">
            <span className="text-[#8a91a4] text-[0.75rem]">Messages</span>
            <span className="text-white font-semibold text-lg">{lead.msgCount || 0}</span>
          </div>
          <div className="bg-[#1e2433] rounded-lg p-3 flex flex-col items-center justify-center border border-[#2a2e39]">
            <span className="text-[#8a91a4] text-[0.75rem]">Days in Funnel</span>
            <span className="text-white font-semibold text-lg">{lead.daysInFunnel || 1}</span>
          </div>
          <div className="bg-[#1e2433] rounded-lg p-3 flex flex-col items-center justify-center border border-[#2a2e39]">
            <span className="text-[#8a91a4] text-[0.75rem]">Lead Score</span>
            <span className="text-white font-semibold text-lg">{lead.score || 0}/100</span>
          </div>
          <div className="bg-[#1e2433] rounded-lg p-3 flex flex-col items-center justify-center border border-[#2a2e39]">
            <span className="text-[#8a91a4] text-[0.75rem]">Mode</span>
            <span className="text-white font-semibold text-lg flex items-center gap-1">
              {lead.mode === 'ai' ? '🤖 AI' : '👨‍💻 Agt'}
            </span>
          </div>
        </div>

        {/* Notes Textarea */}
        <div className="flex flex-col gap-2 flex-1 min-h-[150px]">
          <span className="text-[#8a91a4] text-xs font-semibold uppercase tracking-wider">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder="Add notes about this lead..."
            className="flex-1 bg-[#0B0E14] border border-[#2a2e39] rounded-lg p-3 text-white text-sm resize-none focus:outline-none focus:border-[#00e5ff] transition-colors"
          />
        </div>
      </div>
    </div>
  );
};

export default LeadPanel;
