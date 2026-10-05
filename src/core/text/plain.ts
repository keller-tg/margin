// Every string that comes from an API is untrusted. Margin never renders API HTML:
// it is reduced to plain text here, and the app renders plain text only.

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ouml: 'ö', auml: 'ä', uuml: 'ü', szlig: 'ß', times: '×',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      // drop control characters and invalid code points instead of decoding them
      if (!Number.isFinite(cp) || cp < 0x20 || cp > 0x10ffff || (cp >= 0x7f && cp < 0xa0)) return '';
      return String.fromCodePoint(cp);
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/**
 * HTML → plain text. Block-level breaks become newlines, every tag is dropped (content of
 * <script>/<style> included), entities are decoded once, control characters are removed.
 * The result is safe to place in a text node; it must still never be used as HTML.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)\s*>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/[<>]/g, '') // a decoded "&lt;b&gt;" must not survive as markup-looking text
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[ \t ]+/g, (m) => (m.includes(' ') && m.length === 1 ? m : ' '))
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
