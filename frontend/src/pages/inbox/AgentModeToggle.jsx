import React from 'react';

const AgentModeToggle = ({ mode, onToggle }) => {
  const isAgent = mode === 'agent';

  return (
    <div className="flex items-center gap-3">
      <span className={`text-sm ${!isAgent ? 'text-[#f59e0b] font-bold' : 'text-[#8a91a4]'}`}>AI</span>
      
      <button
        onClick={() => onToggle(isAgent ? 'ai' : 'agent')}
        className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0B0E14] focus:ring-[#00e5ff] ${
          isAgent ? 'bg-[#ff3366]' : 'bg-[#f59e0b]'
        }`}
      >
        <span
          className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ${
            isAgent ? 'transform translate-x-6' : ''
          }`}
        />
      </button>

      <span className={`text-sm ${isAgent ? 'text-[#ff3366] font-bold' : 'text-[#8a91a4]'}`}>Agent</span>
    </div>
  );
};

export default AgentModeToggle;
