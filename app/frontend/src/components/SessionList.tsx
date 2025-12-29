import { useState, useCallback, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Typography, Spin, Empty, Flex, Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import { InboxOutlined, FilterOutlined } from '@ant-design/icons';
import { useSessions, Session } from '../contexts/SessionsContext';
import { formatRelativeDate } from '../utils/dateFormat';
import { colors, spacing, borderRadius, typography } from '../styles/theme';
import { ellipsisStyle } from '../styles/common';

const { Text } = Typography;

interface SessionListProps {
  onSessionSelect?: () => void;
}

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  isHovering: boolean;
  onSessionClick: (session: Session) => void;
  onArchiveClick: (session: Session, e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  formatDate: (date: string) => string;
}

const SessionItem = memo(function SessionItem({
  session,
  isActive,
  isHovering,
  onSessionClick,
  onArchiveClick,
  onMouseEnter,
  onMouseLeave,
  formatDate,
}: SessionItemProps) {
  const { t } = useTranslation();

  return (
    <div
      onClick={() => onSessionClick(session)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        padding: `${spacing.sm}px ${spacing.lg}px`,
        margin: `${spacing.xs}px ${spacing.md}px`,
        cursor: 'pointer',
        background:
          isActive || isHovering ? colors.sessionActiveBg : 'transparent',
        borderRadius: borderRadius.md,
        transition: 'background 0.15s',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text
            strong={!session.isArchived}
            type={session.isArchived ? 'secondary' : undefined}
            style={{
              display: 'block',
              ...ellipsisStyle,
              marginBottom: spacing.xs,
            }}
          >
            {session.title || t('sessionList.untitledSession')}
          </Text>
          <div>
            {session.workspacePath && (
              <Text
                type="secondary"
                style={{
                  fontSize: 11,
                  display: 'block',
                  ...ellipsisStyle,
                }}
              >
                {session.workspacePath}
              </Text>
            )}
            <Text type="secondary" style={{ fontSize: 11 }}>
              {formatDate(session.createdAt)}
            </Text>
          </div>
        </div>

        {/* Archive Button - shown on hover, only for non-archived sessions */}
        {!session.isArchived && isHovering && (
          <InboxOutlined
            style={{
              fontSize: typography.fontSizeLarge,
              color: colors.textMuted,
              cursor: 'pointer',
              marginLeft: spacing.sm,
              flexShrink: 0,
              alignSelf: 'center',
            }}
            onClick={(e) => onArchiveClick(session, e)}
            title={t('sessionList.archive')}
          />
        )}
      </div>
    </div>
  );
});

export default memo(function SessionList({
  onSessionSelect,
}: SessionListProps) {
  const { t, i18n } = useTranslation();
  const {
    sessions,
    isLoading,
    error,
    filter,
    setFilter,
    archiveSession: archiveSessionAPI,
  } = useSessions();
  const navigate = useNavigate();
  const location = useLocation();
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);

  // Extract sessionId from current URL path (format: /session_xxx)
  const currentSessionId = location.pathname.match(/^\/(session_[^/]+)/)?.[1];

  const formatDate = useCallback(
    (dateString: string): string => {
      return formatRelativeDate(dateString, i18n.language, {
        justNow: t('sessionList.justNow'),
        minutesAgo: (count) => t('sessionList.minutesAgo', { count }),
        hoursAgo: (count) => t('sessionList.hoursAgo', { count }),
        daysAgo: (count) => t('sessionList.daysAgo', { count }),
      });
    },
    [t, i18n.language]
  );

  const handleSessionClick = (session: Session) => {
    navigate(`/${session.id}`);
    onSessionSelect?.();
  };

  const handleArchiveClick = async (session: Session, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation

    try {
      await archiveSessionAPI(session.id);
      message.success(t('sessionList.archiveSuccess', 'Session archived'));

      // If the archived session is currently displayed, navigate to home
      if (currentSessionId === session.id) {
        navigate('/');
      }
    } catch (err) {
      message.error(t('sessionList.archiveError', 'Failed to archive session'));
    }
  };

  const filterMenuItems: MenuProps['items'] = [
    {
      key: 'active',
      label: t('sessionList.filter.active'),
    },
    {
      key: 'archived',
      label: t('sessionList.filter.archived'),
    },
    {
      key: 'all',
      label: t('sessionList.filter.all'),
    },
  ];

  const handleFilterMenuClick: MenuProps['onClick'] = ({ key }) => {
    setFilter(key as 'active' | 'archived' | 'all');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header with Filter */}
      <Flex
        justify="space-between"
        align="center"
        style={{
          padding: `${spacing.md}px ${spacing.xl}px ${spacing.sm}px`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {t('sidebar.sessions')}
        </div>
        <Dropdown
          menu={{
            items: filterMenuItems,
            onClick: handleFilterMenuClick,
            selectedKeys: [filter],
          }}
          trigger={['click']}
          placement="bottomRight"
        >
          <FilterOutlined
            style={{
              fontSize: typography.fontSizeLarge,
              color: colors.textSecondary,
              cursor: 'pointer',
              padding: `${spacing.xs}px ${spacing.sm}px`,
            }}
          />
        </Dropdown>
      </Flex>

      {/* Session Items */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {isLoading && (
          <Flex justify="center" align="center" style={{ padding: spacing.lg }}>
            <Spin size="small" />
            <Text type="secondary" style={{ marginLeft: spacing.sm }}>
              {t('sessionList.loadingSessions')}
            </Text>
          </Flex>
        )}

        {error && (
          <div style={{ padding: spacing.lg, textAlign: 'center' }}>
            <Text type="danger">
              {t('common.error')}: {error}
            </Text>
          </div>
        )}

        {!isLoading && !error && sessions.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('sessionList.noSessions')}
            style={{ padding: spacing.xxl }}
          />
        )}

        {!isLoading &&
          !error &&
          sessions.length > 0 &&
          sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={currentSessionId === session.id}
              isHovering={hoveredSessionId === session.id}
              onSessionClick={handleSessionClick}
              onArchiveClick={handleArchiveClick}
              onMouseEnter={() => setHoveredSessionId(session.id)}
              onMouseLeave={() => setHoveredSessionId(null)}
              formatDate={formatDate}
            />
          ))}
      </div>
    </div>
  );
});
