/**
 * TipTap-based markdown editor with real-time formatting preview
 * Provides Slack-like WYSIWYG editing experience
 */

import { useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

// Custom extension to convert ``` to code block immediately (without Enter)
const InstantCodeBlock = Extension.create({
  name: 'instantCodeBlock',

  addKeyboardShortcuts() {
    return {
      // When backtick is pressed, check if we have ``
      '`': ({ editor }) => {
        const { state } = editor;
        const { $from } = state.selection;
        const textBefore = $from.parent.textContent.slice(
          0,
          $from.parentOffset
        );

        // Check if typing ` would complete ```
        if (textBefore.endsWith('``')) {
          // Delete the `` and create code block
          editor
            .chain()
            .deleteRange({ from: $from.pos - 2, to: $from.pos })
            .setCodeBlock()
            .run();
          return true;
        }
        return false;
      },
    };
  },
});

interface MarkdownEditorProps {
  /** Current input value */
  value: string;
  /** Callback when content changes */
  onChange: (value: string) => void;
  /** Callback when submit is triggered (Enter key) */
  onSubmit: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the editor is disabled */
  disabled?: boolean;
}

// Custom extension for keyboard shortcuts
const createSubmitExtension = (onSubmit: () => void) =>
  Extension.create({
    name: 'submitOnEnter',

    addKeyboardShortcuts() {
      return {
        Enter: ({ editor }) => {
          // Don't submit if in code block - allow normal Enter behavior
          if (editor.isActive('codeBlock')) {
            return false;
          }
          // Submit on Enter (Shift+Enter handled by default for new line)
          onSubmit();
          return true;
        },
        'Shift-Enter': () => {
          // Allow new line with Shift+Enter
          return false;
        },
        'Mod-Enter': () => {
          // Force submit even in code block with Cmd/Ctrl+Enter
          onSubmit();
          return true;
        },
      };
    },
  });

export default function MarkdownEditor({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
}: MarkdownEditorProps) {
  const isComposing = useRef(false);
  const lastValue = useRef(value);

  // Memoize the submit handler to avoid recreating the extension
  const handleSubmit = useCallback(() => {
    // Don't submit during IME composition
    if (isComposing.current) {
      return;
    }
    onSubmit();
  }, [onSubmit]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // Disable default, use lowlight version
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Type your message...',
      }),
      InstantCodeBlock,
      createSubmitExtension(handleSubmit),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      // Get plain text with markdown-like formatting preserved
      const text = editor.getText();
      lastValue.current = text;
      onChange(text);
    },
  });

  // Sync external value changes to editor
  useEffect(() => {
    if (editor && value !== lastValue.current) {
      // Only update if value was changed externally (e.g., cleared after submit)
      const currentPos = editor.state.selection.$head.pos;
      editor.commands.setContent(value, false);
      // Try to restore cursor position
      if (value.length > 0 && currentPos <= value.length) {
        editor.commands.setTextSelection(currentPos);
      }
      lastValue.current = value;
    }
  }, [editor, value]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  // Handle IME composition events
  const handleCompositionStart = useCallback(() => {
    isComposing.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposing.current = false;
  }, []);

  return (
    <div
      className="tiptap-editor"
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
