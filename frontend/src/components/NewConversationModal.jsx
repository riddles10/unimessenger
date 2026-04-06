import React, { useState, useEffect, useRef } from 'react';
import { X, WhatsappLogo, TelegramLogo, MagnifyingGlass, PaperPlaneRight } from '@phosphor-icons/react';
import { searchLeads, startOutbound } from '../utils/api';

// Modal for support agents to start (or continue) an outbound conversation
// with a Pipsight user. Search picks an existing lead; falling through to
// "manual entry" lets the agent type a name + phone for someone with no
// lead row yet (e.g. a registered user who never inbounded).
const NewConversationModal = ({ isOpen, onClose, onSent, initialValues }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);

  // Manual-entry fields (used when no existing lead is selected)
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');

  const [channel, setChannel] = useState('whatsapp');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const debounceRef = useRef(null);

  // Reset everything when the modal opens / closes; pre-fill from initialValues
  // when the modal is opened from a deep-link (Slack → Unimessenger).
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setResults([]);
    setSelectedLead(null);
    setManualName(initialValues?.name || '');
    setManualPhone(initialValues?.phone || '');
    setChannel(initialValues?.channel || 'whatsapp');
    setText('');
    setError(null);
    setSending(false);
  }, [isOpen, initialValues]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    if (selectedLead) return; // don't keep searching once a lead is locked in

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const data = await searchLeads(query.trim());
        setResults(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Lead search failed', err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen, selectedLead]);

  if (!isOpen) return null;

  const canSend = () => {
    if (!text.trim()) return false;
    if (selectedLead) return true;
    return Boolean(manualName.trim() && manualPhone.trim());
  };

  const handlePickLead = (lead) => {
    setSelectedLead(lead);
    setChannel(lead.channel || 'whatsapp');
  };

  const handleClearSelection = () => {
    setSelectedLead(null);
    setQuery('');
    setResults([]);
  };

  const handleSend = async () => {
    if (!canSend() || sending) return;
    setSending(true);
    setError(null);

    try {
      const payload = selectedLead
        ? { leadId: selectedLead.id, channel, text: text.trim() }
        : {
            name: manualName.trim(),
            phone: manualPhone.trim(),
            channel,
            text: text.trim(),
          };

      const result = await startOutbound(payload);
      onSent?.(result.leadId);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#131722] border border-[#2a2e39] rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-[#2a2e39]">
          <h2 className="text-xl font-semibold text-white">New conversation</h2>
          <button
            onClick={onClose}
            className="text-[#8a91a4] hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-5">
          {/* Recipient picker */}
          {selectedLead ? (
            <div className="bg-[#0B0E14] border border-[#2a2e39] rounded-lg p-4 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white font-semibold">{selectedLead.name}</span>
                  {selectedLead.channel === 'telegram'
                    ? <TelegramLogo size={14} className="text-[#00e5ff]" />
                    : <WhatsappLogo size={14} className="text-[#00ff88]" />}
                </div>
                <p className="text-[#8a91a4] text-xs">
                  {selectedLead.phone || selectedLead.email || 'No contact details'}
                </p>
              </div>
              <button
                onClick={handleClearSelection}
                className="text-[#8a91a4] text-xs hover:text-white transition-colors underline"
              >
                Change
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-[#8a91a4] text-xs font-semibold uppercase tracking-wider mb-2">
                Find a registered user
              </label>
              <div className="relative">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a91a4]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, phone or email…"
                  className="w-full bg-[#0B0E14] border border-[#2a2e39] rounded-lg pl-9 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00e5ff] transition-colors"
                />
              </div>

              {/* Search results */}
              {query.trim() && (
                <div className="mt-2 border border-[#2a2e39] rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {searching && (
                    <div className="p-3 text-[#8a91a4] text-sm text-center">Searching…</div>
                  )}
                  {!searching && results.length === 0 && (
                    <div className="p-3 text-[#8a91a4] text-sm text-center">
                      No matches. Enter the contact details below to start a new conversation.
                    </div>
                  )}
                  {!searching && results.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => handlePickLead(lead)}
                      className="w-full text-left p-3 border-b border-[#2a2e39] last:border-b-0 hover:bg-[#1e2433] transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-white text-sm font-medium truncate">{lead.name}</div>
                        <div className="text-[#8a91a4] text-xs truncate">
                          {lead.phone || lead.email || '—'}
                        </div>
                      </div>
                      {lead.channel === 'telegram'
                        ? <TelegramLogo size={14} className="text-[#00e5ff] shrink-0" />
                        : <WhatsappLogo size={14} className="text-[#00ff88] shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Manual entry fallback */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#8a91a4] text-xs font-semibold uppercase tracking-wider mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full bg-[#0B0E14] border border-[#2a2e39] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00e5ff] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[#8a91a4] text-xs font-semibold uppercase tracking-wider mb-2">
                    Phone (E.164)
                  </label>
                  <input
                    type="tel"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    placeholder="+66812345678"
                    className="w-full bg-[#0B0E14] border border-[#2a2e39] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00e5ff] transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Channel selector */}
          <div>
            <label className="block text-[#8a91a4] text-xs font-semibold uppercase tracking-wider mb-2">
              Send via
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setChannel('whatsapp')}
                className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  channel === 'whatsapp'
                    ? 'bg-[rgba(0,255,136,0.1)] border-[#00ff88] text-[#00ff88]'
                    : 'bg-[#0B0E14] border-[#2a2e39] text-[#8a91a4] hover:bg-[#1e2433]'
                }`}
              >
                <WhatsappLogo size={16} /> WhatsApp
              </button>
              <button
                onClick={() => setChannel('telegram')}
                className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  channel === 'telegram'
                    ? 'bg-[rgba(0,229,255,0.1)] border-[#00e5ff] text-[#00e5ff]'
                    : 'bg-[#0B0E14] border-[#2a2e39] text-[#8a91a4] hover:bg-[#1e2433]'
                }`}
              >
                <TelegramLogo size={16} /> Telegram
              </button>
            </div>
          </div>

          {/* Message body */}
          <div>
            <label className="block text-[#8a91a4] text-xs font-semibold uppercase tracking-wider mb-2">
              Message
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your message…"
              className="w-full bg-[#0B0E14] border border-[#2a2e39] rounded-lg p-3 text-white text-sm min-h-[120px] resize-y focus:outline-none focus:border-[#00e5ff] transition-colors"
            />
          </div>

          {error && (
            <div className="bg-[rgba(255,51,102,0.08)] border border-[#ff3366] rounded-lg p-3 text-[#ff3366] text-xs">
              {error}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-[#2a2e39] flex justify-end gap-3 bg-[#131722]">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-[#d1d4dc] hover:text-white hover:bg-[#1e2433] transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend() || sending}
            className="px-5 py-2.5 rounded-lg text-black bg-[#00e5ff] hover:bg-[#00bfff] shadow-[0_0_12px_rgba(0,229,255,0.4)] transition-all text-sm font-medium disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
          >
            <PaperPlaneRight size={16} weight="fill" />
            {sending ? 'Sending…' : 'Send message'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewConversationModal;
