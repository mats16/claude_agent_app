import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Select,
  Checkbox,
  Tooltip,
  Typography,
  Flex,
} from 'antd';
import {
  SendOutlined,
  SyncOutlined,
  FolderOutlined,
  EditOutlined,
} from '@ant-design/icons';
import SessionList from './SessionList';
import AccountMenu from './AccountMenu';
import WorkspaceSelectModal from './WorkspaceSelectModal';
import SettingsModal from './SettingsModal';
import { useUser } from '../contexts/UserContext';

const { TextArea } = Input;
const { Text } = Typography;

interface SidebarProps {
  width?: number;
  onSessionCreated?: (sessionId: string) => void;
}

export default function Sidebar({ onSessionCreated }: SidebarProps) {
  const { t } = useTranslation();
  const { userInfo, isLoading } = useUser();
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(
    'databricks-claude-sonnet-4-5'
  );
  const [workspacePath, setWorkspacePath] = useState('');
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overwrite, setOverwrite] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const navigate = useNavigate();

  const hasPermission = userInfo?.hasWorkspacePermission ?? null;

  // Set default workspace path from userInfo
  useEffect(() => {
    if (
      userInfo?.hasWorkspacePermission &&
      userInfo.workspaceHome &&
      !workspacePath
    ) {
      setWorkspacePath(userInfo.workspaceHome);
    }
  }, [userInfo, workspacePath]);

  // Show permission modal if no permission after loading
  useEffect(() => {
    if (!isLoading && hasPermission === false) {
      setShowPermissionModal(true);
    }
  }, [isLoading, hasPermission]);

  const handleSubmit = async () => {
    if (!input.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/v1/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: [
            {
              uuid: crypto.randomUUID(),
              session_id: '',
              type: 'user',
              message: { role: 'user', content: input.trim() },
            },
          ],
          session_context: {
            model: selectedModel,
            workspacePath: workspacePath.trim() || undefined,
            overwrite,
            autoSync,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      const sessionId = data.session_id;

      setInput('');
      onSessionCreated?.(sessionId);

      navigate(`/sessions/${sessionId}`, {
        state: {
          initialMessage: input.trim(),
        },
      });
    } catch (error) {
      console.error('Failed to create session:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePermissionGranted = () => {
    setShowPermissionModal(false);
  };

  return (
    <Flex
      vertical
      style={{
        height: '100%',
        background: '#fff',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Typography.Title
            level={5}
            style={{ margin: 0, color: '#1a1a1a', fontWeight: 700 }}
          >
            {t('sidebar.title')}
          </Typography.Title>
        </Link>
      </div>

      {/* Input Section */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
        <div
          style={{
            border: '1px solid #e5e5e5',
            borderRadius: 12,
            padding: '12px',
            background: '#fff',
          }}
        >
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('sidebar.placeholder')}
            disabled={isSubmitting}
            autoSize={{ minRows: 3, maxRows: 6 }}
            variant="borderless"
            style={{ padding: 0, marginBottom: 8 }}
          />
          <Flex justify="flex-end" align="center" gap={8}>
            <Select
              value={selectedModel}
              onChange={setSelectedModel}
              disabled={isSubmitting}
              style={{ width: 120 }}
              size="small"
              options={[
                { value: 'databricks-claude-opus-4-5', label: 'Opus 4.5' },
                { value: 'databricks-claude-sonnet-4-5', label: 'Sonnet 4.5' },
              ]}
            />
            <Tooltip
              title={!hasPermission ? t('sidebar.permissionRequired') : ''}
            >
              <Button
                type="primary"
                shape="circle"
                icon={<SendOutlined />}
                loading={isSubmitting}
                disabled={!input.trim() || !hasPermission}
                onClick={handleSubmit}
              />
            </Tooltip>
          </Flex>
        </div>

        <Flex align="center" gap={8} wrap="wrap" style={{ marginTop: 8 }}>
          <Button
            size="small"
            icon={<FolderOutlined />}
            onClick={() => setIsWorkspaceModalOpen(true)}
            disabled={isSubmitting}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={workspacePath || t('sidebar.selectWorkspace')}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {workspacePath || t('sidebar.selectWorkspace')}
            </span>
          </Button>
          <Tooltip title={t('sidebar.overwriteTooltip')}>
            <Checkbox
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              disabled={isSubmitting}
            >
              <Text style={{ fontSize: 12 }}>
                <EditOutlined style={{ marginRight: 4 }} />
                {t('sidebar.overwrite')}
              </Text>
            </Checkbox>
          </Tooltip>
          <Tooltip title={t('sidebar.autoSyncTooltip')}>
            <Checkbox
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              disabled={isSubmitting}
            >
              <Text style={{ fontSize: 12 }}>
                <SyncOutlined style={{ marginRight: 4 }} />
                {t('sidebar.autoSync')}
              </Text>
            </Checkbox>
          </Tooltip>
        </Flex>
      </div>

      {/* Sessions Section */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '12px 20px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: '#999',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {t('sidebar.sessions')}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <SessionList />
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0f0' }}>
        <AccountMenu />
      </div>

      <WorkspaceSelectModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onSelect={setWorkspacePath}
        initialPath={workspacePath}
      />

      <SettingsModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        isInitialSetup={!hasPermission}
        onPermissionGranted={handlePermissionGranted}
      />
    </Flex>
  );
}
