import { App } from '@modelcontextprotocol/ext-apps';

const root=document.querySelector<HTMLElement>('#report')!;
const status=document.querySelector<HTMLElement>('#status')!;
let current:any=null;
const preview=new URLSearchParams(location.search).has('preview') || window.parent===window;
const app=new App({name:'Food & Cosmetics',version:'1.1.0'},{});
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
  if(p.additive_check)c.append(el('p',p.additive_check.status==='empty_unverified'?'Nessun additivo elencato · assenza non verificata':`${p.additives?.length??0} additivi elencati · ${p.additive_check.independently_reviewed} con scheda verificata`,'caption'));
  const link=safeUrl(p.url);if(link){const a=el('a','Scheda e provenienza ↗') as HTMLAnchorElement;a.href=link;a.target='_blank';a.rel='noopener noreferrer';c.append(a);}
  c.append(button('Alternative con voto maggiore',()=>invoke({view:'alternatives',barcodes:[p.barcode],kind:current.type??p.type??'food'})));
  return c;
}
const metrics=[['calories','Energia'],['fat','Grassi'],['saturatedFat','Grassi saturi'],['sugar','Zuccheri'],['sodium','Sodio'],['proteins','Proteine'],['fibers','Fibre']];
const flagNames:Record<string,string>={allergen:'Allergenicità',blood_sugar_regulation_alteration:'Alterazioni della regolazione glicemica',body_acidity_alteration:'Alterazioni dell’acidità corporea',bone_mineralization_alteration:'Alterazioni della mineralizzazione ossea',cardiovascular_diseases:'Malattie cardiovascolari',child_attention_deficit:'Disturbi dell’attenzione nei bambini',degradation_into_toxic_compounds:'Degradazione in composti tossici',digestive_discomfort:'Disturbi digestivi',disruption_of_gut_microbiota:'Alterazioni del microbiota',dna_damage:'Danni al DNA',effects_on_baby_development:'Effetti sullo sviluppo infantile',exceeding_adi:'Possibile superamento della DGA',fertility_alteration:'Alterazioni della fertilità',growth_delay:'Ritardo nella crescita',gut_barrier_weakening:'Alterazioni della barriera intestinale',headaches:'Cefalea',hives_in_sensitive_individuals:'Orticaria in soggetti sensibili',intestinal_inflammation:'Infiammazione intestinale',involvement_in_overweight:'Associazione con sovrappeso',negative_effects_on_reproduction:'Effetti sulla riproduzione',negative_effects_on_the_blood:'Effetti sul sangue',negative_effects_on_the_kidneys:'Effetti sui reni',negative_effects_on_the_liver:'Effetti sul fegato',negative_effects_on_the_nervous_system:'Effetti sul sistema nervoso',negative_effects_on_the_thyroid:'Effetti sulla tiroide',poor_mineral_absorption:'Ridotto assorbimento di minerali',possible_accumulation_in_the_body:'Possibile accumulo nell’organismo',possible_carcinogen:'Possibile cancerogenicità',possible_presence_of_aluminum:'Possibile presenza di alluminio',possible_presence_of_contaminants:'Possibili contaminanti',potential_endocrine_disruptor:'Possibile interferenza endocrina',probable_carcinogen:'Probabile cancerogenicità secondo la fonte, non classificazione IARC verificata',suspected_carcinogen:'Sospetta cancerogenicità secondo la fonte',suspected_endocrine_disruptor:'Sospetta interferenza endocrina',type_2_diabetes:'Associazione con diabete di tipo 2',weakened_immune_system:'Effetti sul sistema immunitario'};
function sourceLinks(parent:HTMLElement,sources:any[],original=false){
  const list=el('ul');
  for(const s of sources){
    const li=el('li'),title=s.title??s.label??'Riferimento senza titolo';
    // Links are navigations only. Never fetch bibliography URLs or inject source HTML.
    let url:URL|null=null;try{url=new URL(s.url);}catch{}
    if(url && ['https:','http:'].includes(url.protocol) && !url.username && !url.password){
      const a=el('a',title) as HTMLAnchorElement;a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';li.append(a);
    }else li.append(el('span',title));
    li.append(el('small',` · ${s.authority??''} · ${s.date??s.year??'data non disponibile'}${original?' · riferimento originale non verificato':''}`));list.append(li);
  }parent.append(list);
}
function additivePanel(a:any){
  const d=el('details',undefined,'additive');
  const title=el('summary');title.append(el('span',`${a.code} · ${a.official_review?.name_it??a.names?.it??a.names?.en??'Identità non disponibile'}`));
  title.append(el('span',a.status==='unresolved'?'Codice non risolto':a.status==='flagged_for_attention'?'Segnalazioni da approfondire':'Nessuna segnalazione nei riferimenti',a.status==='flagged_for_attention'?'badge attention':'badge'));
  d.append(title);
  const r=a.official_review;
  if(r){
    d.append(el('h4','Approfondimento verificato su fonti primarie'),el('p',r.summary_it),el('p',`Verifica: ${a.reviewed_at}. Selezione di fonti, non revisione sistematica esaustiva.`,'subtle'));
    if(r.adi)d.append(el('p',`DGA: ${r.adi.value} ${r.adi.unit}, espressa come ${r.adi.expressed_as}. Ambito: ${r.adi.scope}.`));
    if(r.studies)for(const s of r.studies)d.append(el('p',`Studio: ${s.participants} partecipanti, ${s.duration_days} giorni; ${s.dose}. ${s.limitations_it}`,'subtle'));
    sourceLinks(d,r.sources);
  }else d.append(el('p','Scheda scientifica indipendente non ancora verificata. Mancanza di segnalazioni non significa innocuità.','subtle'));
  const raw=a.source_assessment;
  if(raw){
    const legacy=el('details');legacy.append(el('summary',`Segnalazioni originali non validate (${raw.riskCharacterization.length}) e bibliografia (${raw.sources.length})`));
    legacy.append(el('p','Questi sono giudizi della fonte originale, non effetti clinici accertati né conclusioni ufficiali EFSA/IARC. Il valore numerico originale di pericolosità non viene tradotto in una scala di rischio.','notice'));
    if(raw.riskCharacterization.length){const ul=el('ul');for(const f of raw.riskCharacterization)ul.append(el('li',flagNames[f]??f));legacy.append(ul);}
    else legacy.append(el('p','Nessuna segnalazione nel riferimento originale.'));
    sourceLinks(legacy,raw.sources,true);d.append(legacy);
  }
  d.append(el('p','Dose ed esposizione del prodotto non disponibili: rischio individuale non determinabile.','subtle'));
  return d;
}
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
    else if(current.type==='food' && p.additive_analysis){p.additive_analysis.details.forEach((a:any)=>block.append(additivePanel(a)));}
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
  const intro=el('section',undefined,'intro');intro.append(el('p','FOOD & COSMETICS · MERCATO ITALIANO','eyebrow'),el('h1',titles[data.view]??'Report prodotti'));
  if(data.category)intro.append(el('p',`Categoria: ${data.category}`,'subtle'));
  if(data.reference)intro.append(el('p',`Rispetto a ${data.reference.name??data.reference.barcode} · voto ${display(data.reference.rating)}`));
  const products=data.products??[];
  intro.append(el('p',data.view==='ranking'?`${display(data.eligible_products)} prodotti con voto utilizzabile su ${display(data.total_products)}. ${display(data.excluded_missing_or_unusable_rating)} esclusi.`:data.same_category===false?'Categorie diverse: il confronto non identifica automaticamente un vincitore.':'Dati della stessa istantanea, con provenienza e limiti espliciti.','subtle'));
  root.append(intro);
  if(data.filter){
    const f=data.filter;intro.append(el('p',`${f.label}${f.exclude_additives?.length?' · esclusi '+f.exclude_additives.join(', '):''}`,'filter-label'));
    intro.append(el('p',`${f.matched_products} corrispondenze nell’intera categoria; ${f.rankable_matches} ordinabili per voto. ${f.excluded_missing_rating_among_matches} senza voto utilizzabile. Esclusi dal filtro: ${Object.entries(f.excluded_by_reason).map(([k,v])=>`${k}: ${v}`).join(' · ')||'nessuno'}.`,'subtle'));
    intro.append(el('p',f.caveat,'notice'));
  }
  if(!products.length)root.append(el('p',data.reason??'Nessun prodotto con voto strettamente maggiore trovato in questa categoria.','panel'));
  const grid=el('div',undefined,'cards');products.forEach((p:any,i:number)=>grid.append(card(p,i,data.view==='ranking')));root.append(grid);
  if(products.some((p:any)=>p.data))details(products);
  const nav=el('nav',undefined,'actions');
  const category=data.category??products[0]?.category;
  if(category && data.same_category!==false){
    const options={category,kind:data.type,additive_filter:data.filter?.mode??'any',exclude_additives:data.filter?.exclude_additives??[]};
    nav.append(button('Migliori della categoria',()=>invoke({view:'ranking',...options,order:'best'})),button('Peggiori della categoria',()=>invoke({view:'ranking',...options,order:'worst'})));
    if(data.type==='food'){
      nav.append(button('Nessun additivo elencato',()=>invoke({view:'ranking',category,kind:'food',additive_filter:'none_listed'})),
        button('Senza additivi segnalati',()=>invoke({view:'ranking',category,kind:'food',additive_filter:'no_flagged'})));
    }
  }
  root.append(nav,el('p',data.caveat??data.warning??'Voto riportato dalla fonte; confezione attuale non verificata.','notice'));
  root.append(el('p',`Criterio ${data.rules_version??'source-rating/1.0.0'} · Nessun nuovo punteggio sanitario. Alternative per categoria = euristica; allergeni, disponibilità e prezzo non verificati.`,'fineprint'));
}
app.ontoolresult=(r:any)=>{
  const data=r.structuredContent; if(data)render(data);
};
if(preview){
  const q=new URLSearchParams(location.search);
  if(q.has('barcodes')||q.has('category'))invoke({view:q.get('view')??'product',barcodes:(q.get('barcodes')??'').split(',').filter(Boolean),kind:q.get('kind')??'food',category:q.get('category')??'',order:q.get('order')??'best',additive_filter:q.get('additive_filter')??'any',exclude_additives:(q.get('exclude_additives')??'').split(',').filter(Boolean)}).catch(e=>{status.textContent=e.message;});
  else status.textContent='Apri il report da un prodotto o da una categoria.';
}else app.connect().catch(()=>{status.textContent='Il client non ha collegato il report interattivo. I dati restano disponibili nella risposta dello strumento.';});
