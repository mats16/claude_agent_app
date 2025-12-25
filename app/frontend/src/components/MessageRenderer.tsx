import { useState, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { Modal, Typography } from 'antd';
import {
  DownOutlined,
  UpOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { ImageContent } from '@app/shared';
import type { TodoItem } from '../types/extend-claude-agent-sdk';
import FilePreviewModal from './FilePreviewModal';
import SqlResultTable, { parseSqlResult } from './SqlResultTable';
import { colors } from '../styles/theme';

interface MessageRendererProps {
  content: string;
  role: 'user' | 'agent';
  images?: ImageContent[];
  sessionId?: string;
}

interface ParsedBlock {
  type: 'text' | 'tool';
  content: string;
  toolName?: string;
  toolInput?: string;
  toolDisplayInput?: string;
  toolOutput?: string;
  // Structured patch lines for Edit tool (from [EditPatch]...[/EditPatch])
  editPatchLines?: string[];
  // Todo items for TodoWrite tool (from [TodoList]...[/TodoList])
  todoItems?: TodoItem[];
}

function formatToolInput(toolName: string, input: string): string {
  if (!input) return '';

  const trimmed = input.trim();

  // If input is not JSON (doesn't start with {), return it directly
  // This handles plain strings like file paths, commands, patterns, etc.
  if (!trimmed.startsWith('{')) {
    return trimmed.length > 120 ? trimmed.slice(0, 120) + '...' : trimmed;
  }

  // Parse JSON input
  try {
    const parsed = JSON.parse(trimmed);

    // Format based on tool type
    switch (toolName) {
      case 'Bash':
        return parsed.command || '';
      case 'Read':
      case 'Write':
      case 'Edit':
        return parsed.file_path || '';
      case 'NotebookEdit':
        return parsed.notebook_path || parsed.file_path || '';
      case 'Glob':
      case 'Grep':
        return parsed.pattern || '';
      case 'WebSearch':
        return parsed.query || '';
      case 'WebFetch':
        return parsed.url || '';
      case 'TodoWrite': {
        // Show count of todos instead of full JSON (avoid [ in output that breaks regex)
        const todos = parsed.todos as unknown[];
        return todos ? `${todos.length} items` : '';
      }
      case 'mcp__databricks__run_sql':
        // Return empty string - handled specially in component render
        return '';
      default: {
        // For other tools, exclude large content fields and show a shortened version
        const sanitized = { ...parsed };
        delete sanitized.content;
        delete sanitized.new_source;
        const str = JSON.stringify(sanitized);
        return str.length > 80 ? str.slice(0, 80) + '...' : str;
      }
    }
  } catch {
    return trimmed.length > 80 ? trimmed.slice(0, 80) + '...' : trimmed;
  }
}

interface ToolOutputResult {
  content: string;
  isError?: boolean;
}

function formatToolOutput(
  toolName: string,
  output: string,
  t: (key: string, params?: Record<string, unknown>) => string
): ToolOutputResult | null {
  if (!output) return null;

  // Hide output for certain tools (Edit uses custom diff display, TodoWrite uses custom list display)
  if (
    toolName === 'Glob' ||
    toolName === 'Skill' ||
    toolName === 'Write' ||
    toolName === 'NotebookEdit' ||
    toolName === 'WebSearch' ||
    toolName === 'Edit' ||
    toolName === 'TodoWrite'
  ) {
    return null;
  }

  // For Read tool, show only line count
  if (toolName === 'Read') {
    const lines = output.trim().split('\n');
    return { content: t('toolOutput.linesRead', { count: lines.length }) };
  }

  // For Bash tool, check if output contains JSON with error field
  if (toolName === 'Bash') {
    const trimmed = output.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.error) {
          return { content: parsed.error, isError: true };
        }
      } catch {
        // Not valid JSON, return as-is
      }
    }
  }

  // For other tools, show the output as-is
  return { content: output };
}

