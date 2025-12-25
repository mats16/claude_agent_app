/**
 * Subagents list component for the left panel
 * Displays list of subagents with create/import dropdown
 */

import { useTranslation } from 'react-i18next';
import {
  Button,
  List,
  Flex,
  Spin,
  Typography,
  Empty,
  Popconfirm,
  Dropdown,
} from 'antd';
import {
  TeamOutlined,
  PlusOutlined,
  DeleteOutlined,
  DownOutlined,
} from '@ant-design/icons';
import type { Subagent } from '../../hooks/useSubagents';
import { colors, spacing } from '../../styles/theme';

const { Text } = Typography;

interface SubagentsListProps {
  subagents: Subagent[];
  selectedSubagent: Subagent | null;
  isCreating: boolean;
  loading: boolean;
  isSaving: boolean;
  dropdownOpen: boolean;
  onDropdownOpenChange: (open: boolean) => void;
  onNewSubagent: () => void;
  onImportClick: () => void;
  onSelectSubagent: (subagent: Subagent) => void;
  onDeleteSubagent: (subagentName: string) => void;
}

export default function SubagentsList({
  subagents,
  selectedSubagent,
  isCreating,
  loading,
  isSaving,
  dropdownOpen,
  onDropdownOpenChange,
  onNewSubagent,
  onImportClick,
  onSelectSubagent,
  onDeleteSubagent,
}: SubagentsListProps) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        width: 280,
        borderRight: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: spacing.lg,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <Dropdown
          trigger={['click']}
          open={dropdownOpen}
          onOpenChange={onDropdownOpenChange}
          menu={{
            items: [
              {
                key: 'new',
                label: t('subagentModal.newSubagent'),
                icon: <PlusOutlined />,
              },
              {
                key: 'import',
                label: t('subagentModal.importPreset'),
                icon: <TeamOutlined />,
              },
            ],
            onClick: ({ key }) => {
              if (key === 'new') {
                onNewSubagent();
                onDropdownOpenChange(false);
              } else if (key === 'import') {
                onImportClick();
                onDropdownOpenChange(false);
              }
            },
          }}
        >
          <Button type="primary" block disabled={loading || isSaving}>
            {t('subagentModal.createMenu')} <DownOutlined />
          </Button>
        </Dropdown>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && subagents.length === 0 ? (
          <Flex
            justify="center"
            align="center"
            style={{ height: '100%', padding: spacing.xxl }}
          >
            <Spin />
          </Flex>
        ) : subagents.length === 0 ? (
          <Empty
            description={t('subagentModal.noSubagents')}
            style={{ marginTop: 60 }}
          />
        ) : (
          <List
            dataSource={subagents}
            renderItem={(subagent) => {
              const isSelected =
                selectedSubagent?.name === subagent.name && !isCreating;

              return (
                <List.Item
                  key={subagent.name}
                  onClick={() => onSelectSubagent(subagent)}
                  style={{
                    cursor: 'pointer',
                    padding: `${spacing.md}px ${spacing.lg}px`,
                    background: isSelected
                      ? colors.backgroundSecondary
                      : 'transparent',
                    borderLeft: isSelected
                      ? `3px solid ${colors.brand}`
                      : '3px solid transparent',
                  }}
                  actions={[
                    <Popconfirm
                      title={t('subagentModal.deleteConfirm')}
                      onConfirm={(e) => {
                        e?.stopPropagation();
                        onDeleteSubagent(subagent.name);
                      }}
                      okText={t('common.ok')}
                      cancelText={t('common.cancel')}
                      disabled={isSaving}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        danger
                        disabled={isSaving}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Text
                        ellipsis
                        style={{
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        {subagent.name}
                      </Text>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
