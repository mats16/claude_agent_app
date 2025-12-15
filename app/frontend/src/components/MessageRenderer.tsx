interface MessageRendererProps {
  content: string;
  role: 'user' | 'agent';
}

interface ParsedBlock {
  type: 'text' | 'tool';
  content: string;
  toolName?: string;
  toolInput?: string;
  toolDisplayInput?: string;
  toolOutput?: string;
}

function formatToolInput(toolName: string, inputJson: string): string {
  if (!inputJson) return '';

  try {
    const input = JSON.parse(inputJson);

    // Format based on tool type
    switch (toolName) {
      case 'Bash':
        return input.command || inputJson;
      case 'Read':
        return input.file_path || inputJson;
      case 'Write':
        return input.file_path || inputJson;
      case 'Edit':
        return input.file_path || inputJson;
      case 'Glob':
        return input.pattern || inputJson;
      case 'Grep':
        return input.pattern || inputJson;
      case 'WebSearch':
        return input.query || inputJson;
      case 'WebFetch':
        return input.url || inputJson;
      default:
        // For other tools, show a shortened version of the input
        const str = JSON.stringify(input);
        return str.length > 50 ? str.slice(0, 50) + '...' : str;
    }
  } catch {
    return inputJson.length > 50 ? inputJson.slice(0, 50) + '...' : inputJson;
  }
}

function parseAgentMessage(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];

  // Pattern to match tool calls with optional results
  // [Tool: ToolName] {json}
  // [ToolResult]...[/ToolResult]
  const combinedPattern =
    /\[Tool:\s*(\w+)\]\s*(\{[^]*?\})?(?:\s*\[ToolResult\]\n?([\s\S]*?)\[\/ToolResult\])?/g;

  let lastIndex = 0;
  let match;

  while ((match = combinedPattern.exec(content)) !== null) {
    // Add text before this tool call
    const textBefore = content.slice(lastIndex, match.index).trim();
    if (textBefore) {
      // Remove any standalone [ToolResult] blocks from text
      const cleanedText = textBefore
        .replace(/\[ToolResult\][\s\S]*?\[\/ToolResult\]/g, '')
        .trim();
      if (cleanedText) {
        blocks.push({
          type: 'text',
          content: cleanedText,
        });
      }
    }

    const toolName = match[1];
    const toolInputJson = match[2] || '';
    const toolOutput = match[3]?.trim() || '';
    const displayInput = formatToolInput(toolName, toolInputJson);

    // Add tool block
    blocks.push({
      type: 'tool',
      content: match[0],
      toolName: toolName,
      toolInput: toolInputJson,
      toolDisplayInput: displayInput,
      toolOutput: toolOutput,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last tool call
  let remaining = content.slice(lastIndex).trim();
  // Remove any standalone [ToolResult] blocks
  remaining = remaining.replace(/\[ToolResult\][\s\S]*?\[\/ToolResult\]/g, '').trim();
  if (remaining) {
    blocks.push({
      type: 'text',
      content: remaining,
    });
  }

  return blocks;
}

function renderTextBlock(text: string) {
  // Split into paragraphs/lines
  const lines = text.split('\n').filter((line) => line.trim());

  if (lines.length === 0) {
    return null;
  }

  if (lines.length === 1) {
    return (
      <div className="message-line">
        <span className="message-line-text">{lines[0]}</span>
      </div>
    );
  }

  return (
    <>
      {lines.map((line, idx) => (
        <div key={idx} className="message-line">
          <span className="message-line-text">{line}</span>
        </div>
      ))}
    </>
  );
}

export default function MessageRenderer({ content, role }: MessageRendererProps) {
  if (role === 'user') {
    return <pre className="message-text">{content}</pre>;
  }

  const blocks = parseAgentMessage(content);

  // If no tool blocks, render as plain text with formatting
  const hasToolBlocks = blocks.some((b) => b.type === 'tool');

  if (!hasToolBlocks) {
    const lines = content.split('\n').filter((line) => line.trim());
    if (lines.length <= 1) {
      return <pre className="message-text">{content}</pre>;
    }
    return <div className="message-formatted">{renderTextBlock(content)}</div>;
  }

  return (
    <div className="message-formatted">
      {blocks.map((block, idx) => {
        if (block.type === 'tool') {
          return (
            <div key={idx} className="tool-block">
              <div className="tool-header">
                <span className="tool-name">{block.toolName}</span>
                {block.toolDisplayInput && (
                  <code className="tool-input">{block.toolDisplayInput}</code>
                )}
              </div>
              {block.toolOutput && (
                <div className="tool-output">
                  <span className="tool-output-connector">└</span>
                  <pre className="tool-output-content">{block.toolOutput}</pre>
                </div>
              )}
            </div>
          );
        } else {
          return (
            <div key={idx} className="text-block">
              {renderTextBlock(block.content)}
            </div>
          );
        }
      })}
    </div>
  );
}
