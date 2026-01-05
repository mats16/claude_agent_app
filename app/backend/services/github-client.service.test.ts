import { describe, it, expect } from 'vitest';
import {
  parseGitHubRepo,
  parseFrontmatter,
  parseSkillFrontmatter,
  parseAgentFrontmatter,
} from './github-client.service.js';

describe('parseGitHubRepo', () => {
  describe('valid inputs', () => {
    it('should parse simple owner/repo URL', () => {
      expect(parseGitHubRepo('https://github.com/owner/repo')).toBe(
        'owner/repo'
      );
    });

    it('should parse URL with .git suffix', () => {
      expect(parseGitHubRepo('https://github.com/owner/repo.git')).toBe(
        'owner/repo'
      );
    });

    it('should parse URL with hyphen in owner', () => {
      expect(parseGitHubRepo('https://github.com/my-org/repo')).toBe(
        'my-org/repo'
      );
    });

    it('should parse URL with hyphen in repo', () => {
      expect(parseGitHubRepo('https://github.com/owner/my-repo')).toBe(
        'owner/my-repo'
      );
    });

    it('should parse URL with underscore', () => {
      expect(parseGitHubRepo('https://github.com/my_org/my_repo')).toBe(
        'my_org/my_repo'
      );
    });

    it('should parse URL with dot in repo name', () => {
      expect(parseGitHubRepo('https://github.com/owner/repo.js')).toBe(
        'owner/repo.js'
      );
    });

    it('should parse URL with numbers', () => {
      expect(parseGitHubRepo('https://github.com/org123/repo456')).toBe(
        'org123/repo456'
      );
    });

    it('should parse anthropics/skills', () => {
      expect(parseGitHubRepo('https://github.com/anthropics/skills')).toBe(
        'anthropics/skills'
      );
    });

    it('should parse mats16/claude-agent-databricks', () => {
      expect(
        parseGitHubRepo('https://github.com/mats16/claude-agent-databricks')
      ).toBe('mats16/claude-agent-databricks');
    });
  });

  describe('path traversal attacks', () => {
    it('should reject URL with .. in owner', () => {
      expect(parseGitHubRepo('https://github.com/../repo')).toBeNull();
    });

    it('should reject URL with .. in repo', () => {
      expect(parseGitHubRepo('https://github.com/owner/..')).toBeNull();
    });

    it('should reject URL with ../ pattern', () => {
      expect(
        parseGitHubRepo('https://github.com/../malicious/repo')
      ).toBeNull();
    });

    it('should reject owner starting with dot', () => {
      expect(parseGitHubRepo('https://github.com/.hidden/repo')).toBeNull();
    });

    it('should reject repo starting with dot', () => {
      expect(parseGitHubRepo('https://github.com/owner/.hidden')).toBeNull();
    });

    it('should reject owner starting with hyphen', () => {
      expect(parseGitHubRepo('https://github.com/-invalid/repo')).toBeNull();
    });

    it('should reject repo starting with hyphen', () => {
      expect(parseGitHubRepo('https://github.com/owner/-invalid')).toBeNull();
    });

    it('should reject URL with embedded path separators', () => {
      expect(parseGitHubRepo('https://github.com/owner/repo/extra')).toBeNull();
    });

    it('should reject URL with backslash', () => {
      expect(parseGitHubRepo('https://github.com/owner\\repo')).toBeNull();
    });
  });

  describe('invalid formats', () => {
    it('should reject HTTP URL', () => {
      expect(parseGitHubRepo('http://github.com/owner/repo')).toBeNull();
    });

    it('should reject non-GitHub URL', () => {
      expect(parseGitHubRepo('https://gitlab.com/owner/repo')).toBeNull();
    });

    it('should reject URL without repo', () => {
      expect(parseGitHubRepo('https://github.com/owner')).toBeNull();
    });

    it('should reject URL with empty owner', () => {
      expect(parseGitHubRepo('https://github.com//repo')).toBeNull();
    });

    it('should reject URL with empty repo', () => {
      expect(parseGitHubRepo('https://github.com/owner/')).toBeNull();
    });

    it('should reject plain text', () => {
      expect(parseGitHubRepo('owner/repo')).toBeNull();
    });

    it('should reject empty string', () => {
      expect(parseGitHubRepo('')).toBeNull();
    });

    it('should reject URL with query string', () => {
      expect(
        parseGitHubRepo('https://github.com/owner/repo?ref=main')
      ).toBeNull();
    });

    it('should reject URL with fragment', () => {
      expect(
        parseGitHubRepo('https://github.com/owner/repo#readme')
      ).toBeNull();
    });

    it('should reject SSH URL', () => {
      expect(parseGitHubRepo('git@github.com:owner/repo.git')).toBeNull();
    });
  });
});

