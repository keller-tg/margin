// Fetching one article for a packet: plain-text extract, revision, categories, description.
// One cached request per article.
import { htmlToText } from '../../../src/core/text/plain';
import { countWords } from '../../../src/core/text/sentences';
import { actionApi, type WikiLang } from './wiki';

export type Article = {
  title: string;
  pageid: number;
  revid: number;
  description: string;
  lead: string;
  sections: { heading: string; text: string }[];
  categories: string[];
};

const BOILERPLATE: RegExp =
  /^(references|notes|see also|external links|further reading|bibliography|sources|citations|footnotes|gallery|literatur|weblinks|einzelnachweise|anmerkungen|siehe auch|quellen|galerie|notes et références|références|voir aussi|liens externes|bibliographie|articles connexes|annexes|galerie|filmographie|discographie|filmografie|diskografie|works|werke|œuvres)$/i;

const DEEP_WORD_CAP = 2500;

export async function fetchArticle(lang: WikiLang, title: string): Promise<Article | null> {
  const body = await actionApi(lang, {
    titles: title, redirects: 1,
    prop: 'extracts|info|categories|description',
    explaintext: 1, exsectionformat: 'wiki',
    clshow: '!hidden', cllimit: 'max',
  });
  const page = body.query?.pages?.[0];
  if (!page || page.missing) return null;
  const raw: string = page.extract ?? '';
  const parts = raw.split(/\n\n?(={2,})\s*([^=\n]+?)\s*\1\n/);
  const lead = clean(parts[0] ?? '');
  const sections: Article['sections'] = [];
  let words = 0;
  let current: { heading: string; text: string } | null = null;
  for (let i = 1; i < parts.length; i += 3) {
    const level = parts[i]!.length;
    const heading = parts[i + 1]!.trim();
    const text = clean(parts[i + 2] ?? '');
    if (level === 2) {
      if (current && current.text) sections.push(current);
      current = BOILERPLATE.test(heading) ? null : { heading, text };
    } else if (current) {
      current.text = [current.text, text].filter(Boolean).join('\n');
    }
  }
  if (current && current.text) sections.push(current);
  const capped: Article['sections'] = [];
  for (const s of sections) {
    if (words >= DEEP_WORD_CAP) break;
    const w = countWords(s.text);
    capped.push(s);
    words += w;
  }
  return {
    title: page.title,
    pageid: page.pageid,
    revid: page.lastrevid,
    description: htmlToText(page.description ?? ''),
    lead,
    sections: capped,
    categories: (page.categories ?? []).map((c: { title: string }) => c.title.replace(/^[^:]+:/, '')),
  };
}

function clean(t: string): string {
  return htmlToText(t)
    .replace(/\{\\displaystyle[^}]*\}/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
