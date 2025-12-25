/**
 * Message parsing utilities
 * Pure functions extracted from useAgent.ts for testability and reusability
 */

import type { ImageContent } from '@app/shared';
import type {
  SDKMessage,
  SDKContentBlock,
  SDKUserMessage,
  SDKAssistantMessage,
  ChatMessage,
  StructuredPatchHunk,
  TodoWriteResult,
  TodoItem,
} from '../types/extend-claude-agent-sdk';

/**
 * Format tool input to show only relevant information
 * Returns concise display string based on tool type
 */
export function formatToolInput(input: unknown, toolName?: string): string {
  if (!input || typeof input !== 'object') return '';

  const inputObj = input as Record<string, unknown>;

  // Format based on tool type - return only the most relevant field
  switch (toolName) {
    case 'Bash':
      return (inputObj.command as string) || '';
    case 'Read':
    case 'Write':
    case 'Edit':
      return (inputObj.file_path as string) || '';
    case 'NotebookEdit':
      return (
        (inputObj.notebook_path as string) ||
        (inputObj.file_path as string) ||
        ''
      );
    case 'Glob':
    case 'Grep':
      return (inputObj.pattern as string) || '';
    case 'WebSearch':
      return (inputObj.query as string) || '';
    case 'WebFetch':
      return (inputObj.url as string) || '';
    case 'TodoWrite': {
      // Show count of todos instead of full JSON (avoid [ in output that breaks regex)
      const todos = inputObj.todos as unknown[];
      return todos ? `${todos.length} items` : '';
    }
    default: {
      // For other tools, exclude large content fields
      const sanitized = { ...inputObj };
      delete sanitized.content;
      delete sanitized.new_source;
      return JSON.stringify(sanitized);
    }
  }
}

/**
 * Extract text and images from user message content
 */
export function extractUserContent(content: string | SDKContentBlock[]): {
  text: string;
  images: ImageContent[];
} {
  if (typeof content === 'string') {
    return { text: content, images: [] };
  }

  const images: ImageContent[] = [];
  const textParts: string[] = [];

  for (const block of content) {
    if (block.type === 'text' && block.text) {
      textParts.push(block.text);
    } else if (block.type === 'image' && block.source) {
      images.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: block.source.media_type as
            | 'image/webp'
            | 'image/jpeg'
            | 'image/png'
            | 'image/gif',
          data: block.source.data,
        },
      });
    }
  }

  return { text: textParts.join(''), images };
}

/**
 * Type guard to check if tool_use_result is TodoWriteResult
 */
export function isTodoWriteResult(result: unknown): result is TodoWriteResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'newTodos' in result &&
    Array.isArray((result as TodoWriteResult).newTodos)
  );
}

/**
 * Type guard to check if tool_use_result has structuredPatch (EditToolUseResult)
 */
function hasStructuredPatch(
  result: unknown
): result is { structuredPatch?: StructuredPatchHunk[] } {
  return (
    typeof result === 'object' && result !== null && 'structuredPatch' in result
  );
}

/**
 * Format TodoWrite result for display
 */
export function formatTodoList(todos: TodoItem[]): string {
  return `[TodoList]\n${JSON.stringify(todos)}\n[/TodoList]`;
}

/**
 * Format structured patch for Edit tool display
 */
function formatStructuredPatch(structuredPatch: StructuredPatchHunk[]): string {
  // Convert structured patch to a unified diff-like format
  const patchLines: string[] = [];
  for (const hunk of structuredPatch) {
    // Add hunk header
    patchLines.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
    );
    // Add diff lines
    patchLines.push(...hunk.lines);
  }
  return patchLines.join('\n');
}

/**
 * Insert tool result after corresponding tool use marker in content
 */
function insertToolResult(
  content: string,
  toolUseId: string,
  resultText: string,
  toolName?: string,
  structuredPatch?: StructuredPatchHunk[]
): string {
  // Skip displaying WebSearch results (keep them hidden)
  if (toolName === 'WebSearch') {
    return content;
  }

  // For Edit tool, use structured patch if available
  let resultContent = resultText;
  if (toolName === 'Edit' && structuredPatch && structuredPatch.length > 0) {
    resultContent = `[EditPatch]\n${formatStructuredPatch(structuredPatch)}\n[/EditPatch]`;
  }

  const resultBlock = `[ToolResult]\n${resultContent}\n[/ToolResult]`;

  // Find the tool use marker with this ID and insert result after it
  const toolIdPattern = new RegExp(
    `(\\[Tool: \\w+ id=${toolUseId}\\][^\\n]*\\n)`,
    'g'
  );
  const match = toolIdPattern.exec(content);
  if (match) {
    const insertPos = match.index + match[0].length;
    return (
      content.slice(0, insertPos) +
      resultBlock +
      '\n' +
      content.slice(insertPos)
    );
  }
  // Fallback: append at the end
  return content + '\n' + resultBlock;
}

/**
 * Check if content array contains a skill description message
 */
