import React from 'react';

/** The Zip2Repo mark: a ZIP entry that branches into a repository. */
export const LogoMark: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Zip2Repo logo">
    <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="#151518" stroke="#55A67F" strokeWidth="1.5" />
    <path d="M16 6.5v5.5" stroke="#A6D5BE" strokeWidth="2" strokeLinecap="round" strokeDasharray="1.6 2.2" />
    <path d="M12.5 13.5L16 17l3.5-3.5" fill="none" stroke="#A6D5BE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 17v3.2c0 1.4-.9 2.3-2.3 2.8L11.5 24" fill="none" stroke="#55A67F" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M16 20.2c0 1.4.9 2.3 2.3 2.8L20.5 24" fill="none" stroke="#55A67F" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="11.5" cy="25" r="1.9" fill="#55A67F" />
    <circle cx="20.5" cy="25" r="1.9" fill="#55A67F" />
    <circle cx="16" cy="17" r="1.9" fill="#A6D5BE" />
  </svg>
);
