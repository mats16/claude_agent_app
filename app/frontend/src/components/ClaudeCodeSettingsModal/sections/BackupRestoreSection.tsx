/**
 * Backup and Restore section
 * Extracted from SettingsModal for use in unified Claude Code Settings
 */

import { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Button, Alert, Typography, Flex, Switch, Divider } from 'antd';
import {
  SyncOutlined,
  DownloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { colors, spacing } from '../../../styles/theme';

const { Text, Title, Link } = Typography;

interface BackupRestoreSectionProps {
  isVisible: boolean;
}

export default function BackupRestoreSection({
  isVisible,
}: BackupRestoreSectionProps) {
  const { t } = useTranslation();

  const [claudeConfigSync, setClaudeConfigSync] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [workspaceUrl, setWorkspaceUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Fetch settings and workspace URL when section becomes visible
  useEffect(() => {
    if (isVisible) {
      setMessage(null);

      // Fetch claude-backup settings
      fetch('/api/v1/settings/claude-backup')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setClaudeConfigSync(data.claudeConfigSync);
          }
        })
        .catch(() => {
          // Ignore errors
        })
        .finally(() => {
          setIsLoading(false);
        });

      // Fetch browse_url for .claude folder
      fetch('/api/v1/workspace/status?path=users/me/.claude')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.browse_url) {
            setWorkspaceUrl(data.browse_url);
          }
        })
        .catch(() => {
          // Ignore errors - link will just not be shown
        });
    }
  }, [isVisible]);

  const handleManualPull = async () => {
    setIsPulling(true);
    setMessage(null);
    try {
      const response = await fetch('/api/v1/settings/claude-backup/pull', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to pull claude config');
      }

      setMessage({ type: 'success', text: t('settingsModal.pullSuccess') });
    } catch {
      setMessage({ type: 'error', text: t('settingsModal.pullFailed') });
    } finally {
      setIsPulling(false);
    }
  };

  const handleManualPush = async () => {
    setIsPushing(true);
    setMessage(null);
    try {
      const response = await fetch('/api/v1/settings/claude-backup/push', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to push claude config');
      }

      setMessage({ type: 'success', text: t('settingsModal.pushSuccess') });
    } catch {
      setMessage({ type: 'error', text: t('settingsModal.pushFailed') });
    } finally {
      setIsPushing(false);
    }
  };

  const handleToggleChange = async (checked: boolean) => {
    setClaudeConfigSync(checked);
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/v1/settings/claude-backup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claudeConfigSync: checked }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      window.dispatchEvent(new Event('settings-changed'));
    } catch {
      // Revert on error
      setClaudeConfigSync(!checked);
      setMessage({ type: 'error', text: t('settingsModal.saveFailed') });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ padding: spacing.xxl, height: '100%', overflow: 'auto' }}>
      {/* Auto Backup Section */}
      <div style={{ marginBottom: spacing.lg }}>
        <Flex
          align="center"
          gap={spacing.sm}
          style={{ marginBottom: spacing.md }}
        >
          <SyncOutlined style={{ color: colors.brand }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('settingsModal.autoBackupTitle')}
          </Title>
        </Flex>

        <Flex justify="space-between" align="center">
          <div style={{ flex: 1, marginRight: spacing.lg }}>
            <Text type="secondary">
              <Trans
                i18nKey="settingsModal.autoBackupDescription"
                components={[
                  workspaceUrl ? (
                    <Link href={workspaceUrl} target="_blank" key="workspace" />
                  ) : (
                    <span key="workspace" />
                  ),
                ]}
              />
            </Text>
          </div>
          <Switch
            checked={claudeConfigSync}
            onChange={handleToggleChange}
            disabled={isLoading || isSaving || isPulling || isPushing}
            loading={isLoading || isSaving}
          />
        </Flex>
      </div>

      <Divider />

      {/* Manual Push Section */}
      <div style={{ marginBottom: spacing.lg }}>
        <Flex
          align="center"
          gap={spacing.sm}
          style={{ marginBottom: spacing.md }}
        >
          <UploadOutlined style={{ color: colors.brand }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('settingsModal.manualPushTitle')}
          </Title>
        </Flex>

        <Text
          type="secondary"
          style={{ display: 'block', marginBottom: spacing.md }}
        >
          <Trans
            i18nKey="settingsModal.manualPushDescription"
            components={[
              workspaceUrl ? (
                <Link href={workspaceUrl} target="_blank" key="workspace" />
              ) : (
                <span key="workspace" />
              ),
            ]}
          />
        </Text>

        <Button
          icon={<UploadOutlined />}
          onClick={handleManualPush}
          loading={isPushing}
          disabled={isSaving || isPulling}
        >
          {t('settingsModal.manualPushButton')}
        </Button>
      </div>

      <Divider />

      {/* Manual Pull Section */}
      <div style={{ marginBottom: spacing.lg }}>
        <Flex
          align="center"
          gap={spacing.sm}
          style={{ marginBottom: spacing.md }}
        >
          <DownloadOutlined style={{ color: colors.brand }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('settingsModal.manualPullTitle')}
          </Title>
        </Flex>

        <Text
          type="secondary"
          style={{ display: 'block', marginBottom: spacing.md }}
        >
          <Trans
            i18nKey="settingsModal.manualPullDescription"
            components={[
              workspaceUrl ? (
                <Link href={workspaceUrl} target="_blank" key="workspace" />
              ) : (
                <span key="workspace" />
              ),
            ]}
          />
        </Text>

        <Button
          icon={<DownloadOutlined />}
          onClick={handleManualPull}
          loading={isPulling}
          disabled={isSaving || isPushing}
        >
          {t('settingsModal.manualPullButton')}
        </Button>
      </div>

      {message && (
        <Alert
          type={message.type}
          message={message.text}
          showIcon
          style={{ marginTop: spacing.lg }}
        />
      )}
    </div>
  );
}
