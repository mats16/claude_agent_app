/**
 * Skills list component for the left panel
 * Displays list of skills with create/import dropdown
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
  ThunderboltOutlined,
  PlusOutlined,
  DeleteOutlined,
  DownOutlined,
} from '@ant-design/icons';
import type { Skill } from '../../hooks/useSkills';
import { colors, spacing, borderRadius } from '../../styles/theme';

const { Text } = Typography;

interface SkillsListProps {
  skills: Skill[];
  selectedSkill: Skill | null;
  isCreating: boolean;
  loading: boolean;
  isSaving: boolean;
  dropdownOpen: boolean;
  onDropdownOpenChange: (open: boolean) => void;
  onNewSkill: () => void;
  onImportClick: () => void;
  onSelectSkill: (skill: Skill) => void;
  onDeleteSkill: (skillName: string) => void;
}

export default function SkillsList({
  skills,
  selectedSkill,
  isCreating,
  loading,
  isSaving,
  dropdownOpen,
  onDropdownOpenChange,
  onNewSkill,
  onImportClick,
  onSelectSkill,
  onDeleteSkill,
}: SkillsListProps) {
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
                label: t('skillsModal.newSkill'),
                icon: <PlusOutlined />,
              },
              {
                key: 'import',
                label: t('skillsModal.importPreset'),
                icon: <ThunderboltOutlined />,
              },
            ],
            onClick: ({ key }) => {
              if (key === 'new') {
                onNewSkill();
                onDropdownOpenChange(false);
              } else if (key === 'import') {
                onImportClick();
                onDropdownOpenChange(false);
              }
            },
          }}
        >
          <Button type="primary" block disabled={loading || isSaving}>
            {t('skillsModal.createMenu')} <DownOutlined />
          </Button>
        </Dropdown>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && skills.length === 0 ? (
          <Flex
            justify="center"
            align="center"
            style={{ height: '100%', padding: spacing.xxl }}
          >
            <Spin />
          </Flex>
        ) : skills.length === 0 ? (
          <Empty
            description={t('skillsModal.noSkills')}
            style={{ marginTop: 60 }}
          />
        ) : (
          <List
            dataSource={skills}
            renderItem={(skill) => {
              const isSelected =
                selectedSkill?.name === skill.name && !isCreating;

              return (
                <List.Item
                  key={skill.name}
                  onClick={() => onSelectSkill(skill)}
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
                      title={t('skillsModal.deleteConfirm')}
                      onConfirm={(e) => {
                        e?.stopPropagation();
                        onDeleteSkill(skill.name);
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
                        {skill.name}
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