describe('parseFrontmatter', () => {
  describe('valid frontmatter', () => {
    it('should parse simple frontmatter', () => {
      const content = `---
name: test-skill
description: A test skill
version: 1.0.0
---
This is the content.`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter).toEqual({
        name: 'test-skill',
        description: 'A test skill',
        version: '1.0.0',
      });
      expect(result.body).toBe('This is the content.');
    });

    it('should parse frontmatter with arrays', () => {
      const content = `---
name: test-agent
tools:
  - read
  - write
  - execute
---
Agent content`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter.name).toBe('test-agent');
      expect(result.frontmatter.tools).toEqual(['read', 'write', 'execute']);
    });

    it('should parse frontmatter with inline array', () => {
      const content = `---
name: test
tools: [read, write]
---
Content`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter.tools).toEqual(['read', 'write']);
    });

    it('should parse frontmatter with multiline description', () => {
      const content = `---
name: test
description: >
  This is a long
  description that spans
  multiple lines
---
Content`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter.description).toContain('This is a long');
    });

    it('should handle empty body', () => {
      const content = `---
name: test
---
`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter.name).toBe('test');
      expect(result.body).toBe('');
    });
  });

  describe('no frontmatter', () => {
    it('should return empty frontmatter for content without ---', () => {
      const content = 'Just plain content without frontmatter';
      const result = parseFrontmatter(content);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe('Just plain content without frontmatter');
    });

    it('should return empty frontmatter for content with single ---', () => {
      const content = `---
Some content but not valid frontmatter`;
      const result = parseFrontmatter(content);
      expect(result.frontmatter).toEqual({});
    });
  });

  describe('malformed YAML', () => {
    it('should return empty frontmatter for invalid YAML', () => {
      const content = `---
invalid: yaml: syntax: here
---
Content`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe('Content');
    });

    it('should handle YAML with special characters safely', () => {
      const content = `---
name: "test: with colon"
description: "has 'single quotes' inside"
---
Content`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter.name).toBe('test: with colon');
      expect(result.frontmatter.description).toBe("has 'single quotes' inside");
    });
  });

  describe('security', () => {
    it('should not execute JavaScript in YAML', () => {
      // This tests that JSON_SCHEMA prevents code execution
      const content = `---
name: !!js/function "function() { return 'malicious'; }"
---
Content`;

      const result = parseFrontmatter(content);
      // Should not execute, should either fail or treat as string
      expect(typeof result.frontmatter.name).not.toBe('function');
    });
  });
});

describe('parseSkillFrontmatter', () => {
  it('should parse valid skill frontmatter', () => {
    const content = `---
name: my-skill
description: A useful skill
version: 2.1.0
---
Skill content here`;

    const result = parseSkillFrontmatter(content);
    expect(result).toEqual({
      name: 'my-skill',
      description: 'A useful skill',
      version: '2.1.0',
    });
  });

  it('should provide defaults for missing fields', () => {
    const content = `---
name: minimal
---
Content`;

    const result = parseSkillFrontmatter(content);
    expect(result).toEqual({
      name: 'minimal',
      description: '',
      version: '1.0.0',
    });
  });

  it('should handle non-string values gracefully', () => {
    const content = `---
name: 123
description: true
version: 1
---
Content`;

    const result = parseSkillFrontmatter(content);
    expect(result.name).toBe('');
    expect(result.description).toBe('');
    expect(result.version).toBe('1.0.0');
  });
});

describe('parseAgentFrontmatter', () => {
  it('should parse valid agent frontmatter', () => {
    const content = `---
name: my-agent
description: An AI agent
model: opus
tools:
  - read
  - write
---
Agent instructions`;

    const result = parseAgentFrontmatter(content);
    expect(result).toEqual({
      name: 'my-agent',
      description: 'An AI agent',
      model: 'opus',
      tools: ['read', 'write'],
    });
  });

  it('should parse tools as comma-separated string', () => {
    const content = `---
name: agent
description: Test
tools: read, write, execute
---
Content`;

    const result = parseAgentFrontmatter(content);
    expect(result.tools).toEqual(['read', 'write', 'execute']);
  });

  it('should provide defaults for missing fields', () => {
    const content = `---
name: minimal-agent
description: Test
---
Content`;

    const result = parseAgentFrontmatter(content);
    expect(result).toEqual({
      name: 'minimal-agent',
      description: 'Test',
      model: undefined,
      tools: undefined,
    });
  });

  it('should handle tools array with various types', () => {
    const content = `---
name: agent
description: Test
tools:
  - string-tool
  - 123
---
Content`;

    const result = parseAgentFrontmatter(content);
    expect(result.tools).toEqual(['string-tool', '123']);
  });

  it('should handle empty tools array', () => {
    const content = `---
name: agent
description: Test
tools: []
---
Content`;

    const result = parseAgentFrontmatter(content);
    expect(result.tools).toEqual([]);
  });
});
