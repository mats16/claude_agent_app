/**
 * Date formatting utilities
 * Provides relative time formatting and locale-aware date display
 */

export interface RelativeTimeTranslations {
  justNow: string;
  minutesAgo: (count: number) => string;
  hoursAgo: (count: number) => string;
  daysAgo: (count: number) => string;
}

/**
 * Calculate relative time from a date
 * Returns the appropriate unit and count for relative time display
 */
export function getRelativeTime(date: Date): {
  unit: 'justNow' | 'minutes' | 'hours' | 'days' | 'date';
  count: number;
} {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return { unit: 'justNow', count: 0 };
  if (diffMins < 60) return { unit: 'minutes', count: diffMins };
  if (diffHours < 24) return { unit: 'hours', count: diffHours };
  if (diffDays < 7) return { unit: 'days', count: diffDays };
  return { unit: 'date', count: diffDays };
}

/**
 * Format a date string as relative time with translations
 * Falls back to localized date for dates older than 7 days
 */
export function formatRelativeDate(
  dateString: string,
  locale: string,
  translations: RelativeTimeTranslations
): string {
  const date = new Date(dateString);
  const relative = getRelativeTime(date);

  switch (relative.unit) {
    case 'justNow':
      return translations.justNow;
    case 'minutes':
      return translations.minutesAgo(relative.count);
    case 'hours':
      return translations.hoursAgo(relative.count);
    case 'days':
      return translations.daysAgo(relative.count);
    case 'date':
    default:
      return date.toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', {
        month: 'short',
        day: 'numeric',
      });
  }
}

/**
 * Format a date as a short date string
 */
export function formatShortDate(dateString: string, locale: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date as a full date string with time
 */
export function formatFullDate(dateString: string, locale: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
