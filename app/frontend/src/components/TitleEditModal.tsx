import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Input, Checkbox, Typography } from 'antd';
import { SyncOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface TitleEditModalProps {
  isOpen: boolean;
  currentTitle: string;
  currentAutoSync: boolean;
  onSave: (newTitle: string, autoSync: boolean) => void;
  onClose: () => void;
}

export default function TitleEditModal({
  isOpen,
  currentTitle,
  currentAutoSync,
  onSave,
  onClose,
}: TitleEditModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(currentTitle);
  const [autoSync, setAutoSync] = useState(currentAutoSync);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle(currentTitle);
      setAutoSync(currentAutoSync);
    }
  }, [isOpen, currentTitle, currentAutoSync]);

  const handleOk = async () => {
    if (!title.trim() || isSaving) return;

    setIsSaving(true);
    try {
      await onSave(title.trim(), autoSync);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      title={t('titleEditModal.title')}
      open={isOpen}
      onOk={handleOk}
      onCancel={onClose}
      okText={isSaving ? t('common.saving') : t('common.save')}
      cancelText={t('common.cancel')}
      okButtonProps={{
        disabled: !title.trim(),
        loading: isSaving,
      }}
      cancelButtonProps={{
        disabled: isSaving,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          {t('titleEditModal.sessionTitle')}
        </Text>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('titleEditModal.titlePlaceholder')}
          disabled={isSaving}
          autoFocus
          onPressEnter={handleOk}
        />
      </div>
      <div>
        <Checkbox
          checked={autoSync}
          onChange={(e) => setAutoSync(e.target.checked)}
          disabled={isSaving}
        >
          <SyncOutlined style={{ marginRight: 4 }} />
          {t('sidebar.autoSync')}
        </Checkbox>
        <Text
          type="secondary"
          style={{
            display: 'block',
            marginTop: 4,
            marginLeft: 24,
            fontSize: 12,
          }}
        >
          {t('titleEditModal.autoSyncHint')}
        </Text>
      </div>
    </Modal>
  );
}
