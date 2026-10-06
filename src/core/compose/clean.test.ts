import { describe, expect, it } from 'vitest';
import { cleanSentence, danglingPronoun, fitToWords } from './clean';

describe('cleanSentence', () => {
  it('drops parentheticals', () => {
    expect(cleanSentence('Ada Lovelace (10 December 1815 – 27 November 1852) was a mathematician.')).toBe('Ada Lovelace was a mathematician.');
  });
  it('rejects lists of abbreviations', () => {
    expect(cleanSentence('Synonyms include P. l. persica, P. l. senegalensis, P. l. kamptzi, and P. l. azandica.')).toBeNull();
  });
  it('rejects compounds broken by a removed parenthetical, keeps suspended hyphens', () => {
    expect(cleanSentence('Der Hopewell- (100 v. Chr.) folgte die Whittlesey-Kultur.')).toBeNull();
    expect(cleanSentence('Die Hopewell- und Adena-Kultur waren älter als diese.')).not.toBeNull();
  });
});

describe('danglingPronoun', () => {
  it('catches pronouns at the start and early in the sentence', () => {
    expect(danglingPronoun('It was built in 1889.', 'en')).toBe(true);
    expect(danglingPronoun('By 1804 he had produced 18 etchings.', 'en', 'Caspar David Friedrich')).toBe(true);
    expect(danglingPronoun('Lorsqu’elle revient, elle doit les défaire.', 'fr', 'Ornithorynque')).toBe(true);
  });
  it('accepts sentences that name the topic first', () => {
    expect(danglingPronoun('Friedrich settled in Dresden, where he lived.', 'en', 'Friedrich')).toBe(false);
    expect(danglingPronoun('Males are larger than females.', 'en', 'Electric eel')).toBe(false);
  });
});

describe('fitToWords', () => {
  it('never leaves an open relative clause', () => {
    const s = 'Caspar David Friedrich was a German Romantic landscape painter, generally considered the most important German artist of his generation, whose often symbolic, and anti-classical work, conveys a subjective, emotional response to the natural world.';
    const r = fitToWords(s, 25, 'en');
    expect(r?.text ?? '').not.toMatch(/whose often symbolic\.$/);
  });
  it('cuts at a clause boundary when it can', () => {
    expect(fitToWords('The tower was finished in 1889, and it was the tallest structure in the world for many years after that.', 8, 'en')).toEqual({ text: 'The tower was finished in 1889.', truncated: true });
  });
});

// Cases found by the automatic quality report of 2026-10-06 (real sentences from the baked batch).
import { cutDefinition, definitionComplement, isDefinition, proseForSplitting } from './clean';
import { splitSentences } from '../text/sentences';

describe('quality-report regressions', () => {
  it('keeps the space after German closing quotes (Beteigeuze)', () => {
    expect(proseForSplitting('mit „B-“ statt „Y-“ ist auf einen „historischen Rechtschreibfehler“ zurückzuführen.'))
      .toBe('mit „B-“ statt „Y-“ ist auf einen „historischen Rechtschreibfehler“ zurückzuführen.');
    expect(proseForSplitting('its German name, "Urvogel " is')).toBe('its German name, "Urvogel" is');
  });
  it('recognises definitions across ß/ss, plural copulas and leading parentheses', () => {
    expect(isDefinition('Der Weisse Hai, seltener auch als Weisshai bezeichnet, ist die einzige Art der Gattung.', 'de', 'Weißer Hai')).toBe(true);
    expect(isDefinition('Die Kürbisse bilden eine Pflanzengattung innerhalb der Familie der Kürbisgewächse.', 'de', 'Kürbisse')).toBe(true);
    expect(isDefinition('Ceres ist der grösste Himmelskörper im Asteroidengürtel.', 'de', '(1) Ceres')).toBe(true);
  });
  it('does not split at "Sgt." in German', () => {
    expect(splitSentences('Sgt. Pepper’s Lonely Hearts Club Band ist das achte Studioalbum der Beatles.', 'de')).toHaveLength(1);
  });
  it('cuts a long definition after its predicate (Caspar David Friedrich, fr)', () => {
    expect(cutDefinition('Caspar David Friedrich est un peintre et dessinateur allemand, considéré comme le plus important artiste romantique de son pays.', 'fr', 15))
      .toBe('Caspar David Friedrich est un peintre et dessinateur allemand.');
  });
  it('takes the title line from the definition when Wikidata has none (Sel alimentaire)', () => {
    expect(definitionComplement('Le sel alimentaire est un condiment composé essentiellement de chlorure de sodium.', 'fr')).toBe('Un condiment composé essentiellement de chlorure de sodium');
  });
  it('drops chronology items and verbless cuts (Zwingli, Wollstonecraft)', () => {
    expect(cleanSentence('1506-1516 : curé de la ville de Glaris.')).toBeNull();
    const r = fitToWords('Mary Wollstonecraft, née le 27 avril 1759 à Spitalfields, un quartier du Grand Londres, et morte le 10 septembre 1797 à Londres, est une maîtresse d’école, femme de lettres, philosophe et féministe anglaise du XVIIIe siècle.', 15, 'fr');
    expect(r?.text ?? '').not.toBe('Mary Wollstonecraft, née le 27 avril 1759 à Spitalfields, un quartier du Grand Londres.');
  });
});

describe('clause cuts keep a verb (quality report, 2026-10-06)', () => {
  it('refuses verbless heads', () => {
    for (const [s, lang] of [
      ['Until the late twentieth century, Wollstonecraft’s life, which encompassed several unconventional personal relationships, received more attention than her writing.', 'en'],
      ['The common starling, also known simply as the starling in Great Britain and Ireland, is a medium-sized passerine bird in the starling family.', 'en'],
    ] as const) {
      const r = fitToWords(s, 15, lang);
      expect(r === null || !/^(Until the late twentieth century, Wollstonecraft’s life|The common starling, also known simply as the starling in Great Britain and Ireland)\.$/.test(r.text), r?.text).toBe(true);
    }
  });
});

describe('whole sentences need a verb too', () => {
  it('rejects bibliography entries (Joseph Priestley, de)', async () => {
    const { hasFiniteVerb } = await import('./clean');
    expect(hasFiniteVerb('2 Bände, Hunter, London 1831.', 'de')).toBe(false);
    expect(hasFiniteVerb('Rigel ist Teil des Wintersechsecks.', 'de')).toBe(true);
  });
});