function parseAgentMessage(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];

  // Pattern to match tool calls with optional ID and results
  // [Tool: ToolName] {json} or [Tool: ToolName id=xxx] /path/to/file
  // followed by optional [ToolResult]...[/ToolResult]
  // Input can be JSON ({...}) or plain string (file path, command, etc.)
  const combinedPattern =
    /\[Tool:\s*(\w+)(?:\s+id=[^\]]+)?\]\s*([^\n\[]+)?(?:\s*\[ToolResult\]\n?([\s\S]*?)\[\/ToolResult\])?/g;

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

    // Extract editPatchLines for Edit tool from [EditPatch]...[/EditPatch] block
    let editPatchLines: string[] | undefined = undefined;
    if (toolName === 'Edit' && toolOutput) {
      const editPatchMatch = toolOutput.match(
        /\[EditPatch\]\n?([\s\S]*?)\n?\[\/EditPatch\]/
      );
      if (editPatchMatch && editPatchMatch[1]) {
        editPatchLines = editPatchMatch[1].split('\n');
      }
    }

    // Extract todoItems for TodoWrite tool from [TodoList]...[/TodoList] block
    let todoItems: TodoItem[] | undefined = undefined;
    if (toolName === 'TodoWrite' && toolOutput) {
      const todoListMatch = toolOutput.match(
        /\[TodoList\]\n?([\s\S]*?)\n?\[\/TodoList\]/
      );
      if (todoListMatch && todoListMatch[1]) {
        try {
          todoItems = JSON.parse(todoListMatch[1]) as TodoItem[];
        } catch {
          // Invalid JSON, ignore
        }
      }
    }

    // Add tool block
    blocks.push({
      type: 'tool',
      content: match[0],
      toolName: toolName,
      toolInput: toolInputJson,
      toolDisplayInput: displayInput,
      toolOutput: toolOutput,
      editPatchLines: editPatchLines,
      todoItems: todoItems,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last tool call
  let remaining = content.slice(lastIndex).trim();
  // Remove any standalone [ToolResult] blocks
  remaining = remaining
    .replace(/\[ToolResult\][\s\S]*?\[\/ToolResult\]/g, '')
    .trim();
  if (remaining) {
    blocks.push({
      type: 'text',
      content: remaining,
    });
  }

  return blocks;
}

const CollapsibleOutput = memo(function CollapsibleOutput({
  content,
  toolName,
  isError,
}: {
  content: string;
  toolName?: string;
  isError?: boolean;
}) {
  const lines = content.split('\n');
  const MAX_COLLAPSED_LINES = 3;

  // Check if this is SQL result data (marker-based detection)
  const sqlResult = parseSqlResult(content);

  // MCP tools always collapse, other tools collapse if they have 4+ lines
  const isMcpTool = toolName?.startsWith('mcp__');
  const needsCollapse =
    sqlResult || isMcpTool || lines.length > MAX_COLLAPSED_LINES;

  // SQL results and MCP tools start collapsed, others start expanded if short
  const [isExpanded, setIsExpanded] = useState(!needsCollapse);

  const buttonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    marginTop: '4px',
    border: `1px solid ${colors.borderAntd}`,
    borderRadius: '4px',
    background: colors.backgroundTertiary,
    cursor: 'pointer',
    fontSize: '12px',
    color: colors.textSecondary,
  };

  // SQL result rendering with Ant Design Table
  if (sqlResult) {
    const rowInfo = sqlResult.truncated
      ? `${sqlResult.rows.length} of ${sqlResult.totalRows} rows`
      : `${sqlResult.rows.length} rows`;

    if (!isExpanded) {
      return (
        <div>
          <button onClick={() => setIsExpanded(true)} style={buttonStyle}>
            <DownOutlined style={{ fontSize: '10px' }} />
            <span>{rowInfo}</span>
          </button>
        </div>
      );
    }

    return (
      <div style={{ minWidth: 0, width: '100%' }}>
        <SqlResultTable data={sqlResult} />
        <button onClick={() => setIsExpanded(false)} style={buttonStyle}>
          <UpOutlined style={{ fontSize: '10px' }} />
          <span>Show less</span>
        </button>
      </div>
    );
  }

  // Error style for red text
  const errorStyle = isError ? { color: colors.danger } : undefined;

  // Non-SQL tool output rendering
  if (!needsCollapse) {
    return (
      <pre className="tool-output-content" style={errorStyle}>
        {content}
      </pre>
    );
  }

  // Calculate collapsed content (line-based for all tools)
  // MCP tools show 0 lines when collapsed, others show up to MAX_COLLAPSED_LINES
  const collapsedLineCount = isMcpTool ? 0 : MAX_COLLAPSED_LINES;
  const collapsedContent = lines.slice(0, collapsedLineCount).join('\n');
  const hiddenLines = lines.length - collapsedLineCount;
  const hiddenInfo = `${hiddenLines} lines`;

  const displayContent = isExpanded ? content : collapsedContent;

  if (isExpanded) {
    // When expanded, make the entire content clickable to collapse
    return (
      <div
        onClick={() => setIsExpanded(false)}
        style={{ cursor: 'pointer' }}
        title="Click to collapse"
      >
        <pre className="tool-output-content" style={errorStyle}>
          {displayContent}
        </pre>
        <button style={buttonStyle}>
          <UpOutlined style={{ fontSize: '10px' }} />
          <span>Show less</span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <pre className="tool-output-content" style={errorStyle}>
        {displayContent}
      </pre>
      <button onClick={() => setIsExpanded(true)} style={buttonStyle}>
        <DownOutlined style={{ fontSize: '10px' }} />
        <span>{hiddenInfo}</span>
      </button>
    </div>
  );
});

// Parse patch lines and compute line numbers for each line
interface DiffLine {
  oldLineNum: number | null;
  newLineNum: number | null;
  content: string;
  type: 'added' | 'removed' | 'context' | 'header';
}

function parseDiffLines(patchLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of patchLines) {
    // Parse hunk header to get starting line numbers
    // Format: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(
      /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/
    );
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      result.push({
        oldLineNum: null,
        newLineNum: null,
        content: line,
        type: 'header',
      });
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      result.push({
        oldLineNum: null,
        newLineNum: newLine,
        content: line.slice(1), // Remove leading +
        type: 'added',
      });
      newLine++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      result.push({
        oldLineNum: oldLine,
        newLineNum: null,
        content: line.slice(1), // Remove leading -
        type: 'removed',
      });
      oldLine++;
    } else if (!line.startsWith('\\')) {
      // Context line (or line starting with space)
      const content = line.startsWith(' ') ? line.slice(1) : line;
      result.push({
        oldLineNum: oldLine,
        newLineNum: newLine,
        content: content,
        type: 'context',
      });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

// EditPatch component for displaying Edit tool changes from structured patch
const EditPatch = memo(function EditPatch({
  patchLines,
}: {
  patchLines: string[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Parse diff lines with line numbers
  const diffLines = useMemo(() => parseDiffLines(patchLines), [patchLines]);

  // Count added and removed lines
  const { addedLines, removedLines } = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const line of diffLines) {
      if (line.type === 'added') added++;
      else if (line.type === 'removed') removed++;
    }
    return { addedLines: added, removedLines: removed };
  }, [diffLines]);

  const buttonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    marginTop: '4px',
    border: `1px solid ${colors.borderAntd}`,
    borderRadius: '4px',
    background: colors.backgroundTertiary,
    cursor: 'pointer',
    fontSize: '12px',
    color: colors.textSecondary,
  };

  if (!isExpanded) {
    return (
      <button onClick={() => setIsExpanded(true)} style={buttonStyle}>
        <DownOutlined style={{ fontSize: '10px' }} />
        <span style={{ color: '#e74c3c' }}>-{removedLines}</span>
        <span style={{ color: '#27ae60' }}>+{addedLines}</span>
      </button>
    );
  }

  return (
    <div>
      <div className="edit-diff-container">
        <table className="edit-diff-table">
          <colgroup>
            <col style={{ width: '45px' }} />
            <col style={{ width: '45px' }} />
            <col />
          </colgroup>
          <tbody>
            {diffLines.map((line, i) => {
              if (line.type === 'header') {
                return (
                  <tr key={i} className="diff-header-row">
                    <td className="diff-line-num" colSpan={2}></td>
                    <td className="diff-content diff-hunk-header">
                      {line.content}
                    </td>
                  </tr>
                );
              }

              const rowClass =
                line.type === 'added'
                  ? 'diff-added-row'
                  : line.type === 'removed'
                    ? 'diff-removed-row'
                    : '';

              return (
                <tr key={i} className={rowClass}>
                  <td className="diff-line-num diff-line-old">
                    {line.oldLineNum ?? ''}
                  </td>
                  <td className="diff-line-num diff-line-new">
                    {line.newLineNum ?? ''}
                  </td>
                  <td className="diff-content">
                    <span className="diff-marker">
                      {line.type === 'added'
                        ? '+'
                        : line.type === 'removed'
                          ? '-'
                          : ' '}
                    </span>
                    {line.content}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={() => setIsExpanded(false)} style={buttonStyle}>
        <UpOutlined style={{ fontSize: '10px' }} />
        <span>Show less</span>
      </button>
    </div>
  );
});

const { Text } = Typography;

// SqlQueryModal component for displaying SQL query in a modal
const SqlQueryModal = memo(function SqlQueryModal({
  isOpen,
  onClose,
  query,
}: {
  isOpen: boolean;
  onClose: () => void;
  query: string;
}) {
  const { t } = useTranslation();

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      title={null}
      footer={null}
      closable={false}
      width="60%"
      styles={{
        body: { padding: 0 },
        content: { padding: 0, overflow: 'hidden', borderRadius: 12 },
      }}
    >
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1 }}>
          <Text
            copyable={{
              text: query,
              tooltips: [t('sqlQuery.copy'), t('sqlQuery.copied')],
              icon: <CopyOutlined style={{ color: '#fff' }} />,
            }}
          />
        </div>
        <SyntaxHighlighter
          language="sql"
          style={oneDark}
          customStyle={{
            margin: 0,
            padding: 16,
            paddingRight: 40,
            maxHeight: 500,
            fontSize: 13,
            lineHeight: 1.5,
            borderRadius: 12,
          }}
          wrapLongLines
        >
          {query}
        </SyntaxHighlighter>
      </div>
    </Modal>
  );
});

// TodoList component for displaying TodoWrite tool results
const TodoList = memo(function TodoList({ items }: { items: TodoItem[] }) {
  const getStatusIcon = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed':
        return <span style={{ color: '#27ae60', marginRight: 6 }}>✓</span>;
      case 'in_progress':
        return <span style={{ color: colors.brand, marginRight: 6 }}>●</span>;
      case 'pending':
        return (
          <span style={{ color: colors.textMuted, marginRight: 6 }}>○</span>
        );
    }
  };

  return (
    <div style={{ marginTop: 4 }}>
      {items.map((item, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            padding: '2px 0',
            fontSize: 13,
            color:
              item.status === 'completed'
                ? colors.textMuted
                : colors.textSecondary,
            textDecoration:
              item.status === 'completed' ? 'line-through' : 'none',
          }}
        >
          <span style={{ flexShrink: 0 }}>
            {idx === items.length - 1 ? '└' : '├'}
          </span>
          {getStatusIcon(item.status)}
          <span>{item.content}</span>
        </div>
      ))}
    </div>
  );
});

