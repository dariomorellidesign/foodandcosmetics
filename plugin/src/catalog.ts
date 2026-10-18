export type Kind = 'food' | 'cosmetics';
export type Product = {
  type: Kind; barcode: string; record_id: string; data: Record<string, any>;
  source: Record<string, any>; assessment: Record<string, any>; warnings: string[];
  image?: { url: string }; ingredient_details?: Record<string, any>[];
};
export const RULES = 'source-rating/1.0.0';
export const DEFAULT_CATALOG = 'https://dariomorellidesign.github.io/foodandcosmetics';
export class CatalogError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function validBarcode(code: string): boolean {
  if (!/^(?:[0-9]{8}|[0-9]{12,14})$/.test(code)) return false;
  const sum = [...code.slice(0,-1)].reverse().reduce((n,d,i) => n+Number(d)*(i%2===0?3:1),0);
  return (10-sum%10)%10 === Number(code.at(-1));
}
export function categoryId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) throw new CatalogError('INVALID_CATEGORY','Identificativo categoria non valido. Usa list_categories.');
  return id;
}
export function grade(p: Product): number | null {
  const n=p.data.grade;
  return typeof n==='number' && Number.isFinite(n) && n>=0 && n<=100 && p.data.gradeForbidden!==true ? n : null;
}
export function summary(p: Product, base: string) {
  return {type:p.type,barcode:p.barcode,name:p.data.name,brand:p.data.brand,category:p.data.category,
    rating:grade(p),rating_origin:'source_reported_not_recomputed',image_url:p.image?.url,
    url:`${base}/products/${p.type}/${p.barcode.slice(0,3)}/${p.barcode.slice(3,5)}/${p.barcode}.html`};
}
export class Catalog {
  readonly base: string;
  constructor(base=DEFAULT_CATALOG, private request: typeof fetch = fetch) {
    // The adapter only reads this public catalog. Tool inputs cannot choose hosts.
    if (base!==DEFAULT_CATALOG) throw new CatalogError('CONFIGURATION','Catalogo remoto non autorizzato.');
    this.base=base;
  }
  async json(path: string): Promise<any> {
    let response: Response;
    try { response=await this.request(`${this.base}/${path}`,{signal:AbortSignal.timeout(15000),redirect:'error'}); }
    catch { throw new CatalogError('SOURCE_UNAVAILABLE','Catalogo temporaneamente non raggiungibile. Riprova più tardi.'); }
    if(response.status===404) throw new CatalogError('NOT_FOUND','Dato non presente in questa istantanea.');
    if(!response.ok) throw new CatalogError('SOURCE_UNAVAILABLE',`Il catalogo risponde con stato ${response.status}.`);
    try { return await response.json(); }
    catch { throw new CatalogError('SOURCE_INVALID','Risposta del catalogo non valida.'); }
  }
  async product(barcode: string, kind: Kind='food'): Promise<Product> {
    if (!validBarcode(barcode)) throw new CatalogError('INVALID_BARCODE','GTIN non valido: conserva gli zeri iniziali e verifica la cifra di controllo.');
    if (!['food','cosmetics'].includes(kind)) throw new CatalogError('INVALID_TYPE','Tipo prodotto non valido.');
    const p=await this.json(`data/${kind}/${barcode.slice(0,3)}/${barcode.slice(3,5)}/${barcode}.json`);
    if(p.barcode!==barcode || p.type!==kind || !p.data || !p.source) throw new CatalogError('SOURCE_INVALID','Identità prodotto incoerente nel catalogo.');
    return p;
  }
  async categories(query='',kind?: Kind) {
    const {categories}=await this.json('indexes/categories.json');
    const text=query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const matches=categories.filter((c:any)=>(!kind||c.type===kind) && `${c.id} ${c.name}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(text));
    return {matches:matches.length,categories:matches.slice(0,40),truncated:matches.length>40};
  }
  async ranking(category: string,kind:Kind='food',order:'best'|'worst'='best',limit=5) {
    const index=await this.json(`indexes/${kind}/${categoryId(category)}.json`);
    if(index.type!==kind || index.category!==category || index.rules_version!==RULES) throw new CatalogError('SOURCE_INVALID','Indice categoria incompatibile.');
    return {view:'ranking',type:kind,category,order,criterion:index.criterion,rules_version:index.rules_version,
      scope:index.scope,total_products:index.total_products,eligible_products:index.eligible_products,
      excluded_missing_or_unusable_rating:index.excluded_missing_or_unusable_rating,
      tie_break:index.tie_break,products:index[order].slice(0,Math.min(20,Math.max(1,limit))),
      caveat:'Classifica limitata al catalogo e al voto riportato dalla fonte, non a tutti i prodotti in commercio.'};
  }
  async alternatives(barcode:string,kind:Kind='food',limit=5) {
    const p=await this.product(barcode,kind),rating=grade(p);
    if(!p.data.category || rating===null) return {view:'alternatives',reference:summary(p,this.base),products:[],reason:'Categoria o voto di partenza mancante: nessuna alternativa dichiarata migliore.'};
    const ranking=await this.ranking(p.data.category,kind,'best',20);
    return {...ranking,view:'alternatives',reference:summary(p,this.base),
      similarity:'heuristic_exact_source_category',
      products:ranking.products.filter((x:any)=>x.barcode!==barcode && x.rating>rating).slice(0,limit),
      caveat:'Stessa categoria e voto della fonte strettamente maggiore. Ingredienti, allergeni, prezzo e disponibilità non verificati.'};
  }
  async breakdown(barcode:string,kind:Kind='food') {
    const p=await this.product(barcode,kind);
    return {product:summary(p,this.base),rules_version:RULES,
      overall:{value:grade(p),status:'source_reported_not_recomputed',algorithm:'not_reconstructed_or_independently_verified'},
      nutrition:{value:null,status:'not_computed_unverified_native_units'},
      processing:{value:null,status:'not_computed'},
      additives:{value:null,status:'inventory_only_not_a_risk_score',codes:p.data.additives??null,absence_verified:false},
      ingredients:{value:null,status:'not_scored'},warnings:p.warnings,
      explanation:'Il catalogo conserva il voto della fonte ma non il suo calcolo completo. Nessun breakdown numerico viene inventato.'};
  }
  async explain(ingredient:string) {
    const key=ingredient.trim();
    const match=/^(?:en:)?e[\s-]?(\d{3,4})([a-z]?)(?:\(([ivx]+)\))?$/i.exec(key);
    if(match){
      const id=`en:e${match[1]}${(match[2]||match[3]||'').toLowerCase()}`;
      const taxonomy=await this.json('reference/additives.json'),entry=taxonomy.entries[id];
      return {found:Boolean(entry),ingredient:key,code:id.slice(3).toUpperCase(),...entry,source:taxonomy.source,
        interpretation:'Nomi e funzioni tecnologiche. La presenza non determina pericolo o rischio individuale; dose ed esposizione non disponibili.'};
    }
    const all=await this.json('reference/ingredients.json');
    const needle=key.toLowerCase();
    const entries=Object.entries(all).filter(([id,v]:[string,any])=>id.toLowerCase()===needle || [v.inci,v.nameIt,v.nameEn].some(s=>typeof s==='string'&&s.toLowerCase()===needle)).slice(0,10).map(([id,v]:[string,any])=>({id,...v}));
    return {found:entries.length>0,ingredient:key,entries,source:'same_product_snapshot_ingredient_reference',interpretation:'Identità INCI e nomi riportati. Nessun giudizio tossicologico dedotto dalla sola presenza.'};
  }
  async report(barcodes:string[],kind:Kind='food') {
    if(barcodes.length<1 || barcodes.length>5 || new Set(barcodes).size!==barcodes.length) throw new CatalogError('INVALID_COMPARISON','Indica da uno a cinque barcode distinti.');
    const products=await Promise.all(barcodes.map(b=>this.product(b,kind)));
    return {view:products.length>1?'comparison':'product',type:kind,rules_version:RULES,
      products:products.map(p=>({...summary(p,this.base),data:p.data,source:p.source,assessment:p.assessment,warnings:p.warnings,ingredient_details:p.ingredient_details})),
      same_category:products.every(p=>p.data.category && p.data.category===products[0].data.category),
      warning:'Voti riportati dalla fonte. Nutrienti in unità e basi native non validate; i mancanti non sono zero. Nessuna equivalenza automatica tra presenza e pericolo.'};
  }
}
