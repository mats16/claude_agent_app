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

export default memo(function SqlResultTable({ data }: SqlResultTableProps) {
  const handleDownload = () => {
    // TODO: Implement actual download via API
    console.log('Download CSV:', data.resultPath);
    alert(`Download: ${data.resultPath}`);
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
        >
          Download CSV
        </Button>
      </Space>
    </div>
  );
});
