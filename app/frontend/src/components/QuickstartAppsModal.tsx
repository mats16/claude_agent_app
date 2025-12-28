import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Modal,
  Typography,
  List,
  Spin,
  Empty,
  Alert,
  Flex,
  Button,
  Input,
  message,
} from 'antd';
import {
  RocketOutlined,
  FolderOutlined,
  GithubOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { colors, borderRadius } from '../styles/theme';
import { useAppTemplates, AppTemplate } from '../hooks/useAppTemplates';
import { useUser } from '../contexts/UserContext';
import WorkspaceSelectModal from './WorkspaceSelectModal';
import { useSkillImport } from '../hooks/useSkillImport';
import SkillImportBanner from './skills/SkillImportBanner';
import PresetImportModal from './skills/PresetImportModal';

const { Text } = Typography;

interface QuickstartAppsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Format timestamp as YYYYMMDD-HHmmss
function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export default function QuickstartAppsModal({
  isOpen,
  onClose,
}: QuickstartAppsModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userInfo } = useUser();
  const { templates, loading, error, cached, fetchTemplates, createRepo } =
    useAppTemplates();

  const [selectedTemplate, setSelectedTemplate] = useState<AppTemplate | null>(
    null
  );
  const [workspacePath, setWorkspacePath] = useState('');
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Step: 'select' or 'configure'
  const [step, setStep] = useState<'select' | 'configure'>('select');

  // Skill import using custom hook
  const {
    isImportModalOpen,
    activeImportTab,
    isSavingSkill,
    databricksSkillNames,
    databricksLoading,
    databricksError,
    anthropicSkillNames,
    anthropicLoading,
    anthropicError,
    openImportModal,
    closeImportModal,
    setActiveImportTab,
    handleImportSkill,
    fetchSkillDetail,
  } = useSkillImport();

  // Fetch templates when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setStep('select');
      setSelectedTemplate(null);
      setWorkspacePath('');
      setCreateError(null);
    }
  }, [isOpen, fetchTemplates]);

  // Generate default path when template is selected
  useEffect(() => {
    if (selectedTemplate && userInfo?.email) {
      const timestamp = formatTimestamp();
      const defaultPath = `/Workspace/Users/${userInfo.email}/databricks_apps/${selectedTemplate.name}-${timestamp}`;
      setWorkspacePath(defaultPath);
    }
  }, [selectedTemplate, userInfo?.email]);

  const handleTemplateSelect = (template: AppTemplate) => {
    setSelectedTemplate(template);
    setStep('configure');
  };

  const handleBack = () => {
    setStep('select');
    setCreateError(null);
  };

  const handleWorkspaceSelect = (path: string) => {
    // Append template name if user selects a directory
    if (selectedTemplate) {
      const timestamp = formatTimestamp();
      setWorkspacePath(`${path}/${selectedTemplate.name}-${timestamp}`);
    } else {
      setWorkspacePath(path);
    }
  };

  const handleCreate = async () => {
    if (!selectedTemplate || !workspacePath) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      // Create Git folder with sparse checkout for the selected template only
      const repoUrl = `https://github.com/databricks/app-templates`;

      // Use sparse checkout to only sync the selected template directory
      const result = await createRepo(repoUrl, workspacePath, {
        patterns: [selectedTemplate.name],
      });

      if (!result) {
        throw new Error(t('quickstartApps.createFailed'));
      }

      // The template files are in {repo_path}/{template_name}/ due to sparse checkout
      const templateWorkspacePath = `${result.path}/${selectedTemplate.name}`;

      // Create session with the workspace path
      const sessionResponse = await fetch('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [
            {
              uuid: crypto.randomUUID(),
              session_id: '',
              type: 'user',
              message: {
                role: 'user',
                content: t('quickstartApps.initialMessage', {
                  templateName: selectedTemplate.name,
                }),
              },
            },
          ],
          session_context: {
            model: 'databricks-claude-opus-4-5',
            workspacePath: templateWorkspacePath,
            workspaceAutoPush: true,
            appAutoDeploy: true,
          },
        }),
      });

      if (!sessionResponse.ok) {
        throw new Error(t('quickstartApps.createFailed'));
      }

      const sessionData = await sessionResponse.json();
      message.success(t('quickstartApps.createSuccess'));
      onClose();
      navigate(`/sessions/${sessionData.session_id}`);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : t('quickstartApps.createFailed');

      // Check for "already exists" error
      if (
        errorMessage.includes('already exists') ||
        errorMessage.includes('RESOURCE_ALREADY_EXISTS')
      ) {
        setCreateError(t('quickstartApps.alreadyExists'));
      } else {
        setCreateError(errorMessage);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const getErrorMessage = () => {
    if (error === 'RATE_LIMITED') {
      return t('quickstartApps.rateLimitError');
    }
    if (error?.includes('GitHub API error') || error?.includes('fetch')) {
      return t('quickstartApps.networkError');
    }
    return error;
  };

  const renderTemplateList = () => (
    <>
      {error && (
        <Alert
          type={cached ? 'warning' : 'error'}
          message={getErrorMessage()}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <div
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.md,
          maxHeight: 400,
          overflow: 'auto',
        }}
      >
        {loading ? (
          <Flex justify="center" align="center" style={{ padding: 48 }}>
            <Spin />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              {t('quickstartApps.loading')}
            </Text>
          </Flex>
        ) : templates.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('quickstartApps.noTemplates')}
            style={{ padding: 48 }}
          />
        ) : (
          <List
            size="small"
            dataSource={templates}
            renderItem={(template) => (
              <List.Item
                onClick={() => handleTemplateSelect(template)}
                style={{
                  cursor: 'pointer',
                  padding: '12px 16px',
                  transition: 'background 0.15s',
                  background:
                    selectedTemplate?.name === template.name
                      ? colors.brandBg
                      : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (selectedTemplate?.name !== template.name) {
                    e.currentTarget.style.background =
                      colors.backgroundTertiary;
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedTemplate?.name !== template.name) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <Flex align="center" gap={12} style={{ width: '100%' }}>
                  <RocketOutlined
                    style={{ fontSize: 18, color: colors.brand }}
                  />
                  <Flex vertical style={{ flex: 1 }}>
                    <Text
                      strong
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 14,
                      }}
                    >
                      {template.name}
                    </Text>
                  </Flex>
                  <Button
                    type="text"
                    size="small"
                    icon={<GithubOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(template.repoUrl, '_blank');
                    }}
                    style={{ color: colors.textMuted }}
                  />
                </Flex>
              </List.Item>
            )}
          />
        )}
      </div>

      {cached && !error && (
        <Text
          type="secondary"
          style={{ fontSize: 12, marginTop: 8, display: 'block' }}
        >
          {t('quickstartApps.cachedData')}
        </Text>
      )}
    </>
  );

  const renderConfiguration = () => (
    <>
      {createError && (
        <Alert
          type="error"
          message={createError}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Flex
        align="center"
        gap={12}
        style={{
          padding: '12px 16px',
          background: colors.backgroundHover,
          borderRadius: borderRadius.md,
          marginBottom: 16,
        }}
      >
        <RocketOutlined style={{ fontSize: 20, color: colors.brand }} />
        <Flex vertical>
          <Text strong>{selectedTemplate?.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            databricks/app-templates
          </Text>
        </Flex>
        <Button
          type="link"
          size="small"
          icon={<ExportOutlined />}
          onClick={() => window.open(selectedTemplate?.repoUrl, '_blank')}
          style={{ marginLeft: 'auto' }}
        >
          GitHub
        </Button>
      </Flex>

      <Flex vertical gap={8}>
        <Text strong>{t('quickstartApps.workspacePath')}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('quickstartApps.workspacePathHint')}
        </Text>
        <Flex gap={8}>
          <Input
            value={workspacePath}
            onChange={(e) => setWorkspacePath(e.target.value)}
            placeholder="/Workspace/Users/..."
            style={{ flex: 1 }}
          />
          <Button
            icon={<FolderOutlined />}
            onClick={() => setIsWorkspaceModalOpen(true)}
          >
            {t('quickstartApps.browse')}
          </Button>
        </Flex>
      </Flex>

      <WorkspaceSelectModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onSelect={handleWorkspaceSelect}
        initialPath={userInfo?.workspaceHome}
      />
    </>
  );

  return (
    <Modal
      title={
        <Flex align="center" gap={8}>
          <RocketOutlined style={{ color: colors.brand }} />
          <span>{t('quickstartApps.title')}</span>
        </Flex>
      }
      open={isOpen}
      onCancel={onClose}
      width={600}
      footer={
        step === 'select' ? (
          <Button onClick={onClose}>{t('common.cancel')}</Button>
        ) : (
          <Flex justify="space-between">
            <Button onClick={handleBack} disabled={isCreating}>
              {t('common.cancel')}
            </Button>
            <Button
              type="primary"
              onClick={handleCreate}
              loading={isCreating}
              disabled={!workspacePath || isCreating}
            >
              {isCreating
                ? t('quickstartApps.creating')
                : t('quickstartApps.create')}
            </Button>
          </Flex>
        )
      }
    >
      {step === 'select' ? (
        <>
          <SkillImportBanner
            messageKey="quickstartApps.importSkillLink"
            onImportClick={openImportModal}
          />
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {t('quickstartApps.selectTemplate')}
          </Text>
          {renderTemplateList()}
        </>
      ) : (
        renderConfiguration()
      )}

      <PresetImportModal
        isOpen={isImportModalOpen}
        databricksSkillNames={databricksSkillNames}
        databricksLoading={databricksLoading}
        databricksError={databricksError}
        anthropicSkillNames={anthropicSkillNames}
        anthropicLoading={anthropicLoading}
        anthropicError={anthropicError}
        isSaving={isSavingSkill}
        activeTab={activeImportTab}
        onClose={closeImportModal}
        onTabChange={setActiveImportTab}
        onFetchDetail={fetchSkillDetail}
        onImport={handleImportSkill}
      />
    </Modal>
  );
}
