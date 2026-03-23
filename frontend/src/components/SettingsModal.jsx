import React, { useState } from 'react';
import { X, WhatsappLogo, TelegramLogo } from '@phosphor-icons/react';

const SettingsModal = ({ isOpen, onClose }) => {
  const [waAutoEnabled, setWaAutoEnabled] = useState(true);
  const [waMessage, setWaMessage] = useState('Hello! Welcome to Pipsight. How can we help you boost your trading today?');
  
  const [tgAutoEnabled, setTgAutoEnabled] = useState(false);
  const [tgMessage, setTgMessage] = useState('Welcome! Please let us know if you need assistance with your account.');

  if (!isOpen) return null;

  const handleSave = () => {
    // Mock save
    console.log('Saved Automations:', {
      whatsapp: { enabled: waAutoEnabled, message: waMessage },
      telegram: { enabled: tgAutoEnabled, message: tgMessage },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#131722] border border-[#2a2e39] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-[#2a2e39]">
          <h2 className="text-xl font-semibold text-white">Settings</h2>
          <button 
            onClick={onClose}
            className="text-[#8a91a4] hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-8">
          <div>
            <h3 className="text-[#d1d4dc] font-medium text-lg mb-1">Channel Automations</h3>
            <p className="text-[#8a91a4] text-sm mb-6">
              Configure automated welcome messages sent to users immediately after registration.
            </p>
            
            {/* WhatsApp Config */}
            <div className="bg-[#0B0E14] border border-[#2a2e39] rounded-lg p-5 mb-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[rgba(0,255,136,0.1)] flex items-center justify-center">
                    <WhatsappLogo size={20} className="text-[#00ff88]" />
                  </div>
                  <span className="text-white font-medium">WhatsApp Welcome</span>
                </div>
                
                {/* Toggle */}
                <button
                  onClick={() => setWaAutoEnabled(!waAutoEnabled)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-[#00e5ff] ${
                    waAutoEnabled ? 'bg-[#00e5ff]' : 'bg-[#2a2e39]'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ${
                      waAutoEnabled ? 'transform translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>

              <div className={`transition-opacity ${!waAutoEnabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <label className="block text-[#8a91a4] text-xs font-semibold uppercase tracking-wider mb-2">Message Template</label>
                <textarea
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                  className="w-full bg-[#131722] border border-[#2a2e39] rounded-lg p-3 text-white text-sm min-h-[100px] resize-y focus:outline-none focus:border-[#00e5ff] transition-colors"
                  placeholder="Type the automated welcome message..."
                />
              </div>
            </div>

            {/* Telegram Config */}
            <div className="bg-[#0B0E14] border border-[#2a2e39] rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[rgba(0,229,255,0.1)] flex items-center justify-center">
                    <TelegramLogo size={20} className="text-[#00e5ff]" />
                  </div>
                  <span className="text-white font-medium">Telegram Welcome</span>
                </div>
                
                {/* Toggle */}
                <button
                  onClick={() => setTgAutoEnabled(!tgAutoEnabled)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-[#00e5ff] ${
                    tgAutoEnabled ? 'bg-[#00e5ff]' : 'bg-[#2a2e39]'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ${
                      tgAutoEnabled ? 'transform translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>

              <div className={`transition-opacity ${!tgAutoEnabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <label className="block text-[#8a91a4] text-xs font-semibold uppercase tracking-wider mb-2">Message Template</label>
                <textarea
                  value={tgMessage}
                  onChange={(e) => setTgMessage(e.target.value)}
                  className="w-full bg-[#131722] border border-[#2a2e39] rounded-lg p-3 text-white text-sm min-h-[100px] resize-y focus:outline-none focus:border-[#00e5ff] transition-colors"
                  placeholder="Type the automated welcome message..."
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-[#2a2e39] flex justify-end gap-3 bg-[#131722]">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-[#d1d4dc] hover:text-white hover:bg-[#1e2433] transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-5 py-2.5 rounded-lg text-black bg-[#00e5ff] hover:bg-[#00bfff] shadow-[0_0_12px_rgba(0,229,255,0.4)] transition-all text-sm font-medium"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
