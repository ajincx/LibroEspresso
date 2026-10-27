import { useCallback, useMemo } from "react";

const VERSION=1;
const MAX_AGE_MS=7*24*60*60*1000;
type Envelope<T>={version:number;savedAt:number;value:T};

export function useLocalDraft<T>(identity:{userId?:string;branchId?:string|null;form:string;recordId?:string},validate:(value:unknown)=>value is T) {
  const key=useMemo(()=>identity.userId?`libro.draft.v${VERSION}.${identity.userId}.${identity.branchId??"global"}.${identity.form}.${identity.recordId??"new"}`:"",[identity.userId,identity.branchId,identity.form,identity.recordId]);
  const read=useCallback(()=>{if(!key)return null;try{const parsed=JSON.parse(localStorage.getItem(key)??"null") as Envelope<unknown>|null;if(!parsed||parsed.version!==VERSION||Date.now()-parsed.savedAt>MAX_AGE_MS||!validate(parsed.value)){localStorage.removeItem(key);return null;}return parsed.value;}catch{localStorage.removeItem(key);return null;}},[key,validate]);
  const save=useCallback((value:T)=>{if(!key)return;try{localStorage.setItem(key,JSON.stringify({version:VERSION,savedAt:Date.now(),value} satisfies Envelope<T>));}catch{/* storage may be unavailable */}},[key]);
  const clear=useCallback(()=>{if(key)try{localStorage.removeItem(key);}catch{/* storage may be unavailable */}},[key]);
  return useMemo(()=>({read,save,clear,key}),[read,save,clear,key]);
}
