import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropdown, Avatar, MenuProps } from 'antd';
import {
  UserOutlined,
  SettingOutlined,
  GlobalOutlined,
  CheckOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import AppSettingsModal from './AppSettingsModal';
import ClaudeCodeSettingsModal from './ClaudeCodeSettingsModal';
import { useUser } from '../contexts/UserContext';
import { colors } from '../styles/theme';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
];

export default function AccountMenu() {
  const { t, i18n } = useTranslation();
  const { userInfo } = useUser();
  const [isAppSettingsModalOpen, setIsAppSettingsModalOpen] = useState(false);
  const [isClaudeCodeSettingsOpen, setIsClaudeCodeSettingsOpen] =
    useState(false);

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };

  const handleOpenAppSettings = () => {
    setIsAppSettingsModalOpen(true);
  };

  const handleCloseAppSettings = () => {
    setIsAppSettingsModalOpen(false);
  };

  const handleOpenClaudeCodeSettings = () => {
    setIsClaudeCodeSettingsOpen(true);
  };

  const handleCloseClaudeCodeSettings = () => {
    setIsClaudeCodeSettingsOpen(false);
  };

  const displayEmail = userInfo?.email || 'User';
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
          <CheckOutlined style={{ color: colors.brand }} />
        )}
      </span>
    ),
    onClick: () => handleLanguageChange(lang.code),
  }));

  const items: MenuProps['items'] = [
    {
      key: 'header',
      label: (
        <div style={{ padding: '4px 0', fontWeight: 500 }}>{displayEmail}</div>
      ),
      disabled: true,
      style: { cursor: 'default' },
    },
    { type: 'divider' },
    {
      key: 'app-settings',
      icon: <SettingOutlined />,
      label: t('accountMenu.appSettings'),
      onClick: handleOpenAppSettings,
    },
    {
      key: 'claude-code-settings',
      icon: <RobotOutlined />,
      label: t('accountMenu.claudeCodeSettings'),
      onClick: handleOpenClaudeCodeSettings,
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
          <span
            style={{ color: colors.textMuted, fontSize: 12, marginLeft: 8 }}
          >
            {currentLang.label}
          </span>
        </span>
      ),
      children: languageItems,
    },
  ];

  return (
    <>
      <Dropdown menu={{ items }} trigger={['click']} placement="topLeft">
        <Avatar
          icon={<UserOutlined />}
          style={{
            backgroundColor: colors.brand,
            cursor: 'pointer',
          }}
        />
      </Dropdown>

      <AppSettingsModal
        isOpen={isAppSettingsModalOpen}
        onClose={handleCloseAppSettings}
      />

      <ClaudeCodeSettingsModal
        isOpen={isClaudeCodeSettingsOpen}
        onClose={handleCloseClaudeCodeSettings}
      />
    </>
  );
}
