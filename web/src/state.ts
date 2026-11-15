import { useEffect, useState } from 'react';
import type { Snapshot } from './api';
export function useLocal<T>(key:string, fallback:T){
 const read=()=>{try{const s=localStorage.getItem(key);return s?JSON.parse(s) as T:fallback;}catch{return fallback;}};
 const [value,setValue]=useState<T>(read);
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{/* keep the in-memory draft */}},[key,value]);
 return [value,setValue] as const;
}
export function useDraft<T>(key:string,initial:T,snapshot:Snapshot){
 const [draft,setDraftValue]=useLocal(key,initial);
 const [meta,setMeta]=useLocal(key+'.base',{revision:snapshot.board.revision,fingerprint:snapshot.fingerprint});
 const [dirty,setDirty]=useLocal(key+'.dirty',false);
 useEffect(()=>{if(!dirty||JSON.stringify(draft)===JSON.stringify(initial)){setDraftValue(initial);setMeta({revision:snapshot.board.revision,fingerprint:snapshot.fingerprint});setDirty(false);}},[snapshot.fingerprint]);
 const setDraft=(next:T)=>{setDirty(true);setDraftValue(next);};
 const base={...snapshot,board:{...snapshot.board,revision:meta.revision},fingerprint:meta.fingerprint};
 const setBase=(next:Snapshot)=>setMeta({revision:next.board.revision,fingerprint:next.fingerprint});
 return [draft,setDraft,base,setBase] as const;
}
