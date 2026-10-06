// The review word lists (decision of 2026-10-06), on their own so the Rabbit Trail can screen live
// extracts without importing the verifier. In the daily pipeline a hit sends a thing to human review;
// on a live trail a hit simply drops the candidate.
import type { Lang } from '../typography/typography';

export const W = (words: string) => new RegExp(`(?<![\\p{L}])(${words})(?![\\p{L}])`, 'giu');

export const REVIEW_WORDS: Record<Lang, RegExp> = {
  en: W('bomb|bombs|bombing|bombings|bombed|massacre|massacres|massacred|execution|executions|executed|genocide|genocides|torture|tortured|murder|murders|murdered|assassinated|assassination|terrorism|terrorist|terrorists|atrocity|atrocities|slaughter|slaughtered|rape|raped|corpse|corpses|mass grave|mass graves|holocaust|nuclear weapon|nuclear weapons|atomic bomb|atomic bombs|suicide|war crime|war crimes|ethnic cleansing|lynching|lynched|hallucinogen|hallucinogenic|recreational drug|recreational drugs|narcotic|narcotics|heroin|cocaine'),
  de: W('Bombe|Bomben|bombardiert|Massaker|Hinrichtung|Hinrichtungen|hingerichtet|Völkermord|Genozid|Folter|gefoltert|Mord|Morde|ermordet|Attentat|Terror|Terrorismus|Terroristen|Gräueltaten|Vergewaltigung|vergewaltigt|Leiche|Leichen|Massengrab|Holocaust|Shoah|Atombombe|Atombomben|Atomwaffe|Atomwaffen|Kernwaffe|Kernwaffen|Suizid|Selbstmord|Kriegsverbrechen|Halluzinogen|halluzinogen|halluzinogene|Rauschmittel|Rauschgift|Kokain|Heroin'),
  fr: W('bombe|bombes|bombardement|bombardements|bombardé|massacre|massacres|massacré|massacrés|exécution|exécutions|exécuté|exécutés|exécutée|génocide|génocides|torture|torturé|meurtre|meurtres|assassiné|assassinée|assassinat|terrorisme|terroriste|terroristes|atrocité|atrocités|viol|viols|violée|cadavre|cadavres|charnier|charniers|holocauste|Shoah|arme nucléaire|armes nucléaires|bombe atomique|suicide|crime de guerre|crimes de guerre|hallucinogène|hallucinogènes|stupéfiant|stupéfiants|cocaïne|héroïne'),
};

