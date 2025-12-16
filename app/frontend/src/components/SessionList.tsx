import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Typography, Spin, Empty, Flex } from 'antd';
import { useSessions, Session } from '../hooks/useSessions';

const { Text } = Typography;

interface SessionListProps {
  onSessionSelect?: () => void;
}

export default function SessionList({ onSessionSelect }: SessionListProps) {
  const { t, i18n } = useTranslation();
  const { sessions, isLoading, error } = useSessions();
  const navigate = useNavigate();
  const { sessionId: currentSessionId } = useParams<{ sessionId: string }>();

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

  if (isLoading) {
    return (
      <Flex justify="center" align="center" style={{ padding: 16 }}>
        <Spin size="small" />
        <Text type="secondary" style={{ marginLeft: 8 }}>
          {t('sessionList.loadingSessions')}
        </Text>
      </Flex>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <Text type="danger">
          {t('common.error')}: {error}
        </Text>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t('sessionList.noSessions')}
        style={{ padding: 24 }}
      />
    );
  }

  return (
    <div>
      {sessions.map((session) => {
        const isActive = currentSessionId === session.id;
        return (
          <div
            key={session.id}
            onClick={() => handleSessionClick(session)}
            style={{
              padding: '12px 20px',
              cursor: 'pointer',
              borderBottom: '1px solid #f5f5f5',
              background: isActive ? '#fff8e6' : 'transparent',
              borderLeft: isActive
                ? '3px solid #f5a623'
                : '3px solid transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = '#f9f9f9';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <Text
              strong
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
        );
      })}
    </div>
  );
}
