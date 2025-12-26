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

interface ClaudeSettingsJSON {
  hooks: {
    PreToolUse?: HookEntry[];
    PostToolUse?: HookEntry[];
    UserPromptSubmit?: HookEntry[];
    Notification?: HookEntry[];
    Stop?: HookEntry[];
    SubagentStop?: HookEntry[];
    PreCompact?: HookEntry[];
    SessionStart?: HookEntry[];
    SessionEnd?: HookEntry[];
  };
}

export interface ClaudeSettingsOptions {
  claudeConfigAutoPush: boolean;
  workspacePath?: string;
  workspaceAutoPush?: boolean;
  appAutoDeploy?: boolean;
}

/**
 * Claude settings model for workspace sync hooks
 */
export class ClaudeSettings {
  readonly claudeConfigAutoPush: boolean;
  readonly workspacePath?: string;
  readonly workspaceAutoPush: boolean;
  readonly appAutoDeploy: boolean;

  constructor(options: ClaudeSettingsOptions) {
    this.claudeConfigAutoPush = options.claudeConfigAutoPush;
    this.workspacePath = options.workspacePath;
    this.workspaceAutoPush = options.workspaceAutoPush ?? false;
    this.appAutoDeploy = options.appAutoDeploy ?? false;
  }

  /**
   * Write settings.json to the specified directory
   */
  save(localWorkPath: string): void {
    const claudeDir = path.join(localWorkPath, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');

    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(this.toJSON(), null, 2), 'utf-8');
    console.log(`[Settings] Created settings.json at ${settingsPath}`);
  }

  /**
   * Generate the Claude settings content with workspace sync hooks
   */
  toJSON(): ClaudeSettingsJSON {
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
                  '[ -n "$WORKSPACE_DIR" ] && databricks workspace export-dir "$WORKSPACE_DIR" .',
              },
              // Create Databricks Apps for the session
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
                  '[ "$WORKSPACE_AUTO_PUSH" = "true" ] && databricks sync . "$WORKSPACE_DIR" --exclude "node_modules" > /dev/null 2>&1 &',
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
                  '[ "$CLAUDE_CONFIG_AUTO_PUSH" = "true" ] && databricks sync "$CLAUDE_CONFIG_DIR" "$WORKSPACE_CLAUDE_CONFIG_DIR" > /dev/null 2>&1 &',
              },
            ],
          },
          {
            hooks: [
              // Push workspace directory (local -> workspace)
              {
                type: 'command',
                command:
                  '[ "$WORKSPACE_AUTO_PUSH" = "true" ] && databricks sync . "$WORKSPACE_DIR" --exclude "node_modules"',
              },
              // Auto deploy Databricks Apps for the session
              {
                type: 'command',
                command:
                  '[ "$APP_AUTO_DEPLOY" = "true" ] && databricks apps deploy "$SESSION_APP_NAME" --source-code-path "$WORKSPACE_DIR" --no-wait',
              },
            ],
          },
        ],
      },
    };
  }
}
