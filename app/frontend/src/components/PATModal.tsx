import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Input, Button, Alert, Typography, Flex, Tooltip } from 'antd';
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  DeleteOutlined,
  WarningOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const PAT_STORAGE_KEY = 'databricks_pat';

interface PATModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PATModal({ isOpen, onClose }: PATModalProps) {
  const { t } = useTranslation();
  const [token, setToken] = useState('');
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const existing = localStorage.getItem(PAT_STORAGE_KEY);
      setSavedToken(existing);
      setToken('');
      setShowToken(false);
      setMessage(null);
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!token.trim()) return;

    setIsSaving(true);
    setMessage(null);

    try {
      localStorage.setItem(PAT_STORAGE_KEY, token.trim());
      setSavedToken(token.trim());
      setToken('');
      setMessage({ type: 'success', text: t('patModal.tokenSaved') });
      window.dispatchEvent(new Event('pat-changed'));
    } catch {
      setMessage({ type: 'error', text: t('patModal.saveFailed') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    localStorage.removeItem(PAT_STORAGE_KEY);
    setSavedToken(null);
    setMessage({ type: 'success', text: t('patModal.tokenDeleted') });
    window.dispatchEvent(new Event('pat-changed'));
  };

  const maskedToken = savedToken
    ? `${savedToken.slice(0, 8)}${'*'.repeat(20)}${savedToken.slice(-4)}`
    : null;

  return (
    <Modal
      title={t('patModal.title')}
      open={isOpen}
      onOk={handleSave}
      onCancel={onClose}
      okText={isSaving ? t('common.saving') : t('common.save')}
      cancelText={t('common.close')}
      okButtonProps={{
        disabled: !token.trim(),
        loading: isSaving,
      }}
      cancelButtonProps={{
        disabled: isSaving,
      }}
      width={480}
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          {t('patModal.description')}
        </Text>
        <Alert
          type="warning"
          icon={<WarningOutlined />}
          message={t('patModal.oboWarning')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      </div>

      {savedToken && (
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {t('patModal.currentToken')}
          </Text>
          <Flex
            align="center"
            gap={8}
            style={{
              padding: '8px 12px',
              background: '#f5f5f5',
              borderRadius: 6,
              fontFamily: 'monospace',
              fontSize: 13,
            }}
          >
            <Text
              code
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                wordBreak: 'break-all',
              }}
            >
              {showToken ? savedToken : maskedToken}
            </Text>
            <Tooltip
              title={
                showToken ? t('patModal.hideToken') : t('patModal.showToken')
              }
            >
              <Button
                type="text"
                size="small"
                icon={showToken ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                onClick={() => setShowToken(!showToken)}
              />
            </Tooltip>
            <Tooltip title={t('patModal.deleteToken')}>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={handleDelete}
              />
            </Tooltip>
          </Flex>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          {savedToken ? t('patModal.replaceToken') : t('patModal.enterToken')}
        </Text>
        <Input.Password
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={t('patModal.placeholder')}
          disabled={isSaving}
          autoFocus
          onPressEnter={handleSave}
        />
      </div>

      {message && <Alert type={message.type} message={message.text} showIcon />}
    </Modal>
  );
}
