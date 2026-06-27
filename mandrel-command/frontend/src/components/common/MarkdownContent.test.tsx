/*
 * eslint-disable rules that don't apply to this file:
 *  - testing-library/render-result-naming-convention: this suite does NOT use
 *    @testing-library; it renders the real pipeline to an HTML STRING via
 *    react-dom/server's renderToStaticMarkup. The plugin's aggressive detection
 *    misreads that as a component render and objects to the `html` var name.
 *  - no-script-url: the `javascript:` strings are intentional malicious payloads
 *    that the sanitization tests assert are neutralized.
 */
/* eslint-disable testing-library/render-result-naming-convention, no-script-url */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownContent from './MarkdownContent';

/**
 * These tests render the REAL react-markdown + remark-gfm + rehype-sanitize
 * pipeline to a static HTML string (no @testing-library dependency) and assert
 * on the produced markup. Importing react-markdown here also proves the CRA/Jest
 * ESM transform is configured (Lesson 016) — without the transformIgnorePatterns
 * override this file fails to even import.
 */
const mdToHtml = (content: string): string =>
  renderToStaticMarkup(<MarkdownContent content={content} />);

describe('MarkdownContent rendering', () => {
  it('renders headings as heading tags', () => {
    const html = mdToHtml('# Title');
    expect(html).toContain('<h1');
    expect(html).toContain('Title');
  });

  it('renders bold and italic', () => {
    const html = mdToHtml('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders unordered lists', () => {
    const html = mdToHtml('- one\n- two');
    expect(html).toContain('<ul');
    expect(html).toContain('<li>');
    expect(html).toContain('one');
    expect(html).toContain('two');
  });

  it('renders fenced code blocks', () => {
    const html = mdToHtml('```js\nconst x = 1;\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1;');
  });

  it('renders GFM tables', () => {
    const html = mdToHtml('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th');
    expect(html).toContain('<td');
  });

  it('renders GFM strikethrough and task lists', () => {
    expect(mdToHtml('~~gone~~')).toContain('<del>');
    const tasks = mdToHtml('- [x] done\n- [ ] todo');
    expect(tasks).toContain('type="checkbox"');
    expect(tasks).toContain('checked');
  });

  it('degrades gracefully on plain text (renders a paragraph)', () => {
    const html = mdToHtml('just some plain text, no markdown here');
    expect(html).toContain('<p>just some plain text, no markdown here</p>');
  });

  it('renders safe http links with rel=noopener noreferrer and target=_blank', () => {
    const html = mdToHtml('[docs](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
    // react-markdown's internal `node` prop must not leak into the DOM.
    expect(html).not.toContain('node=');
    expect(html).not.toContain('[object Object]');
  });

  it('renders empty for null/undefined content', () => {
    expect(renderToStaticMarkup(<MarkdownContent content={null} />)).not.toContain('undefined');
    expect(renderToStaticMarkup(<MarkdownContent content={undefined} />)).not.toContain('null');
  });
});

describe('MarkdownContent sanitization (load-bearing XSS guard)', () => {
  it('neutralizes a raw <script> tag (no executable script element)', () => {
    const html = mdToHtml('Hello <script>alert(1)</script> world');
    // The raw HTML is treated as inert text, never parsed into a live element:
    // no <script> tag exists in the output, so nothing can execute. (The literal
    // characters "alert(1)" may remain as harmless visible text, like GitHub.)
    expect(html).not.toContain('<script');
    expect(html).not.toContain('</script>');
  });

  it('neutralizes a raw <iframe>', () => {
    const html = mdToHtml('<iframe src="https://evil.example"></iframe>');
    expect(html).not.toContain('<iframe');
  });

  it('strips inline event handlers from raw HTML (img onerror)', () => {
    const html = mdToHtml('<img src=x onerror="alert(1)">');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert(1)');
  });

  it('strips javascript: URLs from markdown links', () => {
    const html = mdToHtml('[click me](javascript:alert(1))');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('strips javascript: URLs from markdown images', () => {
    const html = mdToHtml('![x](javascript:alert(1))');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('strips data: URLs from markdown images (no data:text/html payload)', () => {
    const html = mdToHtml('![x](data:text/html;base64,PHNjcmlwdD4=)');
    expect(html.toLowerCase()).not.toContain('data:text/html');
  });

  it('does not pass through arbitrary raw HTML attributes/styles', () => {
    const html = mdToHtml('<div style="position:fixed" onclick="steal()">x</div>');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('steal()');
  });
});
