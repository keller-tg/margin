import { describe, expect, it } from 'vitest';
import { composeExtractive } from '../compose/compose';
import { emptyCtx, fixturePacket } from '../compose/testing';
import type { Thing } from '../schema/thing';
import { checkCredit, verifyThing } from './verify';

// Every test starts from a composed thing over the HANDMADE fixture packet, then breaks one thing.
const base = () => {
  const packet = fixturePacket();
  return { packet, thing: structuredClone(composeExtractive(packet).thing) as Thing };
};
const rules = (t: Thing, packet = fixturePacket()) => verifyThing(t, packet, emptyCtx).map((i) => i.rule);
const setSentence = (t: Thing, text: string) => {
  const i = t.paces.deep.findIndex((p) => p.type === 'sentence');
  t.paces.deep[i] = { type: 'sentence', text };
};

describe('verifier', () => {
  it('passes the extractive thing', () => {
    const { thing, packet } = base();
    expect(verifyThing(thing, packet, emptyCtx)).toEqual([]);
  });
  it('numbers: invented number fails; hedged rounding within 10% passes; local formats pass', () => {
    const { thing } = base();
    setSentence(thing, 'Glass sponges can grow to a height of 4 metres in deep water.');
    expect(rules(thing)).toContain('numbers');
    setSentence(thing, 'Some glass sponge reefs are about 9,500 years old.');
    expect(rules(thing)).not.toContain('numbers');
    setSentence(thing, 'Some glass sponge reefs are 9,500 years old.');
    expect(rules(thing)).toContain('numbers');
    setSentence(thing, 'The reefs cover 1 000 square kilometres of the sea floor.');
    expect(rules(thing)).not.toContain('numbers');
  });
  it('number words count from two', () => {
    const { thing } = base();
    setSentence(thing, 'Many species have spicules with seven points and a long stem.');
    expect(rules(thing)).toContain('numbers');
  });
  it('years and periods must be in the source', () => {
    const { thing } = base();
    setSentence(thing, 'Scientists found living reefs in the Hecate Strait in 1990.');
    expect(rules(thing)).toContain('numbers');
    setSentence(thing, 'Scientists found living reefs in the 1980s in the Hecate Strait.');
    expect(rules(thing)).not.toContain('years');
    setSentence(thing, 'Scientists found living reefs in the 18th century in the strait.');
    expect(rules(thing)).toContain('years');
  });
  it('names: a proper noun not in the source fails', () => {
    const { thing } = base();
    setSentence(thing, 'Glass sponge reefs also grow near Tasmania in deep water.');
    expect(rules(thing)).toContain('names');
  });
  it('length: over the pace limit fails', () => {
    const { thing } = base();
    thing.paces.easy[1] = { type: 'sentence', text: 'Glass sponges are sponges with skeletons made of silica and they live in deep water in every ocean.' };
    expect(rules(thing)).toContain('length');
  });
  it('voice lint applies to curated text only', () => {
    const { thing } = base();
    setSentence(thing, 'Did you know that glass sponges live in deep water in every ocean?');
    expect(rules(thing)).not.toContain('voice');
    thing.authoredBy = 'curated';
    expect(rules(thing)).toContain('voice');
  });
  it('blocklist is re-checked against the current list', () => {
    const { thing, packet } = base();
    const ctx = { ...emptyCtx, blocklist: { ...emptyCtx.blocklist, categoryPatterns: [/sponges/i] } };
    expect(verifyThing(thing, packet, ctx).map((i) => i.rule)).toContain('blocklist');
  });
  it('fact integrity: big number must equal its fact', () => {
    const { thing } = base();
    const i = thing.paces.medium.findIndex((p) => p.type === 'bignumber');
    expect(i).toBeGreaterThan(0);
    const pg = thing.paces.medium[i]!;
    if (pg.type === 'bignumber') pg.display = '2 metres';
    expect(rules(thing)).toContain('facts');
  });
  it('source must link the exact revision', () => {
    const { thing } = base();
    thing.sources[0]!.url = 'https://en.wikipedia.org/wiki/Glass_sponge';
    expect(rules(thing)).toContain('attribution');
  });
});

describe('attribution rule for images (approved 2026-10-05)', () => {
  const credit = { author: 'A', authorSource: 'artist' as const, license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0', fileUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg', attribution: null, attributionRequired: true };
  it('CC BY-SA with URL passes', () => expect(checkCredit('i', credit)).toEqual([]));
  it('CC BY / BY-SA without URL fails', () => {
    expect(checkCredit('i', { ...credit, licenseUrl: null }).map((x) => x.message)).toContain('CC BY-SA 4.0 requires a license URL');
    expect(checkCredit('i', { ...credit, license: 'CC BY 3.0', licenseUrl: null })).toHaveLength(1);
  });
  it('Public domain and CC0 may have no URL', () => {
    expect(checkCredit('i', { ...credit, license: 'Public domain', licenseUrl: null })).toEqual([]);
    expect(checkCredit('i', { ...credit, license: 'CC0', licenseUrl: null })).toEqual([]);
  });
  it('the Commons file page is always required', () => {
    expect(checkCredit('i', { ...credit, license: 'Public domain', licenseUrl: null, fileUrl: '' })).toHaveLength(1);
  });
  it('a non-allowlisted license fails', () => {
    expect(checkCredit('i', { ...credit, license: 'CC BY-NC 2.0' }).map((x) => x.rule)).toContain('attribution');
  });
  it('an empty author fails', () => {
    expect(checkCredit('i', { ...credit, author: ' ' })).toHaveLength(1);
  });
});

describe('typography rules', () => {
  it('Swiss German: no ß and no „“', () => {
    const { thing, packet } = base();
    thing.lang = 'de';
    packet.lang = 'de';
    setSentence(thing, 'Die Glasschwämme sind groß und leben im Meer und in der Tiefe.');
    expect(verifyThing(thing, packet, emptyCtx).map((i) => i.rule)).toContain('typography');
  });
});
