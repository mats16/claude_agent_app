import matter from 'gray-matter';

export interface SubagentMetadata {
  name: string;
  description: string;
  tools?: string;
  model?: 'sonnet' | 'opus';
  content: string;
}

// Parse YAML frontmatter from subagent file content
export function parseSubagentContent(fileContent: string): SubagentMetadata {
  const parsed = matter(fileContent);
  const model = parsed.data.model;
  return {
    name: parsed.data.name || '',
    description: parsed.data.description || '',
    tools: parsed.data.tools || undefined,
    model: model === 'sonnet' || model === 'opus' ? model : undefined,
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

// Format subagent content with YAML frontmatter
export function formatSubagentContent(
  name: string,
  description: string,
  content: string,
  tools?: string,
  model?: 'sonnet' | 'opus'
): string {
  let frontmatter = `---
name: ${name}
description: ${formatYamlValue(description)}`;

  if (tools) {
    frontmatter += `\ntools: ${tools}`;
  }

  if (model) {
    frontmatter += `\nmodel: ${model}`;
  }

  frontmatter += '\n---';

  return `${frontmatter}

${content}`;
}
