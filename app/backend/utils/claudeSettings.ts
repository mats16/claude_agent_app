import * as fs from 'fs';
import * as path from 'path';

interface HookCommand {
  type: 'command';
  command: string;
}

interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}

interface ClaudeSettings {
  hooks: {
    SessionStart?: HookEntry[];
    Stop?: HookEntry[];
  };
}

/**
 * Generate the Claude settings content with workspace sync hooks
 */
export function generateClaudeSettings(): ClaudeSettings {
  return {
    hooks: {
      SessionStart: [
        // Pull workspace directory (workspace -> local)
        {
          matcher: 'startup',
          hooks: [
            {
              type: 'command',
              command:
                '[ -n "$WORKSPACE_DIR" ] && databricks workspace export-dir "$WORKSPACE_DIR" "$CLAUDE_WORKING_DIR"',
            },
            {
              type: 'command',
              command:
                '[ -d .git ] || (git init -b main && git add -A && git commit -m "Initial commit" --allow-empty)',
            },
            {
              type: 'command',
              command: 'git switch -c "$GIT_BRANCH"',
            },
          ],
        },
      ],
      Stop: [
        // Push workspace directory (local -> workspace)
        {
          hooks: [
            {
              type: 'command',
              command:
                '[ "$WORKSPACE_AUTO_PUSH" = "true" ] && databricks sync "$CLAUDE_WORKING_DIR" "$WORKSPACE_DIR" --exclude ".claude/settings.local.json" --exclude "node_modules" --include ".git"',
            },
            {
              type: 'command',
              command:
                '[ -n "$SESSION_APP_NAME" ] && databricks apps deploy "$SESSION_APP_NAME" --source-code-path "$WORKSPACE_DIR"',
            },
          ],
        },
        // Push claudeConfig (local -> workspace)
        {
          hooks: [
            {
              type: 'command',
              command:
                '[ "$CLAUDE_CONFIG_AUTO_PUSH" = "true" ] && databricks sync "$CLAUDE_CONFIG_DIR" "$WORKSPACE_CLAUDE_CONFIG_DIR" --exclude "settings.local.json"',
            },
          ],
        },
      ],
    },
  };
}

/**
 * Write settings.local.json to the specified directory
 */
export function writeClaudeSettings(localWorkPath: string): void {
  const claudeDir = path.join(localWorkPath, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.local.json');

  fs.mkdirSync(claudeDir, { recursive: true });

  const settings = generateClaudeSettings();
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  console.log(`[Settings] Created settings.local.json at ${settingsPath}`);
}
