
const F=()=>window.__FAKE;
function rev(v){ if(Array.isArray(v))return v.map(rev); if(v&&typeof v==='object'){ if(typeof v.__ms==='number'){const n=v.__ms;return {toMillis:()=>n,toDate:()=>new Date(n),seconds:Math.floor(n/1000)};} const o={}; for(const k in v)o[k]=rev(v[k]); return o;} return v; }
const CL=(d)=>rev(JSON.parse(JSON.stringify(d)));
export function getFirestore(){return {};}
export function initializeFirestore(){return {};}
export function persistentLocalCache(){return {};} export function persistentMultipleTabManager(){return {};}
export function doc(db,...p){ if(db&&db.path&&!p.length) return db; const parts=(db&&db.path?[db.path]:[]).concat(p); return {path:parts.join('/'), id:parts[parts.length-1]}; }
export function collection(db,...p){ const parts=(db&&db.path?[db.path]:[]).concat(p); return {path:parts.join('/'), col:true}; }
export function serverTimestamp(){ return {__ts:true}; }
function snap(path){ const d=F().docs[path]; return {id:path.split('/').pop(), exists:()=>!!d, data:()=>d?CL(d):undefined}; }
export async function getDoc(r){ return snap(r.path); }
export async function getDocFromServer(r){ return snap(r.path); }
function _lim(v){ if(Array.isArray(v)) return v.map(_lim); if(v&&typeof v==='object'){ if(v.__ts) return {__ms:Date.now()}; if(typeof v.__inc==='number') return v; const o={}; for(const k in v){ o[k]=_lim(v[k]); } return o; } return v; }
function _merge(path,d,subst){ try{ const base=subst?{}:(F().docs[path]||{}); F().docs[path]=Object.assign({},base,_lim(JSON.parse(JSON.stringify(d,(k,v)=>(v&&typeof v==='object'&&typeof v.toMillis==='function')?{__ms:v.toMillis()}:v)))); }catch(e){} }
export async function setDoc(r,d,o){ F().writes.push(['set',r.path]); _merge(r.path,d,!(o&&o.merge)); return; }
export async function updateDoc(r,d){ F().writes.push(['update',r.path]); _merge(r.path,d,false); return; }
export async function addDoc(c,d){ F().writes.push(['add',c.path]); return {id:'novo'}; }
export function where(f,op,v){return {t:'where',f,op,v};}
export function orderBy(f,d){return {t:'order',f,d};}
export function limit(n){return {t:'limit',n};}
export function query(c,...cons){return {path:c.path, cons};}
function rodar(q){
  const pre=q.path+'/'; let out=[];
  for(const p in F().docs){ if(!p.startsWith(pre)||p.slice(pre.length).includes('/'))continue; const d=F().docs[p]; let ok=true;
    for(const c of (q.cons||[])){ if(c.t!=='where')continue; const x=d[c.f]; if(c.op==='=='&&x!==c.v)ok=false; if(c.op==='in'&&c.v.indexOf(x)<0)ok=false; if(c.op==='array-contains'&&!(x||[]).includes(c.v))ok=false; }
    if(ok)out.push({id:p.slice(pre.length), exists:()=>true, data:()=>CL(d)}); }
  return out;
}
export async function deleteDoc(r){ F().writes.push(['del',r.path]); }
export class Timestamp{ constructor(s,n){this.seconds=s;this.nanoseconds=n||0;} toMillis(){return this.seconds*1000;} toDate(){return new Date(this.seconds*1000);} static now(){return new Timestamp(Math.floor(Date.now()/1000));} static fromMillis(m){return new Timestamp(Math.floor(m/1000));} static fromDate(d){return new Timestamp(Math.floor(d.getTime()/1000));} }
export async function getCountFromServer(q){ const r=rodar(q); return {data:()=>({count:r.length})}; }
export function increment(n){ return {__inc:n}; }
export async function getDocs(q){ const r=rodar(q); return {docs:r,size:r.length,empty:!r.length,forEach:(fn)=>r.forEach(fn)}; }
export function onSnapshot(q,next,err){
  if(q.cons===undefined && !q.col){ setTimeout(()=>{ next(snap(q.path)); },10); return ()=>{}; }
  const fire=()=>{ const r=rodar(q); next({docs:r,size:r.length,empty:!r.length,forEach:(fn)=>r.forEach(fn),docChanges:()=>r.map(d=>({type:'added',doc:d}))}); };
  setTimeout(fire,10); return ()=>{};
}
export function runTransaction(){return Promise.resolve();}
export function writeBatch(){return {set(){},update(){},delete(){},commit:async()=>{}};}
export function arrayUnion(...a){return a;} export function arrayRemove(...a){return a;} export function deleteField(){return null;}
export function documentId(){return '__id';} export function startAfter(){return {t:'x'};} export function getDocsFromServer(q){return getDocs(q);}
