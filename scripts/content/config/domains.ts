// Maps a Vital Articles (Level 4) heading path "Page > H2 > H3" to a Margin domain.
// First matching rule wins. `exclude` implements the content policy at the list level
// (graphic violence, explicit sexual content, drug use, live political controversy);
// finer checks (titles, categories) happen at pick time against content/blocklist/.
import type { Domain } from '../../../src/core/schema/thing';

type Rule = { re: RegExp; domain: Domain | 'excluded'; evening?: boolean; abstract?: boolean };

export const RULES: Rule[] = [
  // --- policy exclusions
  { re: /^People > (Criminals|Military leaders|Rebels|Politicians and leaders)/, domain: 'excluded' },
  { re: /^Society and social sciences > (War and military|Politics and government|Law)/, domain: 'excluded' },
  { re: /^Society and social sciences > Society > Issues/, domain: 'excluded' },
  { re: /^Technology > Military technology/, domain: 'excluded' },
  { re: /^Biology and health sciences > Health, medicine and disease > Drugs and pharmacology/, domain: 'excluded' },
  { re: /^Everyday life > Stages of life/, domain: 'excluded' },
  { re: /^Society and social sciences > Sociology/, domain: 'excluded' },
  { re: /^Arts > .*Fictional and legendary characters > Superheroes/, domain: 'excluded' },

  // --- gentle, concrete (evening-eligible)
  { re: /^Biology and health sciences > Organisms > Animals/, domain: 'animals', evening: true },
  { re: /^Biology and health sciences > Organisms > (Plants|Fungi)/, domain: 'plants', evening: true },
  { re: /^Everyday life > Cooking, food and drink > (Food types|Drinks)/, domain: 'food', evening: true },
  { re: /^Everyday life > Cooking, food and drink/, domain: 'food', evening: true, abstract: true },
  { re: /^Arts > Music > Musical instruments/, domain: 'instruments', evening: true },
  { re: /^Physical sciences > Chemistry > Chemical substances/, domain: 'chemistry', evening: true },
  { re: /^Physical sciences > Earth science > Earth/, domain: 'earth', evening: true },
  { re: /^Geography > Physical geography > (Islands|Peninsulas)/, domain: 'islands', evening: true },
  { re: /^Geography > Physical geography > (Mountain peaks|Land relief|Deserts|Forests|Parks and preserves)/, domain: 'landscapes', evening: true },
  { re: /^Geography > Physical geography > (Bodies of water|Other hydrologic features)/, domain: 'water', evening: true },
  { re: /^Everyday life > (Household items|Clothing and fashion|Housing)/, domain: 'household', evening: true },
  { re: /^Technology > Industry > (Tools|Machinery)/, domain: 'tools', evening: true },
  { re: /^Technology > Navigation and timekeeping/, domain: 'tools', evening: true },
  { re: /^Technology > Optical technology/, domain: 'tools', evening: true },
  { re: /^Technology > Textiles/, domain: 'household', evening: true },
  { re: /^Physical sciences > Astronomy > (Astronomical objects|Stellar astronomy|Planetary science)/, domain: 'astronomy', evening: true },

  // --- substantial (morning)
  { re: /^People > Scientists/, domain: 'people-science' },
  { re: /^People > (Visual artists|Musicians|Writers|Entertainers|Directors|Journalists)/, domain: 'people-arts' },
  { re: /^People > (Explorers|Businesspeople|Philosophers|Religious figures|Sports figures)/, domain: 'people-other' },
  { re: /^People/, domain: 'people-other' },
  { re: /^History > Historical cities/, domain: 'cities' },
  { re: /^History/, domain: 'history' },
  { re: /^Geography > Cities/, domain: 'cities' },
  { re: /^Geography > Countries and other regions/, domain: 'places' },
  { re: /^Geography > Physical geography > (Continents|Earth)/, domain: 'places', abstract: true },
  { re: /^Geography/, domain: 'places', abstract: true },
  { re: /^Arts > Architecture > Specific structures/, domain: 'architecture' },
  { re: /^Arts > (Architecture|Cultural venues)/, domain: 'architecture', abstract: true },
  { re: /^Arts > Literature > Specific works/, domain: 'literature' },
  { re: /^Arts > Literature/, domain: 'literature', abstract: true },
  { re: /^Arts > Music > Specific musical works/, domain: 'music' },
  { re: /^Arts > Music/, domain: 'music', abstract: true },
  { re: /^Arts > Visual arts > .*Specific works/, domain: 'art' },
  { re: /^Arts > (Visual arts|Performing arts|Arts: General)/, domain: 'art', abstract: true },
  { re: /^Arts > Film and television > Specific/, domain: 'film' },
  { re: /^Arts > Film and television/, domain: 'film', abstract: true },
  { re: /^Arts > .*Fictional/, domain: 'myth' },
  { re: /^Philosophy and religion > Religion and spirituality > Mythology/, domain: 'myth' },
  { re: /^Philosophy and religion > Religion/, domain: 'religion', abstract: true },
  { re: /^Philosophy and religion/, domain: 'philosophy', abstract: true },
  { re: /^Everyday life > Sports and recreation/, domain: 'sport' },
  { re: /^Everyday life/, domain: 'household', abstract: true },
  { re: /^Society and social sciences > Language > Writing systems/, domain: 'language' },
  { re: /^Society and social sciences > Language/, domain: 'language', abstract: true },
  { re: /^Society and social sciences/, domain: 'society', abstract: true },
  { re: /^Biology and health sciences > Health, medicine and disease/, domain: 'medicine' },
  { re: /^Biology and health sciences > Organisms/, domain: 'biology' },
  { re: /^Biology and health sciences/, domain: 'biology', abstract: true },
  { re: /^Physical sciences > Astronomy/, domain: 'astronomy', abstract: true },
  { re: /^Physical sciences > Earth science/, domain: 'earth' },
  { re: /^Physical sciences > Chemistry/, domain: 'chemistry', abstract: true },
  { re: /^Physical sciences/, domain: 'physics', abstract: true },
  { re: /^Technology > (Space|Transportation)/, domain: 'technology' },
  { re: /^Technology/, domain: 'technology', abstract: true },
  { re: /^Mathematics/, domain: 'mathematics', abstract: true },
];

export function classify(path: string): { domain: Domain | 'excluded'; evening: boolean; abstract: boolean } {
  // "Basics" / "General" headings are the abstract backbone of every list
  const generic = /> (Basics|[^>]*: General|Basic concepts|Basics: General)( >|$)/.test(path);
  for (const r of RULES) {
    if (r.re.test(path)) return { domain: r.domain, evening: Boolean(r.evening) && !generic, abstract: Boolean(r.abstract) || generic };
  }
  return { domain: 'excluded', evening: false, abstract: true };
}
