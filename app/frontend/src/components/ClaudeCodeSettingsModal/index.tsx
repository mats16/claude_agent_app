/**
 * Unified Claude Code Settings Modal
 * Combines Skills, Subagents, MCP, and Backup/Restore settings into one modal
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Flex, Tabs } from 'antd';
import {
  RobotOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  ApiOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import SkillsSection from './sections/SkillsSection';
import SubagentsSection from './sections/SubagentsSection';
import McpSection from './sections/McpSection';
import BackupRestoreSection from './sections/BackupRestoreSection';
import { colors, spacing } from '../../styles/theme';

type SettingsSection = 'skills' | 'subagents' | 'mcp' | 'backup';

interface ClaudeCodeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ClaudeCodeSettingsModal({
  isOpen,
  onClose,
}: ClaudeCodeSettingsModalProps) {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<SettingsSection>('skills');

  const tabItems = [
    {
      key: 'skills',
      label: (
        <Flex align="center" gap={spacing.xs}>
          <ThunderboltOutlined />
          {t('claudeCodeSettings.skills')}
        </Flex>
      ),
      children: (
        <SkillsSection isVisible={isOpen && activeSection === 'skills'} />
      ),
    },
    {
      key: 'subagents',
      label: (
        <Flex align="center" gap={spacing.xs}>
          <TeamOutlined />
          {t('claudeCodeSettings.subagents')}
        </Flex>
      ),
      children: (
        <SubagentsSection isVisible={isOpen && activeSection === 'subagents'} />
      ),
    },
    {
      key: 'mcp',
      label: (
        <Flex align="center" gap={spacing.xs}>
          <ApiOutlined />
          {t('claudeCodeSettings.mcp')}
        </Flex>
      ),
      children: <McpSection />,
    },
    {
      key: 'backup',
      label: (
        <Flex align="center" gap={spacing.xs}>
          <SaveOutlined />
          {t('claudeCodeSettings.backupRestore')}
        </Flex>
      ),
      children: (
        <BackupRestoreSection
          isVisible={isOpen && activeSection === 'backup'}
        />
      ),
    },
  ];

  return (
    <Modal
      title={
        <Flex align="center" gap={spacing.sm}>
          <RobotOutlined style={{ color: colors.brand }} />
          {t('claudeCodeSettings.title')}
        </Flex>
      }
      open={isOpen}
      onCancel={onClose}
      width={1200}
      footer={null}
      rootClassName="claude-code-settings-modal"
      styles={{
        header: {
          backgroundColor: colors.background,
          borderBottom: 'none',
          marginBottom: 0,
          paddingBottom: 0,
        },
        body: {
          padding: 0,
          height: 700,
          backgroundColor: colors.background,
        },
      }}
    >
      <Tabs
        activeKey={activeSection}
        onChange={(key) => setActiveSection(key as SettingsSection)}
        items={tabItems}
        style={{
          height: '100%',
        }}
        tabBarStyle={{
          marginBottom: 0,
          paddingLeft: spacing.lg,
          paddingRight: spacing.lg,
          borderBottom: `1px solid ${colors.border}`,
        }}
      />
    </Modal>
  );
}
