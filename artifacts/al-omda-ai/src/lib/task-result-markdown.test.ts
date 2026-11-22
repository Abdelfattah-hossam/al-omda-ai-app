import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TaskResultMarkdown from '../TaskResultMarkdown';

test('stage output has actual bold text and separate numbered list items', () => {
  const html = renderToStaticMarkup(createElement(TaskResultMarkdown, { content: 'قائمة الفحص\n\n1. **العنوان الأول:** نص أول\n2. **العنوان الثاني:** نص ثان' }));
  assert.match(html, /<ol>/);
  assert.equal((html.match(/<li>/g) || []).length, 2);
  assert.match(html, /<strong>العنوان الأول:<\/strong>/);
  assert.doesNotMatch(html, /\*\*/);
});

test('stage Markdown never embeds raw HTML or loads remote image pixels', () => {
  const html = renderToStaticMarkup(createElement(TaskResultMarkdown, { content: '<script>alert(1)</script>\n\n![diagram](https://example.com/pixel.png)' }));
  assert.doesNotMatch(html, /<script|<img|src=/);
  assert.match(html, /diagram/);
});
