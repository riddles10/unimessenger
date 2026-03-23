export default function AgentModeToggle({ mode, assignedAgentId, onToggle }) {
  const isAgent = mode === 'agent';

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-medium ${!isAgent ? 'text-amber-600' : 'text-gray-400'}`}>
        AI
      </span>
      <button
        onClick={() => onToggle(isAgent ? 'ai' : 'agent')}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          isAgent ? 'bg-red-500' : 'bg-amber-500'
        }`}
        title={isAgent ? 'Switch to AI mode' : 'Switch to Agent mode'}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            isAgent ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <span className={`text-xs font-medium ${isAgent ? 'text-red-600' : 'text-gray-400'}`}>
        Agent
      </span>
    </div>
  );
}
