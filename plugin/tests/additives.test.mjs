import test from 'node:test';
import assert from 'node:assert/strict';
import {Catalog,DEFAULT_CATALOG,additiveDetail,inventory,filterDecision} from '../dist/catalog.mjs';
const code='0000000000000';
const product=(barcode=code,additives=[])=>({type:'food',barcode,record_id:'test',data:{name:'Test',grade:10,category:'test',additives},source:{},assessment:{},warnings:[]});
const path=b=>`data/food/${b.slice(0,3)}/${b.slice(3,5)}/${b}.json`;
function mock(routes){return new Catalog(DEFAULT_CATALOG,async url=>{const key=new URL(url).pathname.replace('/foodandcosmetics/','');return key in routes?Response.json(routes[key]):new Response('',{status:404});});}
function gtin(n){const s=String(n).padStart(12,'0');const sum=[...s].reverse().reduce((v,x,i)=>v+Number(x)*(i%2===0?3:1),0);return s+((10-sum%10)%10);}
test('source claims remain unvalidated; no numeric risk or invented description',()=>{
  const x=additiveDetail('E471');assert.equal(x.source_assessment_status,'not_independently_validated');
  assert.equal(x.official_review.attention_flag,false);assert(x.source_assessment.riskCharacterization.includes('suspected_carcinogen'));
  assert.equal(x.status,'flagged_for_attention');assert.equal(x.product_exposure.individual_risk,'not_assessable');
  assert.equal(x.source_description_text,null);assert.equal(x.risk_score,undefined);assert.equal(x.danger_level_interpretation,'opaque_source_value_not_mapped');
  assert(x.source_assessment.sources.length>0);
});
test('hazard and exposure stay separate; ADIs retain substance basis',()=>{
  const a=additiveDetail('E951');assert.equal(a.official_review.hazard.iarc_group,'2B');assert.equal(a.official_review.adi.value,40);
  assert.equal(additiveDetail('E450').official_review.adi.expressed_as,'phosphorus');
  assert.equal(additiveDetail('E250').official_review.adi.expressed_as,'nitrite ion');
  assert.equal(additiveDetail('E202').official_review.adi.expressed_as,'sorbic acid');
  assert.equal(additiveDetail('E171').official_review.status,'eu_food_authorisation_withdrawn');
});
test('missing/unknown/generic never become safe; empty only means none listed',()=>{
  for(const x of [null,undefined,'',{},['']]){assert.equal(inventory(x).status,'missing_or_invalid');assert.equal(filterDecision(x,'none_listed',[]).pass,false);}
  assert.equal(inventory([]).absence_verified,false);assert.equal(filterDecision([],'none_listed',[]).pass,true);
  for(const x of ['GEN_13','E9999'])assert.equal(filterDecision([x],'no_flagged',[]).pass,false);
  assert.equal(additiveDetail('GEN_13').identity_status,'unresolved');
  assert.equal(filterDecision(['E330'],'no_flagged',[]).pass,true);assert.equal(additiveDetail('E330').official_review,null);
  assert.equal(filterDecision(['E471'],'no_flagged',[]).pass,false);
  assert.equal(filterDecision(['E330'],'any',['E330']).pass,false);
  assert.equal(additiveDetail('E450(i)').code,'E450I');assert.equal(additiveDetail('E450(i)').official_review,null);
});
test('category filter searches every candidate, including after the unfiltered top 100',async()=>{
  const candidates=Array.from({length:120},(_,i)=>[gtin(i+1),i===119?10:90,i===119?[]:['E471']]);
  const winner=candidates[119][0];
  const index={type:'food',category:'test',rules_version:'source-rating/1.0.0',total_products:120,eligible_products:120,
    best:[{barcode:candidates[0][0],rating:90}],worst:[],candidates_schema:'additive-candidates/1.0.0',candidates};
  const c=mock({'indexes/food/test.json':index,[path(winner)]:product(winner)});
  const x=await c.ranking('test','food','best',5,'none_listed');
  assert.equal(x.products[0].barcode,winner);assert.equal(x.filter.matched_products,1);assert.equal(x.filter.excluded_by_reason.listed_additives,119);
  assert.equal(x.products[0].additive_check.absence_verified,false);
  assert.deepEqual(x,await c.ranking('test','food','best',5,'none_listed'));
});
test('filtered ranking preserves zero, excludes missing grades and rejects unsupported filters/indexes',async()=>{
  const b=gtin(1),p=product(b,['E330']);p.data.grade=0;
  const index={type:'food',category:'test',rules_version:'source-rating/1.0.0',total_products:3,eligible_products:2,best:[],worst:[],candidates_schema:'additive-candidates/1.0.0',candidates:[[b,0,['E330']],[gtin(2),null,[]],[gtin(3),90,['GEN_13']]]};
  const c=mock({'indexes/food/test.json':index,[path(b)]:p});const x=await c.ranking('test','food','worst',5,'no_flagged');
  assert.equal(x.products[0].rating,0);assert.equal(x.filter.matched_products,2);assert.equal(x.filter.rankable_matches,1);assert.equal(x.filter.excluded_by_reason.unresolved_additives,1);
  await assert.rejects(c.ranking('test','cosmetics','best',5,'no_flagged'),{code:'INVALID_FILTER'});
  await assert.rejects(c.ranking('test','food','best',5,'wrong'),{code:'INVALID_FILTER'});
  await assert.rejects(c.ranking('test','food','best',5,'any',['javascript:alert(1)']),{code:'INVALID_FILTER'});
  delete index.candidates_schema;await assert.rejects(mock({'indexes/food/test.json':index}).ranking('test','food','best',5,'none_listed'),{code:'SOURCE_INVALID'});
});
test('normal report includes evidence and coverage without an additive score',async()=>{
  const x=await mock({[path(code)]:product(code,['E466','GEN_13'])}).report([code]);
  const a=x.products[0].additive_analysis;assert.equal(a.coverage.source_entries,683);assert.equal(a.coverage.independently_reviewed_entries,7);
  assert.equal(a.details[0].official_review.studies[0].participants,16);assert.deepEqual(a.unresolved,['GEN_13']);
  assert.equal(a.value,undefined);assert.equal(a.absence_verified,false);
});
