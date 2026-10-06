// Screens for review, not rejection (decisions of 2026-10-06):
//  - a word scan over the generated page text: a thing that mentions bombs, massacres, executions,
//    genocide and the like goes to the review queue for a human to read;
//  - an image screen over a file's own Commons categories, description and title: nudity, explosions,
//    corpses, weapons and combat make the image unusable, and the topic falls back to its next image.
// Pure and isomorphic.
import { PACE_IDS } from '../pace/pace';
import type { Thing } from '../schema/thing';
import type { Lang } from '../typography/typography';
import { pageTexts } from '../verify/verify';

const W = (words: string) => new RegExp(`(?<![\\p{L}])(${words})(?![\\p{L}])`, 'giu');

export const REVIEW_WORDS: Record<Lang, RegExp> = {
  en: W('bomb|bombs|bombing|bombings|bombed|massacre|massacres|massacred|execution|executions|executed|genocide|genocides|torture|tortured|murder|murders|murdered|assassinated|assassination|terrorism|terrorist|terrorists|atrocity|atrocities|slaughter|slaughtered|rape|raped|corpse|corpses|mass grave|mass graves|holocaust|nuclear weapon|nuclear weapons|atomic bomb|atomic bombs|suicide|war crime|war crimes|ethnic cleansing|lynching|lynched|hallucinogen|hallucinogenic|recreational drug|recreational drugs|narcotic|narcotics|heroin|cocaine'),
  de: W('Bombe|Bomben|bombardiert|Massaker|Hinrichtung|Hinrichtungen|hingerichtet|Völkermord|Genozid|Folter|gefoltert|Mord|Morde|ermordet|Attentat|Terror|Terrorismus|Terroristen|Gräueltaten|Vergewaltigung|vergewaltigt|Leiche|Leichen|Massengrab|Holocaust|Shoah|Atombombe|Atombomben|Atomwaffe|Atomwaffen|Kernwaffe|Kernwaffen|Suizid|Selbstmord|Kriegsverbrechen|Halluzinogen|halluzinogen|halluzinogene|Rauschmittel|Rauschgift|Kokain|Heroin'),
  fr: W('bombe|bombes|bombardement|bombardements|bombardé|massacre|massacres|massacré|massacrés|exécution|exécutions|exécuté|exécutés|exécutée|génocide|génocides|torture|torturé|meurtre|meurtres|assassiné|assassinée|assassinat|terrorisme|terroriste|terroristes|atrocité|atrocités|viol|viols|violée|cadavre|cadavres|charnier|charniers|holocauste|Shoah|arme nucléaire|armes nucléaires|bombe atomique|suicide|crime de guerre|crimes de guerre|hallucinogène|hallucinogènes|stupéfiant|stupéfiants|cocaïne|héroïne'),
};

export type ScanHit = { pace: string; page: number; word: string; text: string };

/** Every page text of every pace that mentions a review word. */
export function scanThing(thing: Thing): ScanHit[] {
  const hits: ScanHit[] = [];
  const re = REVIEW_WORDS[thing.lang];
  for (const pace of PACE_IDS) {
    thing.paces[pace].forEach((pg, i) => {
      for (const { text } of pageTexts(pg)) {
        for (const m of text.matchAll(re)) hits.push({ pace, page: i + 1, word: m[1]!.toLowerCase(), text });
      }
    });
  }
  return hits;
}

// Matched against an image file's Commons categories, description and title (all lower-cased, English
// mostly: Commons categories are in English). A hit makes the image unusable for Margin.
export const IMAGE_SENSITIVE = W(
  [
    'nude|nudes|nudity|naked|nakedness|nudism|naturism|naturist|nus|nue|nues|nackt|akt|erotic|erotica|sexual|sex|pornography',
    'explosion|explosions|mushroom cloud|mushroom clouds|nuclear test|nuclear tests|nuclear weapon tests|nuclear explosions|atomic bomb|bombing|bombings',
    'corpse|corpses|dead bodies|dead body|cadaver|cadavers|human remains|mummies|mummy|skulls of humans|death masks|executions|execution|hanging|hangings|gallows',
    'weapon|weapons|firearm|firearms|gun|guns|rifle|rifles|pistol|pistols|revolver|revolvers|cannon|cannons|missile|missiles|ammunition',
    'combat|battle|battles|battlefield|battlefields|warfare|war casualties|war dead|wounded|injuries|blood|gore|torture|massacre|massacres',
  ].join('|'),
);

export function screenImageMeta(fields: { categories: string; description: string; objectName: string }): string[] {
  const text = [fields.categories.replace(/\|/g, ' · '), fields.description, fields.objectName].join(' · ');
  return [...new Set([...text.matchAll(IMAGE_SENSITIVE)].map((m) => m[1]!.toLowerCase()))];
}
