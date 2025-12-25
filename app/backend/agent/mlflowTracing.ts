/**
 * MLflow Tracing integration for Claude Agent SDK
 *
 * This module provides tracing capabilities for the Claude Agent using MLflow TypeScript SDK.
 * Traces are automatically sent to the configured MLflow tracking server when enabled.
 */
import * as mlflow from 'mlflow-tracing';
import type { SDKMessage, SDKAssistantMessage } from '@anthropic-ai/claude-agent-sdk';
import { mlflow as mlflowConfig, databricks } from '../config/index.js';

let initialized = false;

/**
 * Initialize MLflow tracing with configuration from environment variables
 */
export function initMlflowTracing(): void {
  if (!mlflowConfig.enabled) {
    console.log('[MLflow] Tracing disabled');
    return;
  }

  if (initialized) {
    return;
  }

  try {
    // MLflow init requires trackingUri and experimentId
    // For Databricks, use "databricks" as trackingUri
    mlflow.init({
      trackingUri: mlflowConfig.trackingUri ?? 'databricks',
      experimentId: mlflowConfig.experimentName, // experimentName is used as experimentId
      host: databricks.hostUrl,
    });
    initialized = true;
    console.log(
      `[MLflow] Tracing initialized with experiment: ${mlflowConfig.experimentName}`
    );
  } catch (error) {
    console.error('[MLflow] Failed to initialize tracing:', error);
  }
}

/**
 * Check if MLflow tracing is enabled and initialized
 */
export function isTracingEnabled(): boolean {
  return mlflowConfig.enabled && initialized;
}

/**
 * Extract tool use information from an assistant message
 */
function extractToolCalls(message: SDKAssistantMessage): Array<{ name: string; input: unknown }> {
  const toolCalls: Array<{ name: string; input: unknown }> = [];
  const content = message.message?.content;

  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === 'object' && 'type' in block && block.type === 'tool_use') {
        const toolBlock = block as { type: 'tool_use'; name: string; input: unknown };
        toolCalls.push({ name: toolBlock.name, input: toolBlock.input });
      }
    }
  }

  return toolCalls;
}

/**
 * Create a traced async generator wrapper for processAgentRequest
 * Traces the entire agent session and key events
 */
export async function* traceAgentMessages(
  sessionId: string,
  userId: string,
  model: string,
  messages: AsyncGenerator<SDKMessage>
): AsyncGenerator<SDKMessage> {
  if (!isTracingEnabled()) {
    yield* messages;
    return;
  }

  // Start agent trace using the options object
  const agentSpan = mlflow.startSpan({
    name: 'claude-agent-session',
    spanType: mlflow.SpanType.AGENT,
    inputs: { sessionId, userId, model },
  });

  let messageCount = 0;
  let toolCallCount = 0;
  let assistantMessageCount = 0;

  try {
    for await (const message of messages) {
      messageCount++;

      // Track assistant messages and tool calls
      if (message.type === 'assistant') {
        assistantMessageCount++;
        const assistantMessage = message as SDKAssistantMessage;

        // Extract and trace tool calls from the assistant message
        const toolCalls = extractToolCalls(assistantMessage);
        for (const tool of toolCalls) {
          toolCallCount++;
          const toolSpan = mlflow.startSpan({
            name: `tool:${tool.name}`,
            spanType: mlflow.SpanType.TOOL,
            inputs: { toolName: tool.name, toolInput: tool.input },
            parent: agentSpan,
          });
          toolSpan.end({ outputs: { traced: true } });
        }

        // Create a span for the assistant message itself
        const llmSpan = mlflow.startSpan({
          name: 'assistant-response',
          spanType: mlflow.SpanType.LLM,
          inputs: {
            messageIndex: assistantMessageCount,
            hasToolCalls: toolCalls.length > 0,
          },
          parent: agentSpan,
        });
        llmSpan.end({
          outputs: {
            toolCallCount: toolCalls.length,
            stopReason: assistantMessage.message?.stop_reason,
          },
        });
      } else if (message.type === 'result') {
        // Final result - add summary to parent span
        const resultSpan = mlflow.startSpan({
          name: 'session-result',
          spanType: mlflow.SpanType.CHAIN,
          inputs: { subtype: message.subtype },
          parent: agentSpan,
        });

        if (message.subtype === 'success') {
          resultSpan.end({
            outputs: {
              numTurns: message.num_turns,
              durationMs: message.duration_ms,
              totalCostUsd: message.total_cost_usd,
              isError: message.is_error,
            },
          });
        } else {
          resultSpan.end({
            outputs: {
              subtype: message.subtype,
              numTurns: message.num_turns,
              isError: message.is_error,
            },
          });
        }
      } else if (message.type === 'system' && message.subtype === 'init') {
        // Update trace with session metadata from init message
        mlflow.updateCurrentTrace({
          tags: {
            sessionId: message.session_id,
            userId,
            model: message.model,
            permissionMode: message.permissionMode,
          },
          metadata: {
            'mlflow.trace.session': message.session_id,
            'mlflow.trace.user': userId,
            claudeCodeVersion: message.claude_code_version,
            cwd: message.cwd,
          },
        });
      }

      yield message;
    }

    // End agent span with summary
    agentSpan.end({
      outputs: {
        messageCount,
        assistantMessageCount,
        toolCallCount,
        status: 'completed',
      },
    });
  } catch (error) {
    // End agent span with error
    agentSpan.end({
      outputs: {
        messageCount,
        assistantMessageCount,
        toolCallCount,
        status: 'error',
        error: String(error),
      },
    });
    throw error;
  }
}

/**
 * Flush any pending traces to the MLflow server
 * Call this during graceful shutdown
 */
export async function flushTraces(): Promise<void> {
  if (!isTracingEnabled()) {
    return;
  }

  try {
    await mlflow.flushTraces();
    console.log('[MLflow] Traces flushed');
  } catch (error) {
    console.error('[MLflow] Failed to flush traces:', error);
  }
}