const MarkdownContent = memo(function MarkdownContent({
  content,
}: {
  content: string;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Custom code block rendering
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !className;

          if (isInline) {
            return (
              <code className="inline-code" {...props}>
                {children}
              </code>
            );
          }

          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        // Custom pre rendering for code blocks
        pre({ children }) {
          return <pre className="code-block">{children}</pre>;
        },
        // Custom link rendering
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

// Check if file is a PDF based on extension
function isPdfFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

// File card component for @file_name patterns (card style)
const FileCard = memo(function FileCard({
  filePath,
  onClick,
}: {
  filePath: string;
  onClick: () => void;
}) {
  const fileName = filePath.split('/').pop() || filePath;
  const isPdf = isPdfFileName(fileName);

  return (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 6,
        border: `1px solid ${colors.borderDark}`,
        background: colors.backgroundTertiary,
        cursor: 'pointer',
        maxWidth: 220,
        transition: 'background 0.2s',
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = colors.backgroundHover)
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = colors.backgroundTertiary)
      }
      title={fileName}
    >
      {isPdf ? (
        <FilePdfOutlined
          style={{ fontSize: 18, color: colors.danger, flexShrink: 0 }}
        />
      ) : (
        <FileTextOutlined
          style={{ fontSize: 18, color: colors.info, flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: colors.textHeading,
          }}
        >
          {fileName}
        </div>
        {isPdf && (
          <div style={{ fontSize: 10, color: colors.textMuted }}>PDF</div>
        )}
      </div>
    </div>
  );
});

// Parse text to extract @file_path patterns and remaining text
function parseTextWithFiles(text: string): {
  files: string[];
  textContent: string;
} {
  // Pattern to match @file_path (supports subdirectories with slashes)
  // Matches: @file.txt, @dir/file.txt, @path/to/file.txt
  const filePattern = /@([\w./-]+)/g;
  const files: string[] = [];
  let match;

  while ((match = filePattern.exec(text)) !== null) {
    files.push(match[1]);
  }

  // Remove @file references from text to get clean text content
  const textContent = text.replace(/@[\w./-]+/g, '').trim();

  return { files, textContent };
}

export default memo(function MessageRenderer({
  content,
  role,
  images,
  sessionId,
}: MessageRendererProps) {
  const { t } = useTranslation();
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [sqlQueryModal, setSqlQueryModal] = useState<string | null>(null);

  // Helper to extract SQL query from toolInput JSON
  const extractSqlQuery = (toolInput: string | undefined): string => {
    if (!toolInput) return '';
    try {
      const parsed = JSON.parse(toolInput.trim());
      return parsed.query || '';
    } catch {
      return '';
    }
  };

  if (role === 'user') {
    // Parse content to extract file references and text
    const { files, textContent } = content
      ? parseTextWithFiles(content)
      : { files: [], textContent: '' };

    return (
      <div className="user-message">
        {/* Images */}
        {images && images.length > 0 && (
          <div
            className="user-images"
            style={{ marginBottom: content || files.length > 0 ? 12 : 0 }}
          >
            {images.map((img, idx) => (
              <img
                key={idx}
                src={`data:${img.source.media_type};base64,${img.source.data}`}
                alt="uploaded_image"
                className="uploaded-image"
                style={{
                  maxWidth: 300,
                  maxHeight: 300,
                  borderRadius: 8,
                  marginRight: 8,
                  marginBottom: 8,
                  objectFit: 'contain',
                }}
              />
            ))}
          </div>
        )}
        {/* File cards */}
        {files.length > 0 && sessionId && (
          <div
            className="user-files"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: textContent ? 12 : 0,
            }}
          >
            {files.map((filePath, idx) => (
              <FileCard
                key={idx}
                filePath={filePath}
                onClick={() => setPreviewFile(filePath)}
              />
            ))}
          </div>
        )}
        {/* Text content */}
        {textContent && <pre className="message-text">{textContent}</pre>}
        {/* File preview modal */}
        {sessionId && previewFile && (
          <FilePreviewModal
            isOpen={!!previewFile}
            onClose={() => setPreviewFile(null)}
            filePath={previewFile}
            sessionId={sessionId}
          />
        )}
      </div>
    );
  }

  const blocks = parseAgentMessage(content);

  // If no tool blocks, render as markdown
  const hasToolBlocks = blocks.some((b) => b.type === 'tool');

  if (!hasToolBlocks) {
    return (
      <div className="markdown-content">
        <MarkdownContent content={content} />
      </div>
    );
  }

  return (
    <div className="message-formatted">
      {blocks.map((block, idx) => {
        if (block.type === 'tool') {
          const outputResult = block.toolOutput
            ? formatToolOutput(block.toolName || '', block.toolOutput, t)
            : null;

          const isSqlTool = block.toolName === 'mcp__databricks__run_sql';

          return (
            <div key={idx} className="tool-block">
              <div className="tool-header">
                <span className="tool-name">{block.toolName}</span>
                {isSqlTool ? (
                  <code
                    className="tool-input"
                    onClick={() =>
                      setSqlQueryModal(extractSqlQuery(block.toolInput))
                    }
                    style={{ cursor: 'pointer', color: colors.info }}
                  >
                    {t('sqlQuery.viewQuery')}
                  </code>
                ) : (
                  block.toolDisplayInput && (
                    <code className="tool-input">{block.toolDisplayInput}</code>
                  )
                )}
              </div>
              {block.editPatchLines && block.editPatchLines.length > 0 && (
                <div className="tool-output">
                  <span className="tool-output-connector">└</span>
                  <EditPatch patchLines={block.editPatchLines} />
                </div>
              )}
              {block.todoItems && block.todoItems.length > 0 && (
                <TodoList items={block.todoItems} />
              )}
              {outputResult && (
                <div className="tool-output">
                  <span className="tool-output-connector">└</span>
                  <CollapsibleOutput
                    content={outputResult.content}
                    toolName={block.toolName}
                    isError={outputResult.isError}
                  />
                </div>
              )}
            </div>
          );
        } else {
          return (
            <div key={idx} className="text-block markdown-content">
              <MarkdownContent content={block.content} />
            </div>
          );
        }
      })}
      {/* SQL Query Modal */}
      <SqlQueryModal
        isOpen={!!sqlQueryModal}
        onClose={() => setSqlQueryModal(null)}
        query={sqlQueryModal || ''}
      />
    </div>
  );
});
