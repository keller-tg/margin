// HANDMADE FIXTURES: every API body in this file is written by hand in the shape of the Action API's
// formatversion=2 responses. No network.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seeded } from '../rng/rng';
import { metaParams, parseLinks, parseMeta, resolvedTitles, titleBatches } from './api';
import { isListOrYear, personStatus, prefilterLinks, screenMeta, screenText, trailRules, type PageMeta } from './screen';
import { choiceLine, findSeeds, hopPages, oneLine, poolChoices, type Api, type TrailPool, type TrailSeed } from './trail';

const rules = trailRules({
  titles: '# comment\nCocaine\n',
  qids: 'Q12802 nuclear weapon\n',
  categories: 'pornograph|nudity\n^massacres\\b\n',
  topics: readFileSync('content/blocklist/trail-topics.en.txt', 'utf8'),
});
const rulesFor = (lang: 'de' | 'fr') => trailRules({ titles: '', qids: '', categories: '', topics: readFileSync(`content/blocklist/trail-topics.${lang}.txt`, 'utf8') });

const meta = (over: Partial<PageMeta>): PageMeta => ({ title: 'X', missing: false, disambig: false, qid: null, categories: [], description: 'd', revid: 1, length: 20000, ...over });

describe('screening', () => {
  it('lists, years, decades and centuries are not stops', () => {
    for (const t of ['List of lighthouses', 'Liste der Leuchttürme', 'Liste des phares', '1982', '1980s', '44 BC', '18th century', '19. Jahrhundert', 'XVIIIe siècle', 'Timeline of Antarctica', 'Années 1980', '1980er Jahre'])
      expect(isListOrYear(t), t).toBe(true);
    for (const t of ['Lighthouse', 'Port Stanley', '1984 (novel)', 'Apollo 11']) expect(isListOrYear(t), t).toBe(false);
  });

  it('prefilter drops visited, vetoed, list titles and duplicates, keeping order', () => {
    expect(prefilterLinks(['Penguin', 'Cocaine', 'List of birds', 'Penguin', 'Argentina', 'Falkland Islands'], rules, ['Falkland Islands'])).toEqual(['Penguin', 'Argentina']);
  });

  it('people: living and recently dead fail; long dead pass; non-people are not people', () => {
    expect(personStatus(['1950 births', 'Living people'], 'en', 2026)).toBe('living-or-recent');
    expect(personStatus(['1950 births'], 'en', 2026)).toBe('living-or-recent'); // no death category: assume living
    expect(personStatus(['1950 births', '2025 deaths'], 'en', 2026)).toBe('living-or-recent');
    expect(personStatus(['1890 births', '1955 deaths'], 'en', 2026)).toBe('dead-long-enough');
    expect(personStatus(['4th-century BC births', '4th-century BC deaths'], 'en', 2026)).toBe('dead-long-enough');
    expect(personStatus(['Geboren 1950', 'Mann'], 'de', 2026)).toBe('living-or-recent');
    expect(personStatus(['Geboren 1879', 'Gestorben 1955', 'Mann'], 'de', 2026)).toBe('dead-long-enough');
    expect(personStatus(['Gestorben im 15. Jahrhundert'], 'de', 2026)).toBe('dead-long-enough');
    expect(personStatus(['Naissance en mars 1879', 'Décès en avril 1955'], 'fr', 2026)).toBe('dead-long-enough');
    expect(personStatus(['Naissance à Paris'], 'fr', 2026)).toBe('living-or-recent');
    expect(personStatus(['Seabirds', 'Birds of Antarctica'], 'en', 2026)).toBe('not-a-person');
  });

  it('metadata screen: disambiguation, vetoes, categories, people', () => {
    expect(screenMeta(meta({ disambig: true }), 'en', rules, 2026)).toBe('disambiguation');
    expect(screenMeta(meta({ qid: 'Q12802' }), 'en', rules, 2026)).toBe('blocklisted qid');
    expect(screenMeta(meta({ categories: ['Massacres in Europe'] }), 'en', rules, 2026)).toMatch(/blocklisted category/);
    expect(screenMeta(meta({ categories: ['1960 births', 'Living people'] }), 'en', rules, 2026)).toBe('person-living-or-recent');
    expect(screenMeta(meta({ title: 'Penguin', categories: ['Seabirds'] }), 'en', rules, 2026)).toBeNull();
    expect(screenMeta(meta({ length: 3000 }), 'en', rules, 2026)).toBe('stub');
  });

  it('trail topic rules: articles that ARE wars, battles, weapons, elections; never biographies', () => {
    const why = (cats: string[], lang: 'en' | 'de' | 'fr' = 'en') => screenMeta(meta({ categories: cats }), lang, lang === 'en' ? rules : rulesFor(lang), 2026);
    expect(why(['Falklands War', 'Wars involving Argentina', 'Conflicts in 1982'])).toMatch(/trail topic rule/);
    expect(why(['Battles involving the United Kingdom'])).toMatch(/trail topic rule/);
    expect(why(['Rifles of the United States'])).toMatch(/trail topic rule/);
    expect(why(['Elections in the Falkland Islands'])).toMatch(/trail topic rule/);
    expect(why(['1890 births', '1955 deaths', 'British Army personnel of World War I', 'People of the Falklands War'])).toBeNull();
    expect(why(['Krieg (Vereinigtes Königreich)', 'Falklandkrieg'], 'de')).toMatch(/trail topic rule/);
    expect(why(['Geboren 1879', 'Gestorben 1955', 'Militärperson (Vereinigtes Königreich)'], 'de')).toBeNull();
    expect(why(['Drogenpolitik'], 'de')).toBeNull();
    expect(why(['Guerre impliquant l’Argentine', 'Guerre des Malouines'], 'fr')).toMatch(/trail topic rule/);
    expect(why(['Naissance en 1879', 'Décès en 1955', 'Militaire britannique de la Première Guerre mondiale'], 'fr')).toBeNull();
    expect(why(['Guerrier légendaire'], 'fr')).toBeNull();
    // live political disputes and military installations (politics and military are whole excluded sections in the daily pool)
    expect(why(['Territorial disputes of Argentina'])).toMatch(/trail topic rule/);
    expect(why(['Royal Air Force stations in the Falkland Islands'])).toMatch(/trail topic rule/);
    expect(why(['Territorialstreit'], 'de')).toMatch(/trail topic rule/);
    expect(why(['Territoire contesté'], 'fr')).toMatch(/trail topic rule/);
    expect(why(['Base aérienne de la Royal Air Force'], 'fr')).toMatch(/trail topic rule/);
  });

  it('text screen: a review word drops the candidate; short leads fail; usable sentences are kept in order', () => {
    expect(screenText('The fort was bombed in 1941. It was rebuilt later with stone walls and a new gate.', 'en')).toEqual({ ok: false, reason: 'review word "bombed"' });
    expect(screenText('Penguins are birds.', 'en').ok).toBe(false);
    const r = screenText(
      'Penguins (order Sphenisciformes) are a group of aquatic flightless birds from the Southern Hemisphere. They are highly adapted for life in the ocean water. Their wings have evolved into flippers that let them swim fast.',
      'en',
    );
    expect(r.ok && r.sentences[0]).toBe('Penguins are a group of aquatic flightless birds from the Southern Hemisphere.');
  });
});

