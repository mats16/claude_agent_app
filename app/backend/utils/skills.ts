import matter from 'gray-matter';

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  content: string;
}

// Parse YAML frontmatter from skill file content
export function parseSkillContent(fileContent: string): SkillMetadata {
  const parsed = matter(fileContent);
  return {
    name: parsed.data.name || '',
    description: parsed.data.description || '',
    version: parsed.data.version || '1.0.0',
    content: parsed.content.trim(),
  };
}

// Format a YAML value using literal block scalar (|) for safe multiline handling
function formatYamlValue(value: string): string {
  const indentedValue = value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
  return `|\n${indentedValue}`;
}

// Format skill content with YAML frontmatter
export function formatSkillContent(
  name: string,
  description: string,
  version: string,
  content: string
): string {
  return `---
name: ${name}
description: ${formatYamlValue(description)}
version: ${version}
---

${content}`;
}
