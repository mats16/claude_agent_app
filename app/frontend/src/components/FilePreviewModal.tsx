import { useState, useEffect, useCallback } from 'react';
import { Modal, Spin, Button, Flex, Typography, message } from 'antd';
import {
  DownloadOutlined,
  FilePdfOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../styles/theme';

const { Text } = Typography;

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  sessionId: string;
}

// Format file size to human readable
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Check if file is a PDF based on extension
function isPdfFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

export default function FilePreviewModal({
  isOpen,
  onClose,
  filePath,
  sessionId,
}: FilePreviewModalProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number>(0);
  const [lineCount, setLineCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const fileName = filePath.split('/').pop() || filePath;
  const isPdf = isPdfFileName(fileName);

  // Fetch file content
  useEffect(() => {
    if (!isOpen || isPdf) return;

    const fetchContent = async () => {
      setIsLoading(true);
      setError(null);
      setContent(null);

      try {
        const encodedPath = encodeURIComponent(filePath);
        const response = await fetch(
          `/api/v1/sessions/${sessionId}/files?path=${encodedPath}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch file');
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          setFileSize(parseInt(contentLength, 10));
        }

        const text = await response.text();
        setContent(text);
        setLineCount(text.split('\n').length);
      } catch (err) {
        setError(t('filePreview.loadError'));
        console.error('Failed to load file:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, [isOpen, filePath, sessionId, isPdf, t]);

  // Download file
  const handleDownload = useCallback(async () => {
    try {
      const encodedPath = encodeURIComponent(filePath);
      const response = await fetch(
        `/api/v1/sessions/${sessionId}/files?path=${encodedPath}`
      );

      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      message.error(t('filePreview.downloadError'));
      console.error('Failed to download file:', err);
    }
  }, [filePath, sessionId, fileName, t]);

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      title={null}
      footer={null}
      width={800}
      styles={{
        body: { padding: 0 },
      }}
    >
      <Flex vertical style={{ padding: 24 }}>
        {/* Header */}
        <Flex align="center" gap={12} style={{ marginBottom: 8 }}>
          {isPdf ? (
            <FilePdfOutlined style={{ fontSize: 24, color: colors.danger }} />
          ) : (
            <FileTextOutlined style={{ fontSize: 24, color: colors.info }} />
          )}
          <Text strong style={{ fontSize: 18 }}>
            {fileName}
          </Text>
        </Flex>

        {/* File info */}
        <Text type="secondary" style={{ marginBottom: 4 }}>
          {fileSize > 0 && formatFileSize(fileSize)}
          {lineCount > 0 && ` • ${lineCount}${t('filePreview.lines')}`}
          {!isPdf && ` • ${t('filePreview.formatWarning')}`}
        </Text>

        {/* Content area */}
        <div
          style={{
            marginTop: 16,
            background: colors.backgroundTertiary,
            borderRadius: 8,
            border: `1px solid ${colors.borderDark}`,
            maxHeight: 500,
            overflow: 'auto',
          }}
        >
          {isLoading && (
            <Flex justify="center" align="center" style={{ padding: 48 }}>
              <Spin />
            </Flex>
          )}

          {error && (
            <Flex justify="center" align="center" style={{ padding: 48 }}>
              <Text type="danger">{error}</Text>
            </Flex>
          )}

          {isPdf && (
            <Flex
              vertical
              justify="center"
              align="center"
              gap={16}
              style={{ padding: 48 }}
            >
              <FilePdfOutlined style={{ fontSize: 48, color: colors.danger }} />
              <Text type="secondary">{t('filePreview.pdfNoPreview')}</Text>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={handleDownload}
              >
                {t('filePreview.download')}
              </Button>
            </Flex>
          )}

          {!isPdf && content !== null && (
            <pre
              style={{
                margin: 0,
                padding: 16,
                fontSize: 13,
                lineHeight: 1.5,
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {content}
            </pre>
          )}
        </div>

        {/* Footer with download button */}
        {!isPdf && (
          <Flex justify="flex-end" style={{ marginTop: 16 }}>
            <Button icon={<DownloadOutlined />} onClick={handleDownload}>
              {t('filePreview.download')}
            </Button>
          </Flex>
        )}
      </Flex>
    </Modal>
  );
}
