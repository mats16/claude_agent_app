/**
 * MCP section placeholder
 * To be implemented in the future
 */

import { useTranslation } from 'react-i18next';
import { Empty, Typography } from 'antd';
import { ApiOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function McpSection() {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
      }}
    >
      <Empty
        image={<ApiOutlined style={{ fontSize: 64, color: '#ccc' }} />}
        description={
          <Text type="secondary">{t('claudeCodeSettings.mcpPlaceholder')}</Text>
        }
      />
    </div>
  );
}
