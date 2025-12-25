import { useRef, useCallback, DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Flex, Spin, Tooltip } from 'antd';
import {
  FileOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  CloseOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { AttachedFile } from '../hooks/useFileUpload';
import { formatFileSize, isPdfFile } from '../utils/fileUtils';
import { colors } from '../styles/theme';

interface FileUploadProps {
  files: AttachedFile[];
  onFilesChange: (files: AttachedFile[]) => void;
  onAddFiles: (files: FileList | File[]) => void;
  disabled?: boolean;
  maxFiles?: number;
  showButtonOnly?: boolean;
}

export default function FileUpload({
  files,
  onFilesChange,
  onAddFiles,
  disabled = false,
  maxFiles = 10,
  showButtonOnly,
}: FileUploadProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onAddFiles(e.target.files);
        e.target.value = '';
      }
    },
    [onAddFiles]
  );

  const handleRemove = useCallback(
    (id: string) => {
      onFilesChange(files.filter((f) => f.id !== id));
    },
    [files, onFilesChange]
  );

  const getFileIcon = (file: AttachedFile) => {
    if (isPdfFile(file.file)) {
      return <FilePdfOutlined style={{ fontSize: 20, color: colors.danger }} />;
    }
    return <FileTextOutlined style={{ fontSize: 20, color: colors.info }} />;
  };

  const getStatusIcon = (file: AttachedFile) => {
    switch (file.status) {
      case 'uploading':
        return <LoadingOutlined style={{ fontSize: 12, color: colors.info }} />;
      case 'uploaded':
        return (
          <CheckCircleOutlined
            style={{ fontSize: 12, color: colors.success }}
          />
        );
      case 'error':
        return (
          <Tooltip title={file.errorMessage}>
            <ExclamationCircleOutlined
              style={{ fontSize: 12, color: colors.danger }}
            />
          </Tooltip>
        );
      default:
        return null;
    }
  };

  // Accept attribute for file input
  const acceptTypes = [
    'application/pdf',
    'text/plain',
    'text/csv',
    'text/markdown',
    'application/json',
    '.txt',
    '.csv',
    '.md',
    '.json',
    '.xml',
    '.yaml',
    '.yml',
    '.js',
    '.ts',
    '.py',
    '.sql',
    '.sh',
    '.log',
  ].join(',');

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptTypes}
        multiple
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      <Flex align="center" gap={8}>
        {/* Show button when showButtonOnly is true */}
        {showButtonOnly === true && (
          <Button
            type="text"
            icon={<FileOutlined />}
            onClick={handleClick}
            disabled={disabled || files.length >= maxFiles}
            title={t('fileUpload.attachFile')}
          />
        )}

        {/* Show file previews when showButtonOnly is false */}
        {showButtonOnly === false && files.length > 0 && (
          <Flex gap={8} wrap="wrap" style={{ width: '100%' }}>
            {files.map((file) => (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: `1px solid ${colors.borderDark}`,
                  background:
                    file.status === 'error'
                      ? colors.errorBg
                      : colors.backgroundTertiary,
                  maxWidth: 200,
                }}
              >
                {getFileIcon(file)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={file.file.name}
                  >
                    {file.file.name}
                  </div>
                  <div style={{ fontSize: 10, color: colors.textMuted }}>
                    {formatFileSize(file.file.size)}
                    {file.type === 'pdf' && ' (PDF)'}
                  </div>
                </div>
                <Flex align="center" gap={4}>
                  {getStatusIcon(file)}
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined style={{ fontSize: 10 }} />}
                    onClick={() => handleRemove(file.id)}
                    disabled={file.status === 'uploading'}
                    style={{
                      padding: 2,
                      minWidth: 16,
                      height: 16,
                    }}
                  />
                </Flex>
              </div>
            ))}
          </Flex>
        )}
      </Flex>
    </div>
  );
}
