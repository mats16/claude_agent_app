import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UserOutlined } from '@ant-design/icons';
import PATModal from './PATModal';

interface AccountMenuProps {
  userEmail?: string;
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
];

export default function AccountMenu({ userEmail }: AccountMenuProps) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isPATModalOpen, setIsPATModalOpen] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsLangMenuOpen(false);
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

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setIsLangMenuOpen(false);
  };

  const displayName = userEmail || 'User';
  const initials = displayName.split('@')[0].slice(0, 2).toUpperCase();
  const currentLang =
    LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  return (
    <div className="account-menu-container" ref={menuRef}>
      <button
        className="account-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title={t('accountMenu.accountSettings')}
      >
        <span className="account-avatar">
          <UserOutlined />
        </span>
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
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <span>{t('accountMenu.pat')}</span>
          </button>
          <div className="account-menu-item-with-submenu">
            <button
              className="account-menu-item"
              onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
            >
              <span className="account-menu-icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </span>
              <span>{t('accountMenu.language')}</span>
              <span className="account-menu-lang-current">
                {currentLang.label}
              </span>
            </button>
            {isLangMenuOpen && (
              <div className="account-menu-submenu">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    className={`account-menu-item ${lang.code === i18n.language ? 'active' : ''}`}
                    onClick={() => handleLanguageChange(lang.code)}
                  >
                    <span>{lang.label}</span>
                    {lang.code === i18n.language && (
                      <span className="account-menu-check">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="account-menu-divider" />
          <button
            className="account-menu-item account-menu-item-danger"
            onClick={handleLogout}
          >
            <span className="account-menu-icon">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            <span>{t('accountMenu.logout')}</span>
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
