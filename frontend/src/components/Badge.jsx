import React from 'react';

const Badge = ({ children, colorStyles, className = '' }) => {
  return (
    <span 
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${className}`}
      style={{
        backgroundColor: colorStyles?.bg || 'transparent',
        color: colorStyles?.text || 'inherit',
        borderColor: colorStyles?.border || 'transparent',
      }}
    >
      {children}
    </span>
  );
};

export default Badge;
