import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropdown, Avatar, MenuProps } from 'antd';
import {
  UserOutlined,
  SettingOutlined,
  GlobalOutlined,
  LogoutOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import SettingsModal, { UserSettings } from './SettingsModal';

interface AccountMenuProps {
  userEmail?: string;
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
];

export default function AccountMenu({ userEmail }: AccountMenuProps) {
  const { t, i18n } = useTranslation();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isInitialSetup, setIsInitialSetup] = useState(false);
  const [hasCheckedSettings, setHasCheckedSettings] = useState(false);

  // Check settings on mount
  useEffect(() => {
    const checkSettings = async () => {
      try {
        const response = await fetch('/api/v1/users/me');
        if (response.ok) {
          const data: UserSettings = await response.json();
          // Show initial setup modal if no token configured
          if (!data.hasAccessToken) {
            setIsInitialSetup(true);
            setIsSettingsModalOpen(true);
          }
        }
      } catch (error) {
        console.error('Failed to check settings:', error);
      } finally {
        setHasCheckedSettings(true);
      }
    };

    if (!hasCheckedSettings) {
      checkSettings();
    }
  }, [hasCheckedSettings]);

  const handleLogout = () => {
    window.location.href = '/';
  };

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };

  const handleOpenSettings = () => {
    setIsInitialSetup(false);
    setIsSettingsModalOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsModalOpen(false);
    setIsInitialSetup(false);
  };

  const displayName = userEmail || 'User';
  const currentLang =
    LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  const languageItems: MenuProps['items'] = LANGUAGES.map((lang) => ({
    key: lang.code,
    label: (
      <span
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          minWidth: 100,
        }}
      >
        {lang.label}
        {lang.code === i18n.language && (
          <CheckOutlined style={{ color: '#f5a623' }} />
        )}
      </span>
    ),
    onClick: () => handleLanguageChange(lang.code),
  }));

  const items: MenuProps['items'] = [
    {
      key: 'header',
      label: (
        <div style={{ padding: '4px 0', fontWeight: 500 }}>{displayName}</div>
      ),
      disabled: true,
      style: { cursor: 'default' },
    },
    { type: 'divider' },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: t('accountMenu.settings'),
      onClick: handleOpenSettings,
    },
    {
      key: 'language',
      icon: <GlobalOutlined />,
      label: (
        <span
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
          }}
        >
          {t('accountMenu.language')}
          <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>
            {currentLang.label}
          </span>
        </span>
      ),
      children: languageItems,
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('accountMenu.logout'),
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <>
      <Dropdown menu={{ items }} trigger={['click']} placement="topLeft">
        <Avatar
          icon={<UserOutlined />}
          style={{
            backgroundColor: '#f5a623',
            cursor: 'pointer',
          }}
        />
      </Dropdown>

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={handleCloseSettings}
        isInitialSetup={isInitialSetup}
      />
    </>
  );
}
