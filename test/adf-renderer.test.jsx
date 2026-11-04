import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AdfRenderer, { FieldValue } from '../web/src/AdfRenderer.jsx';

function render(doc, props = {}) {
  return renderToStaticMarkup(<AdfRenderer doc={doc} {...props} />);
}

function doc(content) {
  return { type: 'doc', version: 1, content };
}

describe('AdfRenderer', () => {
  it('renders paragraph with strong/em/code marks', () => {
    const html = render(
      doc([
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'bold', marks: [{ type: 'strong' }] },
            { type: 'text', text: ' ' },
            { type: 'text', text: 'italic', marks: [{ type: 'em' }] },
            { type: 'text', text: ' ' },
            { type: 'text', text: 'code', marks: [{ type: 'code' }] },
          ],
        },
      ]),
    );
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
  });

  it('renders ordered list with start, heading level, codeBlock with language', () => {
    const html = render(
      doc([
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'orderedList',
          attrs: { order: 3 },
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] },
          ],
        },
        { type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'const x = 1;' }] },
      ]),
    );
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('start="3"');
    expect(html).toContain('const x = 1;');
    expect(html).toContain('js');
  });

  it('renders table th/td with colspan', () => {
    const html = render(
      doc([
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: { colspan: 2 },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Head' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
                },
              ],
            },
          ],
        },
      ]),
    );
    expect(html).toContain('<th colSpan="2"');
    expect(html).toContain('<td');
    expect(html).toContain('Head');
    expect(html).toContain('Cell');
  });

  it('strips javascript: links but keeps rel noreferrer for https links', () => {
    const html = render(
      doc([
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'bad',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
            {
              type: 'text',
              text: 'good',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
      ]),
    );
    expect(html).not.toMatch(/href="javascript:/);
    expect(html).toContain('bad');
    expect(html).toMatch(/href="https:\/\/example\.com"[^>]*rel="noreferrer noopener"/);
  });

  it('escapes script tags in text content', () => {
    const html = render(doc([{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }] }]));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('renders media with matching image attachment as img, non-matching as chip', () => {
    const attachments = [
      { id: '1', filename: 'shot.png', mimeType: 'image/png', contentUrl: '/api/attachments/1', thumbnailUrl: '/api/attachments/1/thumbnail' },
    ];
    const html = render(
      doc([
        { type: 'mediaSingle', content: [{ type: 'media', attrs: { alt: 'shot.png' } }] },
        { type: 'mediaSingle', content: [{ type: 'media', attrs: { alt: 'missing.png' } }] },
      ]),
      { attachments },
    );
    expect(html).toContain('<img');
    expect(html).toContain('/api/attachments/1/thumbnail');
    expect(html).toContain('missing.png');
  });

  it('handles unknown node types, null doc, and malformed content gracefully', () => {
    const html = render(doc([{ type: 'weirdNode', content: [{ type: 'text', text: 'still here' }] }]));
    expect(html).toContain('still here');
    expect(render(null)).toBe('');
    expect(() => render({ type: 'paragraph', content: null })).not.toThrow();
  });

  it('FieldValue renders string and adf values', () => {
    const strHtml = renderToStaticMarkup(<FieldValue value="hello" />);
    expect(strHtml).toContain('hello');
    const adfHtml = renderToStaticMarkup(
      <FieldValue value={{ adf: doc([{ type: 'paragraph', content: [{ type: 'text', text: 'world' }] }]) }} />,
    );
    expect(adfHtml).toContain('world');
  });
});
