import { useCallback, useMemo, useState } from "react";

const VERSION=1;
const MAX_AGE_MS=7*24*60*60*1000;
type Envelope<T>={version:number;savedAt:number;value:T};
export type LocalDraftEntry<T>={id:string;savedAt:number;value:T};
type CollectionEnvelope<T>={version:number;drafts:LocalDraftEntry<T>[]};

export function useLocalDraft<T>(identity:{userId?:string;branchId?:string|null;form:string;recordId?:string},validate:(value:unknown)=>value is T) {
  const key=useMemo(()=>identity.userId?`libro.draft.v${VERSION}.${identity.userId}.${identity.branchId??"global"}.${identity.form}.${identity.recordId??"new"}`:"",[identity.userId,identity.branchId,identity.form,identity.recordId]);
  const read=useCallback(()=>{if(!key)return null;try{const parsed=JSON.parse(localStorage.getItem(key)??"null") as Envelope<unknown>|null;if(!parsed||parsed.version!==VERSION||Date.now()-parsed.savedAt>MAX_AGE_MS||!validate(parsed.value)){localStorage.removeItem(key);return null;}return parsed.value;}catch{localStorage.removeItem(key);return null;}},[key,validate]);
  const save=useCallback((value:T)=>{if(!key)return;try{localStorage.setItem(key,JSON.stringify({version:VERSION,savedAt:Date.now(),value} satisfies Envelope<T>));}catch{/* storage may be unavailable */}},[key]);
  const clear=useCallback(()=>{if(key)try{localStorage.removeItem(key);}catch{/* storage may be unavailable */}},[key]);
  return useMemo(()=>({read,save,clear,key}),[read,save,clear,key]);
}

const createDraftId=()=>globalThis.crypto?.randomUUID?.()??`draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useLocalDraftCollection<T>(identity:{userId?:string;branchId?:string|null;form:string},validate:(value:unknown)=>value is T) {
  const [,setRevision]=useState(0);
  const key=useMemo(()=>identity.userId?`libro.drafts.v${VERSION}.${identity.userId}.${identity.branchId??"global"}.${identity.form}`:"",[identity.userId,identity.branchId,identity.form]);
  const list=useCallback(()=>{
    if(!key||typeof localStorage==="undefined")return [] as LocalDraftEntry<T>[];
    try{
      const parsed=JSON.parse(localStorage.getItem(key)??"null") as CollectionEnvelope<unknown>|null;
      if(!parsed||parsed.version!==VERSION||!Array.isArray(parsed.drafts)){localStorage.removeItem(key);return [];}
      const now=Date.now();
      const valid=parsed.drafts.filter((entry):entry is LocalDraftEntry<T>=>Boolean(entry&&typeof entry.id==="string"&&typeof entry.savedAt==="number"&&now-entry.savedAt<=MAX_AGE_MS&&validate(entry.value)));
      if(valid.length!==parsed.drafts.length){if(valid.length)localStorage.setItem(key,JSON.stringify({version:VERSION,drafts:valid} satisfies CollectionEnvelope<T>));else localStorage.removeItem(key);}
      return valid.sort((left,right)=>right.savedAt-left.savedAt);
    }catch{localStorage.removeItem(key);return [];}
  },[key,validate]);
  const save=useCallback((value:T,id?:string)=>{
    if(!key||typeof localStorage==="undefined")return "";
    const draftId=id||createDraftId();
    try{
      const current=list().filter((draft)=>draft.id!==draftId);
      localStorage.setItem(key,JSON.stringify({version:VERSION,drafts:[{id:draftId,savedAt:Date.now(),value},...current]} satisfies CollectionEnvelope<T>));
      setRevision((value)=>value+1);
      return draftId;
    }catch{return "";}
  },[key,list]);
  const read=useCallback((id:string)=>list().find((draft)=>draft.id===id)??null,[list]);
  const remove=useCallback((id:string)=>{
    if(!key||typeof localStorage==="undefined")return;
    try{
      const remaining=list().filter((draft)=>draft.id!==id);
      if(remaining.length)localStorage.setItem(key,JSON.stringify({version:VERSION,drafts:remaining} satisfies CollectionEnvelope<T>));else localStorage.removeItem(key);
      setRevision((value)=>value+1);
    }catch{/* storage may be unavailable */}
  },[key,list]);
  return useMemo(()=>({key,list,read,save,remove}),[key,list,read,save,remove]);
}
