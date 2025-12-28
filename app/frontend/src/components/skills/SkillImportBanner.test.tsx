import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SkillImportBanner from './SkillImportBanner';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'quickstartJobs.importSkillLink': 'Import skill for Databricks Jobs',
        'quickstartApps.importSkillLink': 'Import skill for Databricks Apps',
        'skillsModal.import': 'Import',
      };
      return translations[key] || key;
    },
  }),
}));

describe('SkillImportBanner', () => {
  it('should render with correct message', () => {
    const onImportClick = vi.fn();

    render(
      <SkillImportBanner
        messageKey="quickstartJobs.importSkillLink"
        onImportClick={onImportClick}
      />
    );

    expect(
      screen.getByText('Import skill for Databricks Jobs')
    ).toBeInTheDocument();
  });

  it('should render import button', () => {
    const onImportClick = vi.fn();

    render(
      <SkillImportBanner
        messageKey="quickstartJobs.importSkillLink"
        onImportClick={onImportClick}
      />
    );

    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });

  it('should call onImportClick when button is clicked', async () => {
    const user = userEvent.setup();
    const onImportClick = vi.fn();

    render(
      <SkillImportBanner
        messageKey="quickstartJobs.importSkillLink"
        onImportClick={onImportClick}
      />
    );

    const button = screen.getByRole('button', { name: 'Import' });
    await user.click(button);

    expect(onImportClick).toHaveBeenCalledTimes(1);
  });

  it('should use different message for Apps quickstart', () => {
    const onImportClick = vi.fn();

    render(
      <SkillImportBanner
        messageKey="quickstartApps.importSkillLink"
        onImportClick={onImportClick}
      />
    );

    expect(
      screen.getByText('Import skill for Databricks Apps')
    ).toBeInTheDocument();
  });

  it('should have info icon', () => {
    const onImportClick = vi.fn();

    const { container } = render(
      <SkillImportBanner
        messageKey="quickstartJobs.importSkillLink"
        onImportClick={onImportClick}
      />
    );

    // Check for InfoCircleOutlined icon (Ant Design icon)
    const icon = container.querySelector('.anticon-info-circle');
    expect(icon).toBeInTheDocument();
  });

  it('should apply correct styling', () => {
    const onImportClick = vi.fn();

    const { container } = render(
      <SkillImportBanner
        messageKey="quickstartJobs.importSkillLink"
        onImportClick={onImportClick}
      />
    );

    const flexContainer = container.firstChild as HTMLElement;
    expect(flexContainer).toHaveStyle({
      padding: '8px 12px',
      marginBottom: '16px',
    });
  });
});
