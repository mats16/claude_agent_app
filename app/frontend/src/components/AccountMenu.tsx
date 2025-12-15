import { useState, useRef, useEffect } from 'react';
import PATModal from './PATModal';

interface AccountMenuProps {
  userEmail?: string;
}

export default function AccountMenu({ userEmail }: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPATModalOpen, setIsPATModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = () => {
    // Clear PAT from localStorage
    localStorage.removeItem('databricks_pat');
    // Redirect to home or login page
    window.location.href = '/';
  };

  const displayName = userEmail || 'User';
  const initials = displayName
    .split('@')[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="account-menu-container" ref={menuRef}>
      <button
        className="account-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="Account settings"
      >
        <span className="account-avatar">{initials}</span>
      </button>

      {isOpen && (
        <div className="account-menu-dropdown">
          <div className="account-menu-header">
            <span className="account-email">{displayName}</span>
          </div>
          <div className="account-menu-divider" />
          <button
            className="account-menu-item"
            onClick={() => {
              setIsPATModalOpen(true);
              setIsOpen(false);
            }}
          >
            <span className="account-menu-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </span>
            <span>Personal Access Token</span>
          </button>
          <div className="account-menu-divider" />
          <button className="account-menu-item account-menu-item-danger" onClick={handleLogout}>
            <span className="account-menu-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </span>
            <span>Logout</span>
          </button>
        </div>
      )}

      <PATModal
        isOpen={isPATModalOpen}
        onClose={() => setIsPATModalOpen(false)}
      />
    </div>
  );
}
