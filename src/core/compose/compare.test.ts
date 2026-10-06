// Compare pages: built only for things with a height of their own, never for averages or highest points.
// HANDMADE packets (see fixtures/README.md); the refs below are shaped like content/refs/refs.json entries.
import { describe, expect, it } from 'vitest';
import { composeExtractive } from './compose';
import { extractFacts } from './facts';
import type { Packet, RefSource } from './packet';
import { fixturePacket } from './testing';
import { verifyThing } from '../verify/verify';
import { emptyCtx } from './testing';

const refs: RefSource[] = [
  { id: 'pyramid', label: 'the Great Pyramid', value: 146.6, unit: 'metres', surface: '146.6 metres', metres: 146.6, sentence: 'Initially standing at 146.6 metres, the Great Pyramid was the tallest structure.', source: { title: 'Great Pyramid of Giza', revid: 1, url: 'https://en.wikipedia.org/w/index.php?title=Great_Pyramid_of_Giza&oldid=1' } },
  { id: 'eiffel', label: 'the Eiffel Tower', value: 330, unit: 'metres', surface: '330 metres', metres: 330, sentence: 'The tower is 330 metres tall.', source: { title: 'Eiffel Tower', revid: 2, url: 'https://en.wikipedia.org/w/index.php?title=Eiffel_Tower&oldid=2' } },
];

// HANDMADE sections about the made-up tower, so Deep has enough clean sentences of its own
const sections = [
  { heading: 'Building', text: 'Work on the tower began in 1983 and took four years. The builders used steel from a mill near the harbour. Each floor was lifted into place by a crane on the roof. The last floor was set in the spring of 1987.' },
  { heading: 'Today', text: 'Visitors can ride a lift to a terrace near the top. On clear days the terrace looks out over the bay and the hills. A small museum on the ground floor tells the story of the build. The tower is lit in blue on winter evenings.' },
];

function packet(domain: Packet['topic']['domain'], lead: string, title = 'Glass Tower'): Packet {
  const p = fixturePacket();
  p.topic = { ...p.topic, title, domain };
  p.source = { ...p.source, description: 'tower', lead, sections };
  p.refs = refs;
  p.facts = extractFacts('en', [{ text: lead }, ...p.source.sections.map((s) => ({ text: s.text, section: s.heading }))], null);
  return p;
}
const comparePages = (p: Packet) => composeExtractive(p).thing.paces.deep.filter((pg) => pg.type === 'compare');

describe('compare pages', () => {
  it('a tower that states its own height is compared with refs of similar size, and verifies', () => {
    const p = packet('architecture', 'Glass Tower is a tower in a city by the sea. The Glass Tower is 240 metres tall and was finished in 1987. Its glass skin reflects the sky and the water below it.');
    const [cmp] = comparePages(p);
    expect(cmp?.type === 'compare' && cmp.items.map((i) => i.label)).toEqual(['the Great Pyramid', 'Glass Tower', 'the Eiffel Tower']);
    const { thing } = composeExtractive(p);
    expect(verifyThing(thing, p, emptyCtx).filter((i) => i.rule !== 'attribution')).toEqual([]);
  });
  it('not for an average elevation (the Bulgaria case)', () => {
    expect(comparePages(packet('architecture', 'Glass Tower is a tower in a city by the sea. The average height of Glass Tower is 240 metres above the plain. Its glass skin reflects the sky.'))).toEqual([]);
  });
  it('not for a highest point inside the topic (the Banff case)', () => {
    expect(comparePages(packet('landscapes', 'Glass Park is a park in the hills by the sea. The highest point in Glass Park is 240 metres high. Its lakes reflect the sky.', 'Glass Park'))).toEqual([]);
  });
  it('not for countries, cities or islands', () => {
    expect(comparePages(packet('places', 'Glassland is a country by the sea. Glassland is 240 metres high on average. Its lakes reflect the sky.', 'Glassland'))).toEqual([]);
  });
});
