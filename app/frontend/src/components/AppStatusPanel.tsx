import { CSSProperties, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dropdown, Flex, Spin, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  RocketOutlined,
  CaretUpOutlined,
  CaretDownOutlined,
  BugOutlined,
  CloudUploadOutlined,
  DesktopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
  layout,
} from '../styles/theme';
import { AppLiveStatus } from '../hooks/useAppLiveStatus';
import { useAppDeployments, Deployment } from '../hooks/useAppDeployments';

const { Text } = Typography;

interface AppStatusPanelProps {
  sessionId: string;
  appName: string;
  appUrl: string | null;
  consoleUrl: string | null;
  status: AppLiveStatus | null;
  isDeploying: boolean;
  isUnavailable: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onDeploy: () => void;
}

// Status color mapping
function getStatusColor(state: string | undefined): string {
  if (!state) return colors.textMuted;
  switch (state.toUpperCase()) {
    case 'RUNNING':
    case 'SUCCEEDED':
    case 'READY':
      return colors.success;
    case 'PENDING':
    case 'IN_PROGRESS':
    case 'STARTING':
    case 'DEPLOYING':
      return colors.brand;
    case 'FAILED':
    case 'ERROR':
    case 'CRASHED':
    case 'UNAVAILABLE':
      return colors.error;
    default:
      return colors.textSecondary;
  }
}

// Status background color for tags
function getStatusBgColor(state: string | undefined): string {
  if (!state) return colors.backgroundSecondary;
  switch (state.toUpperCase()) {
    case 'RUNNING':
    case 'SUCCEEDED':
    case 'READY':
      return '#f6ffed';
    case 'PENDING':
    case 'IN_PROGRESS':
    case 'STARTING':
    case 'DEPLOYING':
      return colors.brandBg;
    case 'FAILED':
    case 'ERROR':
    case 'CRASHED':
    case 'UNAVAILABLE':
      return colors.errorBg;
    default:
      return colors.backgroundSecondary;
  }
}

// Format timestamp with timezone
function formatTime(timestamp: string, locale: string): string {
  const date = new Date(timestamp);
  const isJapanese = locale === 'ja';
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: isJapanese ? 'numeric' : 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: isJapanese ? 'short' : 'shortOffset',
  };
  return date.toLocaleString(isJapanese ? 'ja-JP' : 'en-US', options);
}

// Get status icon based on state
function getStatusIcon(state: string | undefined) {
  if (!state) return null;
  switch (state.toUpperCase()) {
    case 'SUCCEEDED':
      return <CheckCircleOutlined style={{ color: colors.success }} />;
    case 'FAILED':
    case 'ERROR':
      return <CloseCircleOutlined style={{ color: colors.error }} />;
    case 'PENDING':
    case 'IN_PROGRESS':
      return <SyncOutlined spin style={{ color: colors.brand }} />;
    default:
      return <CheckCircleOutlined style={{ color: colors.textMuted }} />;
  }
}

const panelStyle: CSSProperties = {
  background: colors.background,
  border: `1px solid ${colors.border}`,
  borderRadius: borderRadius.lg,
  boxShadow: shadows.lg,
  margin: `0 auto ${spacing.md}px`,
  maxWidth: layout.maxContentWidth,
  width: 'calc(100% - 48px)',
};

const panelHeaderStyle: CSSProperties = {
  padding: `${spacing.sm}px ${spacing.lg}px`,
  cursor: 'pointer',
};

const panelContentStyle: CSSProperties = {
  padding: `${spacing.md}px ${spacing.lg}px`,
  paddingTop: 0,
  maxHeight: 300,
  overflow: 'auto',
};