describe('api adapters', () => {
  it('links: prose paragraphs only, in reading order, no other namespaces, no red links', () => {
    const text = [
      '<table class="infobox"><tr><td><a href="/wiki/ISO_3166" title="ISO 3166">ISO</a></td></tr></table>',
      '<p>The <b>Falklands</b> (<a href="/wiki/Help:IPA/English" title="Help:IPA/English">/ˈfɔːklənd/</a>) is an <a href="/wiki/Archipelago" title="Archipelago">archipelago</a> near <a href="/wiki/Patagonia" title="Patagonia">Patagonian</a> coasts and <a href="/w/index.php?title=Nowhere&amp;action=edit&amp;redlink=1" class="new" title="Nowhere (page does not exist)">x</a>.</p>',
      '<p><a href="/wiki/Star_Wars:_Episode_IV" title="Star Wars: Episode IV">film</a>, <a href="/wiki/Archipelago" title="Archipelago">again</a>, <a href="/wiki/Ch%C3%A2teau" title="Ch&#226;teau">ch</a></p>',
      '<ol class="references"><li><a href="/wiki/JSTOR" title="JSTOR">JSTOR</a></li></ol>',
    ].join('');
    expect(parseLinks({ parse: { title: 'Falkland Islands', text } })).toEqual({ title: 'Falkland Islands', links: ['Archipelago', 'Patagonia', 'Star Wars: Episode IV', 'Château'] });
  });

  it('meta: merges continued categories and follows redirects', () => {
    const a = { continue: { clcontinue: '1|B' }, query: { redirects: [{ from: 'Stanley, Falkland Islands', to: 'Stanley' }], pages: [{ pageid: 1, title: 'Stanley', lastrevid: 9, description: 'capital', categories: [{ ns: 14, title: 'Category:Ports' }] }] } };
    const b = { query: { pages: [{ pageid: 1, title: 'Stanley', categories: [{ ns: 14, title: 'Category:Capitals in South America' }] }] } };
    expect(parseMeta([a, b])[0]!.categories).toEqual(['Ports', 'Capitals in South America']);
    expect(resolvedTitles([a, b]).get('Stanley, Falkland Islands')).toBe('Stanley');
  });

  it('batches stay at 50 titles and under the URL length limit', () => {
    const many = Array.from({ length: 120 }, (_, i) => `Title ${i}`);
    expect(titleBatches(many, 50).map((b) => b.length)).toEqual([50, 50, 20]);
    const long = Array.from({ length: 50 }, (_, i) => `東京${'都'.repeat(30)}${i}`);
    expect(titleBatches(long, 50).every((b) => encodeURIComponent(b.join('|')).length <= 5000)).toBe(true);
    expect(metaParams(['A', 'B']).titles).toBe('A|B');
  });
});

