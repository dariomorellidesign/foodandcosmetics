import test from 'node:test';
import assert from 'node:assert/strict';
import {Catalog,validBarcode,grade,DEFAULT_CATALOG} from '../dist/catalog.mjs';

const code='0000000000000';
const product={type:'food',barcode:code,record_id:'sample',data:{name:'Sample',grade:20,category:'test',additives:[]},source:{snapshot_date:'2026-10-18'},assessment:{},warnings:[]};
const ranking={type:'food',category:'test',rules_version:'source-rating/1.0.0',criterion:'source_reported_grade_not_recomputed',scope:'exact_source_category_in_this_snapshot_only',tie_break:'barcode_ascending',total_products:4,eligible_products:3,excluded_missing_or_unusable_rating:1,
  best:[{barcode:'1',rating:90},{barcode:code,rating:20},{barcode:'2',rating:20}],worst:[{barcode:code,rating:20},{barcode:'2',rating:20},{barcode:'1',rating:90}]};
function mock(routes){let calls=[];const catalog=new Catalog(DEFAULT_CATALOG,async url=>{calls.push(url);const key=new URL(url).pathname.replace('/foodandcosmetics/','');return key in routes?Response.json(routes[key]):new Response('',{status:404});});return {catalog,calls};}
const path=`data/food/000/00/${code}.json`;

test('barcode strings keep zeros; invalid input never reaches network',async()=>{
  assert(validBarcode(code));assert(!validBarcode('8015854330022'));assert(!validBarcode('８０１５８５４３３００２１'));assert(!validBarcode('../private'));
  const {catalog,calls}=mock({});await assert.rejects(catalog.product('bad'),{code:'INVALID_BARCODE'});assert.equal(calls.length,0);
});
test('lookup is cloud-only and missing product is explicit',async()=>{
  const {catalog,calls}=mock({[path]:product});assert.deepEqual(await catalog.product(code),product);assert.equal(calls[0],DEFAULT_CATALOG+'/'+path);
  const missing=mock({}).catalog;await assert.rejects(missing.product(code),{code:'NOT_FOUND'});
  assert.throws(()=>new Catalog('http://localhost:8000'),{code:'CONFIGURATION'});
});
test('identity mismatch and source failure do not become invented products',async()=>{
  await assert.rejects(mock({[path]:{...product,barcode:'wrong'}}).catalog.product(code),{code:'SOURCE_INVALID'});
  const catalog=new Catalog(DEFAULT_CATALOG,async()=>{throw Error('offline');});await assert.rejects(catalog.product(code),{code:'SOURCE_UNAVAILABLE'});
});
test('missing is not zero; source grade is never a reconstructed breakdown',async()=>{
  assert.equal(grade({...product,data:{grade:0}}),0);assert.equal(grade({...product,data:{grade:null}}),null);
  assert.equal(grade({...product,data:{grade:80,gradeForbidden:true}}),null);assert.equal(grade({...product,data:{grade:true}}),null);
  const {catalog}=mock({[path]:product});const b=await catalog.breakdown(code);
  assert.equal(b.overall.value,20);assert.equal(b.nutrition.value,null);assert.equal(b.additives.absence_verified,false);
  assert.equal(b.overall.status,'source_reported_not_recomputed');assert.deepEqual(b,await catalog.breakdown(code));
});
test('ranking and alternatives use exact category, strict improvement and documented exclusions',async()=>{
  const {catalog,calls}=mock({[path]:product,'indexes/food/test.json':ranking});
  const r=await catalog.ranking('test','food','worst',2);assert.deepEqual(r.products.map(p=>p.rating),[20,20]);assert.equal(r.excluded_missing_or_unusable_rating,1);
  const a=await catalog.alternatives(code);assert.deepEqual(a.products,[{barcode:'1',rating:90}]);assert.equal(a.similarity,'heuristic_exact_source_category');
  await assert.rejects(catalog.ranking('../x'),{code:'INVALID_CATEGORY'});assert(calls.every(u=>u.startsWith(DEFAULT_CATALOG+'/')));
});
test('missing baseline never yields a better-product claim; duplicate comparisons rejected',async()=>{
  const {catalog}=mock({[path]:{...product,data:{category:'test',grade:null}}});assert.deepEqual((await catalog.alternatives(code)).products,[]);
  await assert.rejects(catalog.report([code,code]),{code:'INVALID_COMPARISON'});
});
test('additive explanation uses separate taxonomy provenance and no hazard penalty',async()=>{
  const {catalog}=mock({'reference/additives.json':{entries:{'en:e471':{names:{it:'Mono e digliceridi'},classes:['en:emulsifier']}},source:{version:'off-additives/test'}}});
  const a=await catalog.explain('E471');assert.equal(a.found,true);assert.equal(a.source.version,'off-additives/test');assert.equal(a.risk_score,undefined);
  assert.equal((await catalog.explain('E9999')).found,false);
});
