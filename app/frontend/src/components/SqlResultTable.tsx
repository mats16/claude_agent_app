import { memo } from 'react';
import { Button, Typography, Space } from 'antd';
import { DownloadOutlined, TableOutlined } from '@ant-design/icons';

const { Text } = Typography;

// Marker for structured SQL result data (must match backend)
const SQL_RESULT_MARKER = '<!--SQL_RESULT-->';

interface SQLResultData {
  columns: string[];
  totalRows: number;
  resultPath: string;
}

interface SqlResultTableProps {
  data: SQLResultData;
  sessionId?: string;
}

// Parse SQL result from tool output
export function parseSqlResult(content: string): SQLResultData | null {
  if (!content.startsWith(SQL_RESULT_MARKER)) {
    return null;
  }
  try {
    const json = content.slice(SQL_RESULT_MARKER.length);
    return JSON.parse(json) as SQLResultData;
  } catch {
    return null;
  }
}

export default memo(function SqlResultTable({
  data,
  sessionId,
}: SqlResultTableProps) {
  const handleDownload = async () => {
    if (!sessionId) {
      console.error('Session ID is required for download');
      return;
    }

    const url = `/api/v1/sessions/${sessionId}/files?path=${encodeURIComponent(data.resultPath)}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      // Extract filename from resultPath
      const filename = data.resultPath.split('/').pop() || 'query-result.csv';
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  return (
    <div className="sql-result-table">
      <Space>
        <TableOutlined />
        <Text>
          {data.totalRows.toLocaleString()} rows, {data.columns.length} columns
        </Text>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleDownload}
          size="small"
          disabled={!sessionId}
        >
          Download CSV
        </Button>
      </Space>
    </div>
  );
});
