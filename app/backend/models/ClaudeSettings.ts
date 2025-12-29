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

type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Notification'
  | 'Stop'
  | 'SubagentStop'
  | 'PreCompact'
  | 'SessionStart'
  | 'SessionEnd';

interface ClaudeSettingsJSON {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  env?: Record<string, string | undefined>;
  hooks: {
    [key in HookEvent]?: HookEntry[];
  };
}

export interface ClaudeSettingsOptions {
  workspacePath?: string;
  workspaceAutoPush?: boolean;
  claudeConfigAutoPush?: boolean;
}

/**
 * Claude settings model for workspace sync hooks
 */
export class ClaudeSettings {
  readonly workspacePath?: string;
  readonly workspaceAutoPush: boolean;
  readonly claudeConfigAutoPush: boolean;

  constructor(options: ClaudeSettingsOptions) {
    this.workspacePath = options.workspacePath;
    this.workspaceAutoPush = options.workspaceAutoPush ?? false;
    this.claudeConfigAutoPush = options.claudeConfigAutoPush ?? true;
  }

  /**
   * Write settings.json to the specified directory
   */
  save(localWorkPath: string): void {
    const claudeDir = path.join(localWorkPath, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');

    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(this.toJSON(), null, 2),
      'utf-8'
    );
    console.log(`[Settings] Created settings.json at ${settingsPath}`);
  }

  /**
   * Generate the Claude settings content with workspace sync hooks
   */
  toJSON(): ClaudeSettingsJSON {
    const settingsJson: ClaudeSettingsJSON = {
      hooks: {
        SessionStart: [
          {
            matcher: 'startup',
            hooks: [
              // Pull workspace directory (workspace -> local)
              {
                type: 'command',
                command:
                  '[ -n "$DATABRICKS_WORKSPACE_PATH" ] && databricks workspace export-dir "$DATABRICKS_WORKSPACE_PATH" .',
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
                  '[ "$DATABRICKS_WORKSPACE_AUTO_PUSH" = "true" ] && databricks sync . "$DATABRICKS_WORKSPACE_PATH" --exclude "node_modules" > /dev/null 2>&1 &',
              },
            ],
          },
        ],
        Stop: [
          {
            hooks: [
              // Push claudeConfig (local -> workspace)
              {
                type: 'command',
                command:
                  '[ "$CLAUDE_CONFIG_AUTO_PUSH" = "true" ] && databricks sync "$CLAUDE_CONFIG_DIR" "$DATABRICKS_WORKSPACE_CLAUDE_CONFIG_DIR" > /dev/null 2>&1 &',
              },
            ],
          },
          {
            hooks: [
              // Push workspace directory (local -> workspace)
              {
                type: 'command',
                command:
                  '[ "$DATABRICKS_WORKSPACE_AUTO_PUSH" = "true" ] && databricks sync . "$DATABRICKS_WORKSPACE_PATH" --exclude "node_modules"',
              },
            ],
          },
        ],
      },
    };
    return settingsJson;
  }
}