describe('one-line descriptions', () => {
  it('cuts at the first semicolon, then at a word near 60 characters', () => {
    expect(oneLine('einer der fünf Sinne; Wahrnehmungsform, über die Gerüche wahrgenommen werden')).toBe('einer der fünf Sinne');
    expect(oneLine('Tierart, die in Bezug auf den circadian genannten, vierundzwanzigstündigen Rhythmus von Tag- und Nachtwechsel')).toBe('Tierart, die in Bezug auf den circadian genannten…');
    expect(oneLine('Collection of islands')).toBe('Collection of islands');
  });
  it('the lead fallback needs a real definition of the topic', () => {
    expect(choiceLine('', ['La Réforme protestante à Zurich a été promue au départ par Ulrich Zwingli.'], 'fr', 'Réforme protestante à Zurich')).toBe('');
    expect(choiceLine('', ['West Falkland is the second largest of the Falkland Islands.'], 'en', 'West Falkland')).toMatch(/second largest/);
  });
});

describe('hops and choices', () => {
  const seed: TrailSeed = {
    title: 'Penguin',
    description: 'family of aquatic flightless birds',
    revid: 1,
    sentences: [
      'Penguins are a group of aquatic flightless birds from the Southern Hemisphere.',
      'They are highly adapted for life in the ocean water.',
      'Their wings have evolved into flippers that let them swim fast.',
      'Most penguins feed on krill, fish, squid and other forms of sea life which they catch while swimming underwater.',
      'They spend about half of their lives on land and the other half in the sea.',
    ],
  };

  it('pages per hop scale with pace', () => {
    expect(hopPages(seed, 'en', 'easy').length).toBeLessThanOrEqual(2);
    expect(hopPages(seed, 'en', 'medium').length).toBe(3);
    expect(hopPages(seed, 'en', 'deep').length).toBe(4);
    expect(hopPages(seed, 'en', 'easy').every((t) => t.split(/\s+/).length <= 15)).toBe(true);
  });

  it('pool choices skip the trail so far and are seeded', () => {
    const pool: TrailPool = { version: 1, lang: 'en', date: '2099-01-01', from: { title: 'Falkland Islands', revid: 1 }, seeds: ['A', 'B', 'C', 'D', 'E', 'F'].map((t) => ({ ...seed, title: t })) };
    const a = poolChoices(pool, ['B'], 'en', 'medium', seeded('x'));
    expect(a).toHaveLength(4);
    expect(a.map((s) => s.title)).not.toContain('B');
    expect(poolChoices(pool, ['B'], 'en', 'medium', seeded('x')).map((s) => s.title)).toEqual(a.map((s) => s.title));
  });

  it('findSeeds: links → meta screen → extract screen, about three requests', async () => {
    const lead = (t: string) => `${t} is a small island in the South Atlantic Ocean near the coast. It has a few hundred inhabitants and many seabirds. The island was first charted in the eighteenth century by sailors.`;
    const api: Api = async (p) => {
      if (p.action === 'parse')
        return { parse: { title: 'Falkland Islands', text: `<p>${['Living Painter', 'Disamb', 'Bomb Island', 'Island A', 'Island B', 'Island C', 'Island D', 'Island E'].map((t) => `<a href="/wiki/${t.replace(/ /g, '_')}" title="${t}">${t}</a>`).join(', ')}</p>` } };
      const titles = String(p.titles).split('|');
      if (p.prop === 'extracts')
        return { query: { pages: titles.map((title) => ({ title, extract: title === 'Bomb Island' ? 'Bomb Island was bombed in 1982 by aircraft. It is now empty and quiet again.' : lead(title) })) } };
      return {
        query: {
          pages: titles.map((title, i) => ({
            pageid: i + 1, title, lastrevid: 100 + i, length: 20000, description: title === 'Island C' ? '' : 'island in the South Atlantic',
            ...(title === 'Disamb' ? { pageprops: { disambiguation: '' } } : {}),
            categories: title === 'Living Painter' ? [{ ns: 14, title: 'Category:1970 births' }] : [],
          })),
        },
      };
    };
    const r = await findSeeds(api, { lang: 'en', from: 'Falkland Islands', exclude: [], rules, thisYear: 2026, want: 4, leadOnly: true, maxMetaBatches: 1, paces: ['medium'] });
    expect(r.seeds.map((s) => s.title)).toEqual(['Island A', 'Island B', 'Island C', 'Island D']);
    expect(r.seeds[2]!.description).toBe('A small island in the South Atlantic Ocean near the coast'); // from the lead's own definition
    expect(r.rejected.map((x) => x.reason)).toEqual(['person-living-or-recent', 'disambiguation', 'review word "bomb"']); // "Bomb Island" itself already trips the scan
    expect(r.requests).toBe(3);
  });
});
