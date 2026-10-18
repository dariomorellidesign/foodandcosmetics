import { App } from '@modelcontextprotocol/ext-apps';

const root=document.querySelector<HTMLElement>('#report')!;
const status=document.querySelector<HTMLElement>('#status')!;
let current:any=null;
const preview=new URLSearchParams(location.search).has('preview') || window.parent===window;
const app=new App({name:'Food & Cosmetics',version:'1.0.0'},{});
const el=(tag:string,text?:unknown,cls?:string)=>{
  const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;
};
const display=(n:unknown)=>n===undefined||n===null?'Non disponibile':String(n);
const safeUrl=(value:unknown,image=false)=>{
  if(typeof value!=='string')return null;
  try{const u=new URL(value);return u.protocol==='https:' && u.hostname==='dariomorellidesign.github.io' && !u.username && !u.password && u.pathname.startsWith(image?'/foodandcosmetics-images/images/':'/foodandcosmetics/')?u.href:null;}catch{return null;}
};
function button(label:string,fn:()=>Promise<void>){
  const b=el('button',label) as HTMLButtonElement;b.type='button';b.onclick=async()=>{
    b.disabled=true;status.textContent='Aggiorno il report…';try{await fn();status.textContent='';}catch(e){status.textContent=e instanceof Error?e.message:'Operazione non disponibile.';}finally{b.disabled=false;}
  };return b;
}
async function invoke(args:any){
  if(preview){
    const params=new URLSearchParams({...args,barcodes:(args.barcodes??[]).join(',')});
    const r=await fetch('/api/report?'+params);const data=await r.json() as any;if(data.error)throw Error(data.error.message);render(data);
  }else{
    const r=await app.callServerTool({name:'render_product_report',arguments:args});
    const data=r.structuredContent??JSON.parse((r.content?.find((c:any)=>c.type==='text') as any)?.text??'{}');
    if(data.error)throw Error(String((data.error as any).message));render(data);
  }
}
function card(p:any,index:number,ranking=false){
  const c=el('article',undefined,'card');
  if(ranking)c.append(el('span',String(index+1).padStart(2,'0'),'position'));
  const image=safeUrl(p.image_url,true);
  if(image){
    const pic=el('img') as HTMLImageElement;pic.src=image;pic.alt=String(p.name??'Immagine prodotto');pic.width=144;pic.height=144;pic.loading='lazy';pic.referrerPolicy='no-referrer';
    pic.onerror=()=>{pic.replaceWith(el('div','Foto non disponibile','no-photo'));};c.append(pic);
  }else c.append(el('div','Foto non disponibile','no-photo'));
  c.append(el('p',p.brand??'Marca non disponibile','eyebrow'),el('h2',p.name??'Nome non disponibile'),el('p',p.barcode,'barcode'));
  const n=typeof p.rating==='number'?p.rating:null;
  const rating=el('div',undefined,'rating');rating.append(el('strong',n===null?'—':n),el('span',n===null?'Voto non disponibile':'/ 100'));
  const track=el('div',undefined,'track'),fill=el('span');fill.style.width=`${n??0}%`;fill.style.background=n===null?'#9aabac':n>=75?'#197a5c':n>=50?'#54885a':n>=25?'#b17c26':'#a65246';track.append(fill);
  if(n===null)track.style.visibility='hidden';
  c.append(rating,track,el('p',n===null?'Voto non disponibile':'Voto riportato dalla fonte','caption'));
  const link=safeUrl(p.url);if(link){const a=el('a','Scheda e provenienza ↗') as HTMLAnchorElement;a.href=link;a.target='_blank';a.rel='noopener noreferrer';c.append(a);}
  c.append(button('Alternative con voto maggiore',()=>invoke({view:'alternatives',barcodes:[p.barcode],kind:current.type??p.type??'food'})));
  return c;
}
const metrics=[['calories','Energia'],['fat','Grassi'],['saturatedFat','Grassi saturi'],['sugar','Zuccheri'],['sodium','Sodio'],['proteins','Proteine'],['fibers','Fibre']];
function details(products:any[]){
  if(current.type==='food'){
    const block=el('section',undefined,'panel');block.append(el('h2','Dati nutrizionali riportati'),el('p','Valori nelle unità e basi native, non validate per ogni scheda. Nessuna conversione; “non disponibile” non significa zero.','subtle'));
    const scroll=el('div',undefined,'table-scroll'),table=el('table'),head=el('tr');head.append(el('th','Campo'));
    products.forEach((p,i)=>head.append(el('th',products.length>1?`${i+1}. ${p.name??p.barcode}`:'Valore')));table.append(head);
    for(const [key,name] of [['nutritionFactsFormat','Formato della fonte'],...metrics]){
      const row=el('tr');row.append(el('th',name));products.forEach(p=>row.append(el('td',display(p.data?.[key]))));table.append(row);
    }scroll.append(table);block.append(scroll);root.append(block);
  }
  const block=el('section',undefined,'panel');block.append(el('h2',current.type==='food'?'Additivi riportati':'Ingredienti / INCI'));
  products.forEach(p=>{
    block.append(el('h3',p.name??p.barcode));
    const values=current.type==='food'?p.data?.additives:p.ingredient_details?.map((x:any)=>x.inci??x.id);
    if(!values?.length)block.append(el('p',current.type==='food'?'Elenco vuoto o mancante: assenza di additivi non verificata.':'Elenco non disponibile.'));
    else{const list=el('div',undefined,'chips');values.forEach((v:any)=>list.append(el('span',v,'chip')));block.append(list);}
  });
  block.append(el('p','La presenza di un ingrediente non determina il rischio individuale: dose ed esposizione non sono disponibili.','subtle'));root.append(block);
  const quality=el('details',undefined,'panel');quality.append(el('summary','Qualità dei dati e provenienza'));
  products.forEach(p=>{
    quality.append(el('h3',p.name??p.barcode),el('p',`Istantanea: ${display(p.source?.snapshot_date)} · Aggiornamento scheda: ${display(p.source?.record_updated_at)}`));
    const warnings=el('ul');(p.warnings??[]).forEach((w:any)=>warnings.append(el('li',w)));quality.append(warnings);
    quality.append(el('p','Confezione attuale e completezza degli elenchi non verificate.','subtle'));
  });root.append(quality);
}
function render(data:any){
  if(data.error){status.textContent=data.error.message;return;}
  current=data;root.replaceChildren();status.textContent='';
  const titles:any={product:'Il prodotto, in chiaro',comparison:'Prodotti a confronto',alternatives:'Alternative nella stessa categoria',ranking:data.order==='worst'?'Voti più bassi della categoria':'Voti più alti della categoria'};
  const intro=el('section',undefined,'intro');intro.append(el('p','FOOD & COSMETICS','eyebrow'),el('h1',titles[data.view]??'Report prodotti'));
  if(data.category)intro.append(el('p',`Categoria: ${data.category}`,'subtle'));
  if(data.reference)intro.append(el('p',`Rispetto a ${data.reference.name??data.reference.barcode} · voto ${display(data.reference.rating)}`));
  const products=data.products??[];
  intro.append(el('p',data.view==='ranking'?`${display(data.eligible_products)} prodotti con voto utilizzabile su ${display(data.total_products)}. ${display(data.excluded_missing_or_unusable_rating)} esclusi.`:data.same_category===false?'Categorie diverse: il confronto non identifica automaticamente un vincitore.':'Dati della stessa istantanea, con provenienza e limiti espliciti.','subtle'));
  root.append(intro);
  if(!products.length)root.append(el('p',data.reason??'Nessun prodotto con voto strettamente maggiore trovato in questa categoria.','panel'));
  const grid=el('div',undefined,'cards');products.forEach((p:any,i:number)=>grid.append(card(p,i,data.view==='ranking')));root.append(grid);
  if(products.some((p:any)=>p.data))details(products);
  const nav=el('nav',undefined,'actions');
  const category=data.category??products[0]?.category;
  if(category && data.same_category!==false){
    nav.append(button('Migliori della categoria',()=>invoke({view:'ranking',category,kind:data.type,order:'best'})),button('Peggiori della categoria',()=>invoke({view:'ranking',category,kind:data.type,order:'worst'})));
  }
  root.append(nav,el('p',data.caveat??data.warning??'Voto riportato dalla fonte; confezione attuale non verificata.','notice'));
  root.append(el('p',`Criterio ${data.rules_version??'source-rating/1.0.0'} · Nessun nuovo punteggio sanitario. Alternative per categoria = euristica; allergeni, disponibilità e prezzo non verificati.`,'fineprint'));
}
app.ontoolresult=(r:any)=>{
  const data=r.structuredContent; if(data)render(data);
};
if(preview){
  const q=new URLSearchParams(location.search);
  if(q.has('barcodes')||q.has('category'))invoke({view:q.get('view')??'product',barcodes:(q.get('barcodes')??'').split(',').filter(Boolean),kind:q.get('kind')??'food',category:q.get('category')??'',order:q.get('order')??'best'}).catch(e=>{status.textContent=e.message;});
  else status.textContent='Apri il report da un prodotto o da una categoria.';
}else app.connect().catch(()=>{status.textContent='Il client non ha collegato il report interattivo. I dati restano disponibili nella risposta dello strumento.';});
