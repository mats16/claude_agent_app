/**
 * Short model names for display
 */
export type ShortModelName = 'haiku' | 'sonnet' | 'opus';

/**
 * Full model names (Databricks models)
 */
export type FullModelName =
  | 'databricks-claude-haiku-4-5'
  | 'databricks-claude-sonnet-4-5'
  | 'databricks-claude-opus-4-5';

/**
 * Convert full model name to short model name.
 *
 * @param fullModelName - Full model name from database
 * @returns Short model name (haiku/sonnet/opus)
 */
export function toShortModelName(fullModelName: FullModelName): ShortModelName {
  if (fullModelName == 'databricks-claude-haiku-4-5') {
    return 'haiku';
  } else if (fullModelName == 'databricks-claude-sonnet-4-5') {
    return 'sonnet';
  } else if (fullModelName == 'databricks-claude-opus-4-5') {
    return 'opus';
  } else {
    console.warn(`[toShortModelName] Unknown model name: ${fullModelName}`);
    throw new Error(`Unknown model name: ${fullModelName}`);
  }
}
