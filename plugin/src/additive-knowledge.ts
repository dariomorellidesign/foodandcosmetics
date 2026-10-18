import sourceData from '../../reference/additive-source-assessments.json';
import evidenceData from '../../reference/additive-evidence.json';

export const KNOWLEDGE_VERSION='additive-knowledge/1.0.0';
export const FILTER_VERSION='additive-filter/1.0.0';
export type AdditiveFilter='any'|'none_listed'|'no_flagged';
const source=sourceData as any, evidence=evidenceData as any;
export const coverage={source_entries:Object.keys(source.entries).length,source_with_flags:source.audit.with_source_flags,
  source_with_bibliography:source.audit.with_bibliography,independently_reviewed_entries:Object.keys(evidence.entries).length,
  reviewed_at:evidence.reviewed_at,knowledge_version:KNOWLEDGE_VERSION};
export function canonicalAdditive(value:unknown):string|null {
  if(typeof value!=='string')return null;
  const key=value.replace(/^en:/i,'').replace(/[\s()-]/g,'').toUpperCase();
  return /^E[0-9]{3,4}[A-Z]*$/.test(key)?key:null;
}
export function additiveDetail(value:unknown) {
  const code=canonicalAdditive(value),raw=source.entries[code??String(value)],review=evidence.entries[code??'']??null;
  const flags=raw?.source_assessment?.riskCharacterization??[];
  const identified=Boolean(code && raw);
  const flagged=flags.length>0 || review?.attention_flag===true;
  return {code:code??String(value),identity_status:code?'e_code':'unresolved',found:Boolean(raw||review),
    names:raw?.names??{},functions:raw?.functions??[],
    status:!identified?'unresolved':flagged?'flagged_for_attention':'no_flags_in_available_reference_not_a_safety_clearance',
    source_assessment:raw?.source_assessment??null,source_assessment_status:'not_independently_validated',
    source_description_text:null,danger_level_interpretation:'opaque_source_value_not_mapped',
    source_provenance:source.source,official_review:review,reviewed_at:review?evidence.reviewed_at:null,
    attention_flag_origin:'our_selection_heuristic_not_an_official_risk_classification',
    evidence_scope:evidence.scope,product_exposure:{status:'unknown',concentration:null,individual_risk:'not_assessable'},
    dossier_url:raw?`https://dariomorellidesign.github.io/foodandcosmetics/additives/${code??String(value)}.html`:null,
    knowledge_version:KNOWLEDGE_VERSION};
}
export function inventory(values:unknown) {
  const valid=Array.isArray(values) && values.every(x=>typeof x==='string' && x.trim().length>0);
  const details=valid?[...new Set(values as string[])].map(additiveDetail):[];
  return {status:!valid?'missing_or_invalid':details.length?'listed':'empty_unverified',absence_verified:false,
    flagged:details.filter(x=>x.status==='flagged_for_attention').map(x=>x.code),
    unresolved:details.filter(x=>x.status==='unresolved').map(x=>x.code),
    independently_reviewed:details.filter(x=>x.official_review).length,details,coverage};
}
export function filterDecision(values:unknown,mode:AdditiveFilter,exclude:string[]) {
  const inv=inventory(values);
  if(mode==='any' && !exclude.length)return {pass:true,reason:'not_filtered'};
  if(inv.status==='missing_or_invalid')return {pass:false,reason:'missing_inventory'};
  if(mode==='none_listed' && inv.details.length)return {pass:false,reason:'listed_additives'};
  // All restrictive filters reject unidentified entries: unknown cannot mean acceptable.
  if(inv.unresolved.length)return {pass:false,reason:'unresolved_additives'};
  if(inv.details.some(x=>exclude.includes(x.code)))return {pass:false,reason:'explicit_exclusion'};
  if(mode==='no_flagged' && inv.flagged.length)return {pass:false,reason:'flagged_additives'};
  return {pass:true,reason:'matches_inventory_filter_only'};
}
export const filterLabels:Record<AdditiveFilter,string>={any:'Tutti i prodotti',none_listed:'Nessun additivo elencato nella fonte',no_flagged:'Nessun additivo con segnalazioni nei riferimenti disponibili'};
export const FILTER_CAVEAT='Filtro sul solo elenco del catalogo: non verifica assenza sulla confezione né sicurezza individuale. No_flagged usa segnalazioni della fonte (non validate) O criticità delle 7 schede verificate; nessuna segnalazione non significa innocuità. Elenchi vuoti ammessi ma non certificati; dati mancanti e codici non risolti esclusi.';
