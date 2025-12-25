import * as fs from 'fs';
import * as path from 'path';

interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number;
}

interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}

interface ClaudeSettings {
  hooks: {
    SessionStart?: HookEntry[];
    PostToolUse?: HookEntry[];
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
        {
          matcher: 'startup',
          hooks: [
            // Pull workspace directory (workspace -> local)
            {
              type: 'command',
              command:
                '[ -n "$WORKSPACE_DIR" ] && databricks workspace export-dir "$WORKSPACE_DIR" "$CLAUDE_WORKING_DIR"',
            },
            // Create Databricks Apps for the session
            {
              type: 'command',
              command:
                '[ "$APP_AUTO_DEPLOY" = "true" ] && databricks apps create "$SESSION_APP_NAME" --no-wait',
            },
            //{
            //  type: 'command',
            //  command:
            //    '[ "$APP_AUTO_DEPLOY" = "true" ] && databricks apps deploy "$SESSION_APP_NAME" --source-code-path "$WORKSPACE_DIR" --no-wait',
            //},
          ],
        },
        {
          matcher: 'resume',
          hooks: [
            // Create Databricks Apps for the session if not exists
            {
              type: 'command',
              command:
                '[ "$APP_AUTO_DEPLOY" = "true" ] && databricks apps create "$SESSION_APP_NAME" --no-wait',
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Write|Edit|MultiEdit',
          hooks: [
            // Push workspace directory (local -> workspace)
            {
              type: 'command',
              command:
                '[ "$WORKSPACE_AUTO_PUSH" = "true" ] && databricks sync "$CLAUDE_WORKING_DIR" "$WORKSPACE_DIR" --exclude ".claude/settings.local.json" --exclude "node_modules" --include ".git"',
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            // Push workspace directory (local -> workspace)
            {
              type: 'command',
              command:
                '[ "$WORKSPACE_AUTO_PUSH" = "true" ] && databricks sync "$CLAUDE_WORKING_DIR" "$WORKSPACE_DIR" --exclude ".claude/settings.local.json" --exclude "node_modules" --include ".git"',
            },
            // Auto deploy Databricks Apps for the session
            {
              type: 'command',
              command:
                '[ "$APP_AUTO_DEPLOY" = "true" ] && databricks apps deploy "$SESSION_APP_NAME" --source-code-path "$WORKSPACE_DIR" --no-wait',
            },
          ],
        },
        {
          hooks: [
            // Push claudeConfig (local -> workspace)
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