export function AppStatusPanel({
  sessionId,
  appName,
  appUrl,
  consoleUrl,
  status,
  isDeploying,
  isUnavailable,
  isExpanded,
  onToggle,
  onDeploy,
}: AppStatusPanelProps) {
  const { t, i18n } = useTranslation();

  // Fetch deployments only when expanded
  const { deployments, isLoading: isLoadingDeployments } = useAppDeployments(
    sessionId,
    isExpanded
  );

  const appState = status?.app_status?.state;
  const currentLocale = i18n.language;

  const menuItems: MenuProps['items'] = useMemo(
    () => [
      {
        key: 'open-app',
        icon: <RocketOutlined />,
        label: t('appStatusPanel.actions.openApp'),
        disabled: !appUrl,
        onClick: () => appUrl && window.open(appUrl, '_blank'),
      },
      {
        key: 'logs',
        icon: <BugOutlined />,
        label: t('appStatusPanel.actions.openLogs'),
        disabled: !appUrl,
        onClick: () => appUrl && window.open(`${appUrl}/logz`, '_blank'),
      },
      {
        key: 'deploy',
        icon: <CloudUploadOutlined />,
        label: t('appStatusPanel.actions.deploy'),
        disabled: appState !== 'RUNNING',
        onClick: onDeploy,
      },
      {
        key: 'console',
        icon: <DesktopOutlined />,
        label: t('appStatusPanel.actions.openConsole'),
        onClick: () => consoleUrl && window.open(consoleUrl, '_blank'),
      },
    ],
    [t, appUrl, appState, consoleUrl, onDeploy]
  );

  const renderDeploymentItem = (deployment: Deployment) => {
    const state = deployment.status.state;
    return (
      <Flex
        key={deployment.deployment_id}
        align="center"
        gap={spacing.sm}
        style={{ padding: `${spacing.xs}px 0` }}
      >
        <Text
          style={{
            color: colors.textMuted,
            fontSize: typography.fontSizeSmall,
            flexShrink: 0,
          }}
        >
          {formatTime(
            deployment.update_time || deployment.create_time,
            currentLocale
          )}
        </Text>
        {getStatusIcon(state)}
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typography.fontSizeSmall,
          }}
          ellipsis
        >
          ID: {deployment.deployment_id}
        </Text>
      </Flex>
    );
  };

  return (
    <div style={panelStyle}>
      {/* Header - always visible */}
      <Flex
        justify="space-between"
        align="center"
        style={panelHeaderStyle}
        onClick={onToggle}
      >
        <Flex align="center" gap={spacing.md}>
          <RocketOutlined
            spin={isDeploying}
            style={{
              fontSize: typography.fontSizeLarge,
              color: isUnavailable
                ? colors.error
                : isDeploying
                  ? colors.brand
                  : colors.success,
            }}
          />
          <Text style={{ fontWeight: typography.fontWeightMedium }}>
            {appName}
          </Text>
          {appState && (
            <Tag
              color={getStatusColor(appState)}
              style={{
                background: getStatusBgColor(appState),
                border: 'none',
              }}
            >
              {appState}
            </Tag>
          )}
        </Flex>
        <Flex align="center" gap={spacing.sm}>
          {isExpanded && (
            <Dropdown
              menu={{ items: menuItems }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Button
                type="text"
                size="small"
                icon={<DesktopOutlined />}
                onClick={(e) => e.stopPropagation()}
                style={{ color: colors.textSecondary }}
              />
            </Dropdown>
          )}
          <Button
            type="text"
            size="small"
            icon={isExpanded ? <CaretUpOutlined /> : <CaretDownOutlined />}
            style={{ color: colors.textSecondary }}
          />
        </Flex>
      </Flex>

      {/* Expanded content */}
      {isExpanded && (
        <div style={panelContentStyle}>
          <Text
            style={{
              fontWeight: typography.fontWeightMedium,
              color: colors.textSecondary,
              display: 'block',
              marginBottom: spacing.md,
            }}
          >
            {t('appStatusPanel.deploymentHistory')}
          </Text>

          {isLoadingDeployments && deployments.length === 0 ? (
            <Flex justify="center" style={{ padding: spacing.lg }}>
              <Spin size="small" />
            </Flex>
          ) : deployments.length === 0 ? (
            <Text
              style={{
                color: colors.textMuted,
                display: 'block',
                textAlign: 'center',
                padding: spacing.lg,
              }}
            >
              {t('appStatusPanel.noDeployments')}
            </Text>
          ) : (
            deployments.map(renderDeploymentItem)
          )}
        </div>
      )}
    </div>
  );
}
