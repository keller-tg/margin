import { describe, expect, it } from 'vitest';
import { htmlToText } from './plain';

describe('htmlToText', () => {
  it('drops tags, scripts and styles', () => {
    expect(htmlToText('<p>Hi <b>there</b></p><script>alert(1)</script><style>p{}</style>')).toBe('Hi there');
  });
  it('decodes entities once and cannot be tricked into markup', () => {
    expect(htmlToText('a &amp; b')).toBe('a & b');
    expect(htmlToText('&lt;img src=x onerror=alert(1)&gt;')).not.toMatch(/[<>]/);
    expect(htmlToText('&amp;lt;b&amp;gt;')).toBe('&lt;b&gt;');
  });
  it('turns block breaks into newlines', () => {
    expect(htmlToText('one<br>two</p>three')).toBe('one\ntwo\nthree');
  });
  it('removes control and bidi characters', () => {
    expect(htmlToText('a‮b\u0007c')).toBe('abc');
  });
});
