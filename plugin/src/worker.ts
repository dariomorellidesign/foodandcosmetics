import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { Catalog, CatalogError, DEFAULT_CATALOG } from './catalog';
import reportHtml from '../dist/report.html';

export interface Env { CATALOG_URL?: string }
const URI='ui://food-and-cosmetics/report-v1.html';
const kind=z.enum(['food','cosmetics']).default('food');
const barcode=z.string().min(8).max(14).describe('GTIN come stringa, conservando gli zeri iniziali.');
const productInput={barcode,kind};
const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true};
const result=(value:any)=>({content:[{type:'text' as const,text:JSON.stringify(value)}],structuredContent:value});
const guarded=(fn:(args:any)=>Promise<any>)=>async(args:any)=>{
  try{return result(await fn(args));}
  catch(e){const error=e instanceof CatalogError?e:new CatalogError('INTERNAL_ERROR','Analisi temporaneamente non disponibile.');
    return {...result({error:{code:error.code,message:error.message}}),isError:true};}
};

export function createServer(catalog:Catalog) {
  const server=new McpServer({name:'Food & Cosmetics',version:'1.0.0'}, {
    instructions:'Consulta il catalogo pubblico remoto. Rispondi in italiano. Per schede, confronti o classifiche usa render_product_report per mostrare il report grafico. Puoi usare prima list_categories. Il voto è riportato dalla fonte: non presentarlo come score ufficiale o come nostra valutazione. Non inventare componenti del voto, nutrienti mancanti, unità o rischi di additivi. Alternative = stessa categoria esatta e voto maggiore, non idoneità dietetica verificata. Specifica sempre che le classifiche riguardano questa istantanea.',
  });
  const tool=(name:string,description:string,inputSchema:any,fn:(args:any)=>Promise<any>)=>server.registerTool(name,{description,inputSchema,annotations,_meta:{ui:{visibility:['model','app']}}},guarded(fn));
  tool('lookup_product','Scheda pubblica da barcode; nessuna lettura del computer locale.',productInput,a=>catalog.product(a.barcode,a.kind));
  tool('analyze_product','Report strutturato con dati, voto riportato e limiti. Per la grafica usa render_product_report.',productInput,a=>catalog.report([a.barcode],a.kind));
  tool('get_scoring_breakdown','Distingue voto riportato, inventario additivi e dimensioni non calcolabili. Non ricostruisce il voto della fonte.',productInput,a=>catalog.breakdown(a.barcode,a.kind));
  tool('compare_products','Confronta da due a cinque prodotti dello stesso tipo; mancanti e basi native restano espliciti.',{barcodes:z.array(barcode).min(2).max(5),kind},a=>catalog.report(a.barcodes,a.kind));
  tool('explain_ingredient','Cerca un codice E o nome/ID INCI esatto. Nomi e funzioni, nessun rischio dedotto dalla presenza.',{ingredient:z.string().min(1).max(150)},a=>catalog.explain(a.ingredient));
  tool('get_product_sources','Provenienza, data, hash dello snapshot, URL pubblici e limiti.',productInput,async a=>{
    const p=await catalog.product(a.barcode,a.kind);
    return {barcode:p.barcode,source:p.source,assessment:p.assessment,record_id:p.record_id,
      product_json:`${catalog.base}/data/${p.type}/${p.barcode.slice(0,3)}/${p.barcode.slice(3,5)}/${p.barcode}.json`,
      manifest:`${catalog.base}/manifest.json`,image:p.image??null,warnings:p.warnings};
  });
  tool('list_categories','Trova ID categoria per classifiche. Cerca parole nel nome originale o nello slug, ad esempio yogurt; massimo 40 risultati.',{query:z.string().max(100).default(''),kind:z.enum(['food','cosmetics']).optional()},a=>catalog.categories(a.query,a.kind));
  tool('rank_category','Migliori/peggiori nella stessa categoria esatta, secondo il voto riportato; esclusi e parità documentati.',{category:z.string().min(1).max(120),kind,order:z.enum(['best','worst']).default('best'),limit:z.number().int().min(1).max(20).default(5)},a=>catalog.ranking(a.category,a.kind,a.order,a.limit));
  tool('find_better_alternatives','Alternative nella stessa categoria, con voto della fonte strettamente maggiore. Non certifica allergeni, ingredienti o disponibilità.',{...productInput,limit:z.number().int().min(1).max(10).default(5)},a=>catalog.alternatives(a.barcode,a.kind,a.limit));
  registerAppTool(server,'render_product_report',{
    title:'Report Food & Cosmetics',
    description:'Mostra la scheda grafica interattiva: prodotto, confronto, alternative o classifica. Recupera i dati reali dal catalogo remoto; non accetta voti forniti dal modello.',
    inputSchema:{view:z.enum(['product','comparison','alternatives','ranking']).default('product'),
      barcodes:z.array(barcode).min(1).max(5).optional(),kind,
      category:z.string().min(1).max(120).optional(),order:z.enum(['best','worst']).default('best')},
    annotations,_meta:{ui:{resourceUri:URI,visibility:['model','app']},'openai/toolInvocation/invoking':'Preparo il report','openai/toolInvocation/invoked':'Report pronto'},
  },guarded(async a=>{
    if(a.view==='ranking'){
      if(!a.category)throw new CatalogError('CATEGORY_REQUIRED','Scegli una categoria con list_categories.');
      return catalog.ranking(a.category,a.kind,a.order);
    }
    if(!a.barcodes?.length)throw new CatalogError('BARCODE_REQUIRED','Indica il barcode del prodotto.');
    if(a.view==='alternatives')return catalog.alternatives(a.barcodes[0],a.kind);
    if(a.view==='comparison' && a.barcodes.length<2)throw new CatalogError('INVALID_COMPARISON','Per il confronto servono almeno due barcode.');
    if(a.view==='product' && a.barcodes.length!==1)throw new CatalogError('INVALID_PRODUCT','Per la scheda singola usa un barcode.');
    return catalog.report(a.barcodes,a.kind);
  }));
  registerAppResource(server,'Report grafico',URI,{description:'Schede e confronti Food & Cosmetics'},async()=>({contents:[{
    uri:URI,mimeType:RESOURCE_MIME_TYPE,text:reportHtml,
    _meta:{ui:{prefersBorder:true,csp:{resourceDomains:['https://dariomorellidesign.github.io'],connectDomains:[]}},
      'openai/widgetDescription':'Report alimenti e cosmetici con immagini, voti della fonte, confronti e qualità dati.'},
  }]}));
  return server;
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    const catalog=new Catalog(env.CATALOG_URL??DEFAULT_CATALOG);
    if(url.pathname==='/health')return Response.json({status:'ok',mode:'remote_public_catalog',catalog:catalog.base,version:'1.0.0'});
    if(url.pathname==='/report')return new Response(reportHtml,{headers:{'content-type':'text/html; charset=utf-8','referrer-policy':'no-referrer',
      'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https://dariomorellidesign.github.io; connect-src 'self'; base-uri 'none'; frame-ancestors 'self'"}});
    if(url.pathname==='/api/report'){
      try {
        const k=url.searchParams.get('kind')??'food';
        if(k!=='food'&&k!=='cosmetics')throw new CatalogError('INVALID_TYPE','Tipo non valido.');
        const view=url.searchParams.get('view');
        const value=view==='ranking'?await catalog.ranking(url.searchParams.get('category')??'',k,url.searchParams.get('order')==='worst'?'worst':'best')
          :view==='alternatives'?await catalog.alternatives(url.searchParams.get('barcodes')??'',k)
          :await catalog.report((url.searchParams.get('barcodes')??'').split(','),k);
        return Response.json(value,{headers:{'cache-control':'no-store'}});
      }catch(e){return Response.json({error:e instanceof CatalogError?{code:e.code,message:e.message}:{code:'INTERNAL_ERROR',message:'Report non disponibile.'}},{status:400});}
    }
    if(url.pathname!=='/mcp')return new Response('Food & Cosmetics · MCP pubblico: /mcp · Stato: /health · Report: /report?barcodes=CODICE',{status:url.pathname==='/'?200:404,headers:{'content-type':'text/plain; charset=utf-8'}});
    const server=createServer(catalog);
    const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true,maxRequestBodySize:65536});
    await server.connect(transport);
    try{return await transport.handleRequest(request);}
    finally{await server.close();}
  },
};
