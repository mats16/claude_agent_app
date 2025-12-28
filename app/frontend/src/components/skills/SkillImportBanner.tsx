import { Flex, Typography, Button, ConfigProvider } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { colors, borderRadius } from '../../styles/theme';

const { Text } = Typography;

interface SkillImportBannerProps {
  /** Translation key for the banner message text */
  messageKey: string;
  /** Callback when import button is clicked */
  onImportClick: () => void;
}

/**
 * Blue info banner for skill import CTAs
 * Used in QuickstartJobErrorsModal and QuickstartAppsModal
 */
export default function SkillImportBanner({
  messageKey,
  onImportClick,
}: SkillImportBannerProps) {
  const { t } = useTranslation();

  return (
    <Flex
      align="center"
      gap={8}
      style={{
        padding: '8px 12px',
        marginBottom: 16,
        background: colors.infoBg,
        borderRadius: borderRadius.md,
        border: `1px solid ${colors.infoBorder}`,
      }}
    >
      <InfoCircleOutlined style={{ color: colors.infoPrimary, fontSize: 16 }} />
      <Text style={{ flex: 1 }}>{t(messageKey)}</Text>
      <ConfigProvider theme={{ token: { colorPrimary: colors.infoPrimary } }}>
        <Button size="small" onClick={onImportClick}>
          {t('skillsModal.import')}
        </Button>
      </ConfigProvider>
    </Flex>
  );
}
