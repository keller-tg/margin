import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composeExtractive } from '../compose/compose';
import { fixturePacket } from '../compose/testing';
import { scanThing, screenImageMeta } from './scan';

// The category files are configuration (content/blocklist/), read here to test the decided rules.
const patterns = (lang: string) =>
  readFileSync(join(import.meta.dirname, `../../../content/blocklist/categories.${lang}.txt`), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((r) => new RegExp(r, 'iu'));
const blocks = (lang: string, cat: string) => patterns(lang).some((re) => re.test(cat));

describe('narrow category rules (decision of 2026-10-06)', () => {
  it('no longer block biographies or substance classes (Fauré, Achebe, Armstrong, xenon)', () => {
    expect(blocks('en', 'French military personnel of the Franco-Prussian War')).toBe(false);
    expect(blocks('en', 'People of the Nigerian Civil War')).toBe(false);
    expect(blocks('de', 'Person im Koreakrieg (Vereinigte Staaten)')).toBe(false);
    expect(blocks('de', 'Psychotroper Wirkstoff')).toBe(false);
    expect(blocks('en', 'Battles of the Napoleonic Wars')).toBe(false); // war history: word scan → review, not a block
  });
  it('still block the four narrow kinds', () => {
    expect(blocks('en', 'Pornography')).toBe(true);
    expect(blocks('en', 'Entheogens')).toBe(true);
    expect(blocks('en', 'Illegal drug trade in Mexico')).toBe(true);
    expect(blocks('en', 'Massacres in Germany')).toBe(true);
    expect(blocks('de', 'Völkermord')).toBe(true);
    expect(blocks('fr', 'Attentat islamiste en France')).toBe(true);
    expect(blocks('fr', 'Nudité')).toBe(true);
    expect(blocks('en', 'Political scandals in the United States')).toBe(true);
  });
});

describe('word scan → review queue', () => {
  it('finds review words in generated pages, with page and text', () => {
    const { thing } = composeExtractive(fixturePacket());
    expect(scanThing(thing)).toEqual([]);
    thing.paces.deep[2] = { type: 'sentence', text: 'In 1944 the reef was damaged when a bomb fell into the strait.' };
    expect(scanThing(thing)).toEqual([{ pace: 'deep', page: 3, word: 'bomb', text: 'In 1944 the reef was damaged when a bomb fell into the strait.' }]);
  });
  it('matches whole words only', () => {
    const { thing } = composeExtractive(fixturePacket());
    thing.paces.deep[2] = { type: 'sentence', text: 'The bombardier beetle sprays a hot chemical from its abdomen when disturbed.' };
    expect(scanThing(thing)).toEqual([]);
  });
});

describe('image screen (Commons categories, description, title)', () => {
  it('catches the Trinity test photograph (recorded categories, 2026-10-06)', () => {
    const hits = screenImageMeta({
      categories: 'Mushroom clouds|Trinity test|Nuclear weapon tests|Jack Aeby|PD US DOE|World War II famous photographs',
      description: 'Trinity shot color', objectName: 'Trinity shot color',
    });
    expect(hits).toEqual(expect.arrayContaining(['mushroom clouds', 'nuclear weapon tests']));
  });
  it('passes an ordinary photograph (Electric-eel.jpg, recorded categories)', () => {
    expect(screenImageMeta({
      categories: 'Electrophorus electricus|GFDL|Taken with Fujifilm FinePix F440|Fishes at the New England Aquarium',
      description: 'Electric eel', objectName: 'Electric-eel',
    })).toEqual([]);
  });
  it('known limit: the sculpture behind fr "Nudité" carries no signal in its metadata', () => {
    // recorded 2026-10-06: the topic blocklist caught it, the image screen alone would not
    expect(screenImageMeta({
      categories: 'Taken with Sony DSC-P72|CC-Zero|Self-published work|PD-self|Photographs by Henk van Gaal|Ontdekkende Kinderen (Joanika Ring)',
      description: 'Enfants à la découverte (Joanika Ring, Overlangel 1995)', objectName: 'Enfants à la découverte (Joanika Ring, Overlangel 1995)',
    })).toEqual([]);
  });
});

describe('xenon-style substance categories stay allowed', () => {
  it('"Experimental hallucinogens" (xenon, en) does not block', () => {
    expect(blocks('en', 'Experimental hallucinogens')).toBe(false);
    expect(blocks('fr', 'Champignon hallucinogène')).toBe(false); // the page itself goes through the word scan
  });
});
