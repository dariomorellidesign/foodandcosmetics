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
const additiveFilters={additive_filter:z.enum(['any','none_listed','no_flagged']).default('any').describe('Alimenti: none_listed = elenco vuoto, assenza sulla confezione NON verificata; no_flagged = senza segnalazioni nei riferimenti disponibili, NON senza rischio. Codici ignoti esclusi.'),
  exclude_additives:z.array(z.string().min(4).max(20)).max(20).default([]).describe('Codici E esatti da escludere, ad esempio E951. Varianti non assimilate automaticamente al gruppo.')};
const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true};
const result=(value:any)=>({content:[{type:'text' as const,text:JSON.stringify(value)}],structuredContent:value});
const guarded=(fn:(args:any)=>Promise<any>)=>async(args:any)=>{
  try{return result(await fn(args));}
  catch(e){const error=e instanceof CatalogError?e:new CatalogError('INTERNAL_ERROR','Analisi temporaneamente non disponibile.');
    return {...result({error:{code:error.code,message:error.message}}),isError:true};}
};

export function createServer(catalog:Catalog) {
  const server=new McpServer({name:'Food & Cosmetics',version:'1.1.0'}, {
    instructions:'Catalogo pubblico parziale di alimenti e cosmetici del mercato italiano, istantanea fornita dal proprietario del repository. Non è un catalogo mondiale né completo o aggiornato in tempo reale. Rispondi in italiano. Per schede, confronti o classifiche usa render_product_report. Usa list_categories per gli ID originali. Per “senza additivi” usa additive_filter=none_listed precisando che verifica solo un elenco vuoto, non l’etichetta. Per “senza additivi a rischio” usa no_flagged e spiega che esclude segnalazioni nei riferimenti disponibili, non certifica sicurezza. Riferimenti non validati e valutazioni ufficiali selezionate restano distinti; nessun rischio individuale dedotto. Per esclusioni specifiche usa exclude_additives. Non applicare filtri alimentari agli INCI cosmetici. Voti della fonte, non score ufficiali o ricalcolati. Alternative = categoria esatta e voto maggiore. Specifica copertura, esclusi e limiti del filtro.',
  });
  const tool=(name:string,description:string,inputSchema:any,fn:(args:any)=>Promise<any>)=>server.registerTool(name,{description,inputSchema,annotations,_meta:{ui:{visibility:['model','app']}}},guarded(fn));
  tool('lookup_product','Scheda del catalogo italiano da barcode con approfondimenti additivi e provenienza; nessuna lettura del computer locale.',productInput,a=>catalog.lookup(a.barcode,a.kind));
  tool('analyze_product','Report strutturato con dati, voto riportato e limiti. Per la grafica usa render_product_report.',productInput,a=>catalog.report([a.barcode],a.kind));
  tool('get_scoring_breakdown','Distingue voto riportato, inventario additivi e dimensioni non calcolabili. Non ricostruisce il voto della fonte.',productInput,a=>catalog.breakdown(a.barcode,a.kind));
  tool('compare_products','Confronta da due a cinque prodotti dello stesso tipo; mancanti e basi native restano espliciti.',{barcodes:z.array(barcode).min(2).max(5),kind},a=>catalog.report(a.barcodes,a.kind));
  tool('explain_ingredient','Additivi: schede scientifiche selezionate, DGA, studi e segnalazioni originali distinte; nessuna diagnosi di rischio. Cosmetici: identità INCI, senza applicare giudizi alimentari.',{ingredient:z.string().min(1).max(150)},a=>catalog.explain(a.ingredient));
  tool('get_product_sources','Provenienza, data, hash dello snapshot, URL pubblici e limiti.',productInput,async a=>{
    const p=await catalog.product(a.barcode,a.kind);
    return {barcode:p.barcode,source:p.source,assessment:p.assessment,record_id:p.record_id,
      product_json:`${catalog.base}/data/${p.type}/${p.barcode.slice(0,3)}/${p.barcode.slice(3,5)}/${p.barcode}.json`,
      manifest:`${catalog.base}/manifest.json`,image:p.image??null,warnings:p.warnings};
  });
  tool('list_categories','Trova ID categoria per classifiche. Cerca parole nel nome originale o nello slug, ad esempio yogurt; massimo 40 risultati.',{query:z.string().max(100).default(''),kind:z.enum(['food','cosmetics']).optional()},a=>catalog.categories(a.query,a.kind));
  tool('rank_category','Migliori/peggiori del catalogo italiano nella categoria esatta. Filtri alimentari applicati a tutta la categoria prima della classifica; senza additivi elencati o senza segnalazioni disponibili, mai certificati senza rischio.',{category:z.string().min(1).max(120),kind,order:z.enum(['best','worst']).default('best'),limit:z.number().int().min(1).max(20).default(5),...additiveFilters},a=>catalog.ranking(a.category,a.kind,a.order,a.limit,a.additive_filter,a.exclude_additives));
  tool('find_better_alternatives','Stessa categoria e voto riportato maggiore, con filtri opzionali sugli additivi alimentari. Non certifica etichetta, sicurezza o disponibilità.',{...productInput,limit:z.number().int().min(1).max(10).default(5),...additiveFilters},a=>catalog.alternatives(a.barcode,a.kind,a.limit,a.additive_filter,a.exclude_additives));
  registerAppTool(server,'render_product_report',{
    title:'Report Food & Cosmetics',
    description:'Mostra la scheda grafica interattiva: prodotto, confronto, alternative o classifica. Recupera i dati reali dal catalogo remoto; non accetta voti forniti dal modello.',
    inputSchema:{view:z.enum(['product','comparison','alternatives','ranking']).default('product'),
      barcodes:z.array(barcode).min(1).max(5).optional(),kind,
      category:z.string().min(1).max(120).optional(),order:z.enum(['best','worst']).default('best'),...additiveFilters},
    annotations,_meta:{ui:{resourceUri:URI,visibility:['model','app']},'openai/toolInvocation/invoking':'Preparo il report','openai/toolInvocation/invoked':'Report pronto'},
  },guarded(async a=>{
    if(a.view==='ranking'){
      if(!a.category)throw new CatalogError('CATEGORY_REQUIRED','Scegli una categoria con list_categories.');
      return catalog.ranking(a.category,a.kind,a.order,5,a.additive_filter,a.exclude_additives);
    }
    if(!a.barcodes?.length)throw new CatalogError('BARCODE_REQUIRED','Indica il barcode del prodotto.');
    if(a.view==='alternatives')return catalog.alternatives(a.barcodes[0],a.kind,5,a.additive_filter,a.exclude_additives);
    if(a.view==='comparison' && a.barcodes.length<2)throw new CatalogError('INVALID_COMPARISON','Per il confronto servono almeno due barcode.');
    if(a.view==='product' && a.barcodes.length!==1)throw new CatalogError('INVALID_PRODUCT','Per la scheda singola usa un barcode.');
    return catalog.report(a.barcodes,a.kind);
  }));
  registerAppResource(server,'Report grafico',URI,{description:'Schede e confronti Food & Cosmetics'},async()=>({contents:[{
    uri:URI,mimeType:RESOURCE_MIME_TYPE,text:reportHtml,
    _meta:{ui:{prefersBorder:true,csp:{resourceDomains:['https://dariomorellidesign.github.io'],connectDomains:[]}},
      'openai/widgetDescription':'Catalogo del mercato italiano: alimenti e cosmetici, immagini, confronti, filtri additivi e fonti scientifiche distinte dalle segnalazioni originali.'},
  }]}));
  return server;
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    const catalog=new Catalog(env.CATALOG_URL??DEFAULT_CATALOG);
    if(url.pathname==='/health')return Response.json({status:'ok',mode:'remote_public_catalog',market:'IT',catalog:catalog.base,version:'1.1.0',additive_knowledge_version:'additive-knowledge/1.0.0'});
    if(url.pathname==='/report')return new Response(reportHtml,{headers:{'content-type':'text/html; charset=utf-8','referrer-policy':'no-referrer',
      'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https://dariomorellidesign.github.io; connect-src 'self'; base-uri 'none'; frame-ancestors 'self'"}});
    if(url.pathname==='/api/report'){
      try {
        const k=url.searchParams.get('kind')??'food';
        if(k!=='food'&&k!=='cosmetics')throw new CatalogError('INVALID_TYPE','Tipo non valido.');
        const view=url.searchParams.get('view');
        const filter=(url.searchParams.get('additive_filter')??'any') as any;
        const exclude=(url.searchParams.get('exclude_additives')??'').split(',').filter(Boolean);
        const value=view==='ranking'?await catalog.ranking(url.searchParams.get('category')??'',k,url.searchParams.get('order')==='worst'?'worst':'best',5,filter,exclude)
          :view==='alternatives'?await catalog.alternatives(url.searchParams.get('barcodes')??'',k,5,filter,exclude)
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