function isSkillDescriptionMessage(
  content: Array<{ type: string; text?: string }>
): boolean {
  return content.some(
    (block) =>
      block.type === 'text' &&
      block.text &&
      block.text.includes('Base directory for this skill:')
  );
}

/**
 * Convert SDKMessage array to ChatMessage array for UI display
 * This is a pure function that can be unit tested
 */
export function convertSDKMessagesToChat(
  sdkMessages: SDKMessage[]
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let currentAgentContent = '';
  let currentAgentId = '';
  const toolNameMap = new Map<string, string>(); // tool_use_id -> tool_name

  for (const msg of sdkMessages) {
    // Skip synthetic messages (system-generated, should not be displayed)
    // isSynthetic is only defined on SDKUserMessage, so check if property exists
    if ('isSynthetic' in msg && msg.isSynthetic) {
      continue;
    }

    if (msg.type === 'user') {
      const userMsg = msg as SDKUserMessage;
      const content = userMsg.message.content;

      // Check if this is a skill description message (auto-generated by Skill tool)
      if (typeof content !== 'string' && Array.isArray(content)) {
        if (isSkillDescriptionMessage(content)) {
          continue;
        }
      }

      // Check if this is a tool result message
      if (typeof content !== 'string' && Array.isArray(content)) {
        let hasToolResult = false;
        for (const block of content) {
          if (
            block.type === 'tool_result' &&
            block.tool_use_id &&
            block.content
          ) {
            hasToolResult = true;
            let resultText = '';
            if (typeof block.content === 'string') {
              resultText = block.content;
            } else if (Array.isArray(block.content)) {
              resultText = block.content
                .filter(
                  (b: { type: string; text?: string }) =>
                    b.type === 'text' && b.text
                )
                .map((b: { type: string; text?: string }) => b.text)
                .join('');
            }
            if (resultText) {
              // Skip StructuredOutput tool results
              if (resultText === 'Structured output provided successfully') {
                continue;
              }
              const toolName = toolNameMap.get(block.tool_use_id);

              // Handle TodoWrite tool - insert todo list marker
              if (
                toolName === 'TodoWrite' &&
                isTodoWriteResult(userMsg.tool_use_result)
              ) {
                currentAgentContent = insertToolResult(
                  currentAgentContent,
                  block.tool_use_id,
                  formatTodoList(userMsg.tool_use_result.newTodos),
                  toolName
                );
                continue;
              }

              // Get structured patch for Edit tool if available
              const structuredPatch =
                toolName === 'Edit' &&
                hasStructuredPatch(userMsg.tool_use_result)
                  ? userMsg.tool_use_result.structuredPatch
                  : undefined;
              currentAgentContent = insertToolResult(
                currentAgentContent,
                block.tool_use_id,
                resultText,
                toolName,
                structuredPatch
              );
            }
          }
        }
        if (hasToolResult) continue;
      }

      // Flush any pending agent message
      if (currentAgentContent && currentAgentId) {
        messages.push({
          id: currentAgentId,
          role: 'agent',
          content: currentAgentContent.trim(),
          timestamp: new Date(),
        });
        currentAgentContent = '';
        currentAgentId = '';
      }

      // Regular user message
      const { text: textContent, images } = extractUserContent(
        userMsg.message.content
      );
      if (textContent || images.length > 0) {
        messages.push({
          id: msg.uuid || `user-${Date.now()}`,
          role: 'user',
          content: textContent,
          images: images.length > 0 ? images : undefined,
          timestamp: new Date(),
        });
      }
    } else if (msg.type === 'assistant') {
      const assistantMsg = msg as SDKAssistantMessage;
      if (!currentAgentId) {
        currentAgentId = msg.uuid || `agent-${Date.now()}`;
      }

      // Process content blocks
      for (const block of assistantMsg.message.content) {
        if (block.type === 'text' && block.text) {
          currentAgentContent += block.text;
        } else if (block.type === 'tool_use' && block.name) {
          // Skip StructuredOutput tool (used for session title generation)
          if (block.name === 'StructuredOutput') {
            continue;
          }
          const toolInput = block.input
            ? formatToolInput(block.input, block.name)
            : '';
          const toolId = block.id || `tool-${Date.now()}`;
          // Store tool name for later use when processing tool results
          toolNameMap.set(toolId, block.name);
          currentAgentContent += `\n\n[Tool: ${block.name} id=${toolId}] ${toolInput}\n`;
        }
      }
    } else if (msg.type === 'result') {
      // Flush agent message on result
      if (currentAgentContent && currentAgentId) {
        messages.push({
          id: currentAgentId,
          role: 'agent',
          content: currentAgentContent.trim(),
          timestamp: new Date(),
        });
        currentAgentContent = '';
        currentAgentId = '';
      }
    }
    // Skip system messages (init, etc.)
  }

  // Flush any remaining agent message
  if (currentAgentContent && currentAgentId) {
    messages.push({
      id: currentAgentId,
      role: 'agent',
      content: currentAgentContent.trim(),
      timestamp: new Date(),
    });
  }

  return messages;
}
