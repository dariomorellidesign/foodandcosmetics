import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/worker.mjs';

const env={};
async function rpc(method,params={},id=1){
  const response=await worker.fetch(new Request('https://food.example/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})}),env);
  assert.equal(response.status,200);return (await response.json()).result;
}
test('health is remote catalog mode',async()=>{const r=await worker.fetch(new Request('https://food.example/health'),env);assert.equal((await r.json()).mode,'remote_public_catalog');});
test('real MCP transport initializes and advertises all read-only tools and UI resource',async()=>{
  const init=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}});
  assert.equal(init.serverInfo.name,'Food & Cosmetics');
  const {tools}=await rpc('tools/list');assert.equal(tools.length,10);assert(tools.every(t=>t.annotations.readOnlyHint));
  const render=tools.find(t=>t.name==='render_product_report');assert.equal(render._meta.ui.resourceUri,'ui://food-and-cosmetics/report-v1.html');
  const resource=await rpc('resources/read',{uri:render._meta.ui.resourceUri});
  assert.equal(resource.contents[0].mimeType,'text/html;profile=mcp-app');assert(resource.contents[0].text.includes('Food & Cosmetics'));
  assert.deepEqual(resource.contents[0]._meta.ui.csp.connectDomains,[]);
});
test('invalid barcode and missing report input return actionable tool errors',async()=>{
  const error=await rpc('tools/call',{name:'lookup_product',arguments:{barcode:'12345678'}});assert.equal(error.isError,true);assert.equal(error.structuredContent.error.code,'INVALID_BARCODE');
  const missing=await rpc('tools/call',{name:'render_product_report',arguments:{view:'ranking'}});assert.equal(missing.structuredContent.error.code,'CATEGORY_REQUIRED');
});
