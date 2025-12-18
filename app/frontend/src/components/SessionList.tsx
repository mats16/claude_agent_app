import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Typography, Spin, Empty, Flex, Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import { InboxOutlined, FilterOutlined } from '@ant-design/icons';
import { useSessions, Session } from '../contexts/SessionsContext';

const { Text } = Typography;

interface SessionListProps {
  onSessionSelect?: () => void;
}

export default function SessionList({ onSessionSelect }: SessionListProps) {
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

  // Extract sessionId from current URL path
  const currentSessionId = location.pathname.match(/\/sessions\/([^/]+)/)?.[1];

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('sessionList.justNow');
    if (diffMins < 60) return t('sessionList.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('sessionList.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('sessionList.daysAgo', { count: diffDays });

    return date.toLocaleDateString(i18n.language === 'ja' ? 'ja-JP' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleSessionClick = (session: Session) => {
    navigate(`/sessions/${session.id}`);
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
          padding: '12px 20px 8px',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#999',
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
              fontSize: 16,
              color: '#666',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          />
        </Dropdown>
      </Flex>

      {/* Session Items */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {isLoading && (
          <Flex justify="center" align="center" style={{ padding: 16 }}>
            <Spin size="small" />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              {t('sessionList.loadingSessions')}
            </Text>
          </Flex>
        )}

        {error && (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <Text type="danger">
              {t('common.error')}: {error}
            </Text>
          </div>
        )}

        {!isLoading && !error && sessions.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('sessionList.noSessions')}
            style={{ padding: 24 }}
          />
        )}

        {!isLoading &&
          !error &&
          sessions.length > 0 &&
          sessions.map((session) => {
            const isActive = currentSessionId === session.id;
            const isHovering = hoveredSessionId === session.id;

            return (
              <div
                key={session.id}
                onClick={() => handleSessionClick(session)}
                onMouseEnter={() => setHoveredSessionId(session.id)}
                onMouseLeave={() => setHoveredSessionId(null)}
                style={{
                  padding: '8px 16px',
                  margin: '4px 12px',
                  cursor: 'pointer',
                  background: isActive ? '#E8EEF2' : 'transparent',
                  borderLeft: isActive
                    ? '3px solid #f5a623'
                    : '3px solid transparent',
                  borderRadius: 8,
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
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginBottom: 4,
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
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
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
                        fontSize: 16,
                        color: '#999',
                        cursor: 'pointer',
                        marginLeft: 8,
                        flexShrink: 0,
                        alignSelf: 'center',
                      }}
                      onClick={(e) => handleArchiveClick(session, e)}
                      title={t('sessionList.archive')}
                    />
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
