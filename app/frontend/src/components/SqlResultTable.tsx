import { memo, useMemo, useState } from 'react';
import { Table, Typography, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

// Marker for structured SQL result data (must match backend)
const SQL_RESULT_MARKER = '<!--SQL_RESULT-->';

interface SQLResultData {
  columns: string[];
  rows: unknown[][];
  totalRows: number;
  truncated: boolean;
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

// Format cell value for display
function formatCellValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return (
      <Text type="secondary" italic>
        NULL
      </Text>
    );
  }
  const strValue = String(value);
  if (strValue.length > 100) {
    return <span title={strValue}>{strValue.slice(0, 100)}...</span>;
  }
  return strValue;
}

// Generic sorter for table columns (handles null, numbers, strings)
function createSorter(dataIndex: string) {
  return (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const aVal = a[dataIndex];
    const bVal = b[dataIndex];

    // Handle nulls (nulls go to the end)
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    // Try numeric comparison
    const aNum = Number(aVal);
    const bNum = Number(bVal);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }

    // String comparison
    return String(aVal).localeCompare(String(bVal));
  };
}

export default memo(function SqlResultTable({ data }: SqlResultTableProps) {
  const [searchText, setSearchText] = useState('');

  const columns: ColumnsType<Record<string, unknown>> = useMemo(
    () =>
      data.columns.map((col, index) => ({
        title: col,
        dataIndex: String(index),
        key: col,
        ellipsis: true,
        sorter: createSorter(String(index)),
        render: (value: unknown) => formatCellValue(value),
      })),
    [data.columns]
  );

  const dataSource = useMemo(
    () =>
      data.rows.map((row, rowIndex) => {
        const record: Record<string, unknown> = { key: rowIndex };
        row.forEach((value, colIndex) => {
          record[String(colIndex)] = value;
        });
        return record;
      }),
    [data.rows]
  );

  // Filter data based on search text (searches all columns)
  const filteredData = useMemo(() => {
    if (!searchText.trim()) return dataSource;
    const lowerSearch = searchText.toLowerCase();
    return dataSource.filter((row) =>
      Object.values(row).some(
        (value) =>
          value !== null &&
          value !== undefined &&
          String(value).toLowerCase().includes(lowerSearch)
      )
    );
  }, [dataSource, searchText]);

  return (
    <div className="sql-result-table">
      <Input
        placeholder="Search..."
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        allowClear
        size="small"
        style={{ marginBottom: 8, maxWidth: 250 }}
      />
      <Table
        columns={columns}
        dataSource={filteredData}
        size="small"
        pagination={false}
        scroll={{ x: true, y: 300 }}
        bordered
        showSorterTooltip={false}
      />
      {data.truncated && (
        <Text
          type="secondary"
          style={{ fontSize: 12, marginTop: 8, display: 'block' }}
        >
          Results truncated. Showing {data.rows.length} of {data.totalRows}{' '}
          rows.
        </Text>
      )}
    </div>
  );
});
