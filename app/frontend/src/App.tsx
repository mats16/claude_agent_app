import { useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Typography, Flex } from 'antd';
import {
  FolderOutlined,
  BookOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import Layout from './components/Layout';
import SessionPage from './pages/SessionPage';
import { colors, borderRadius, typography } from './styles/theme';
import './App.css';

const { Title, Text } = Typography;

function WelcomePage() {
  const { t } = useTranslation();

  const actionCards = useMemo(
    () => [
      {
        id: 'explore',
        icon: <FolderOutlined style={{ fontSize: 24, color: colors.brand }} />,
        title: t('welcome.exploreTitle'),
        description: t('welcome.exploreDescription'),
      },
      {
        id: 'eda',
        icon: <BookOutlined style={{ fontSize: 24, color: colors.brand }} />,
        title: t('welcome.edaTitle'),
        description: t('welcome.edaDescription'),
      },
      {
        id: 'apps',
        icon: <RocketOutlined style={{ fontSize: 24, color: colors.brand }} />,
        title: t('welcome.appsTitle'),
        description: t('welcome.appsDescription'),
      },
    ],
    [t]
  );

  return (
    <Flex
      vertical
      justify="center"
      align="center"
      style={{
        height: '100%',
        padding: 32,
        background: colors.backgroundSecondary,
      }}
    >
      <Flex vertical align="center" style={{ maxWidth: 600, width: '100%' }}>
        {/* Logo */}
        <div style={{ marginBottom: 40 }}>
          <svg
            width="80"
            height="80"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="10"
              y="30"
              width="80"
              height="50"
              rx="8"
              fill={colors.brand}
            />
            <rect
              x="20"
              y="20"
              width="60"
              height="15"
              rx="4"
              fill={colors.brand}
            />
            <circle cx="35" cy="50" r="8" fill={colors.textPrimary} />
            <circle cx="65" cy="50" r="8" fill={colors.textPrimary} />
            <rect
              x="30"
              y="65"
              width="40"
              height="5"
              rx="2"
              fill={colors.textPrimary}
            />
          </svg>
        </div>

        {/* Action Cards */}
        <Flex vertical gap={12} style={{ width: '100%' }}>
          {actionCards.map((card) => (
            <Card
              key={card.id}
              size="small"
              style={{
                borderRadius: borderRadius.lg,
                border: `1px solid ${colors.border}`,
                boxShadow: 'none',
              }}
              hoverable
            >
              <Flex justify="space-between" align="center">
                <div style={{ flex: 1 }}>
                  <Title level={5} style={{ margin: 0, marginBottom: 4 }}>
                    {card.title}
                  </Title>
                  <Text
                    type="secondary"
                    style={{ fontSize: typography.fontSizeSmall + 1 }}
                  >
                    {card.description}
                  </Text>
                </div>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: borderRadius.md,
                    background: colors.brandBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 16,
                  }}
                >
                  {card.icon}
                </div>
              </Flex>
            </Card>
          ))}
        </Flex>
      </Flex>
    </Flex>
  );
}

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/sessions/:sessionId" element={<SessionPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
