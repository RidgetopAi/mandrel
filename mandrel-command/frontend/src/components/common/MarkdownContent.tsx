import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { markdownExcerpt, markdownToPlainText } from '../../utils/markdownExcerpt';
import './MarkdownContent.css';

/**
 * Shared, sanitized GitHub-flavored markdown renderer for context content.
 *
 * This is the ONE component every full-content render site uses, so formatting,
 * overflow handling, and (critically) the security posture are defined in a
 * single place and cannot drift.
 *
 * Security posture (the #1 requirement):
 *  - Content is authored by LLMs (Claude/GPT/Gemini/...) and users, so it is
 *    UNTRUSTED. We never use dangerouslySetInnerHTML with it.
 *  - We do NOT enable rehype-raw, so raw HTML embedded in the markdown source is
 *    treated as literal text (or dropped), never parsed into live DOM. A
 *    `<script>` / `<iframe>` / `<img onerror=...>` in the source therefore cannot
 *    become an executing element.
 *  - rehype-sanitize runs as defense-in-depth on the produced HAST: the default
 *    schema strips event-handler attributes and restricts href/src to safe
 *    protocols, so markdown like `[x](javascript:alert(1))` or
 *    `![x](javascript:alert(1))` loses its dangerous URL.
 *  - Links render with rel="noopener noreferrer" and target="_blank".
 */

// Clone the library default schema (already strict: no script/iframe, no on*
// handlers, only http/https/mailto/... protocols) and only widen it enough to
// render GFM task-list checkbox state. We intentionally keep it strict otherwise.
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // GFM task lists emit `<input type="checkbox" checked disabled>`. The default
    // schema allows `type` + `disabled` but not `checked`; allow it so a checked
    // task item actually renders checked. `checked`/`disabled` are inert here.
    input: [...(defaultSchema.attributes?.input || []), 'checked'],
  },
};

const remarkPlugins = [remarkGfm];
const rehypePlugins = [[rehypeSanitize, sanitizeSchema]] as any;

export interface MarkdownContentProps {
  /** Raw content string (markdown or plain text). Null/undefined renders empty. */
  content?: string | null;
  /** Extra class appended to the `.markdown-content` wrapper. */
  className?: string;
  /** Inline styles applied to the wrapper (e.g. maxHeight + overflow for a pane). */
  style?: React.CSSProperties;
}

const components: Components = {
  // Strip react-markdown's internal `node` prop so it never leaks into the DOM
  // as `node="[object Object]"`; href has already been protocol-sanitized by
  // rehype-sanitize at this point.
  a({ node, children, ...props }) {
    return (
      <a {...props} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className, style }) => {
  const text = content ?? '';
  const wrapperClass = className ? `markdown-content ${className}` : 'markdown-content';

  return (
    <div className={wrapperClass} style={style}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownContent;

// Re-export the excerpt helpers from the shared markdown module so preview sites
// can pull the component or the excerpt from one place.
export { markdownExcerpt, markdownToPlainText };
