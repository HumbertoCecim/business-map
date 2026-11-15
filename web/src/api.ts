import type { Board, Command } from '../../shared/model';
export type Snapshot = { board: Board; fingerprint: string; root: string; warning?: string; migrationRequired?:boolean };
export type AskJob = {id:string;status:'running'|'done'|'error'|'cancelled';text?:string;error?:string;suggestionIds?:string[]};
export const uid = (prefix='item') => `${prefix}-${crypto.randomUUID()}`;
const tokenKey='floorplan.access';
const hash=new URLSearchParams(location.hash.slice(1));
if(hash.has('token')) {sessionStorage.setItem(tokenKey,hash.get('token')!); history.replaceState(null,'',location.pathname+location.search);}
let pairingError:Error|undefined;
const ready=hash.has('code')?(async()=>{
 const code=hash.get('code')!;history.replaceState(null,'',location.pathname+location.search);
 try{const response=await fetch('/api/pair/viewer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});const value=await response.json();if(!response.ok||!value.token)throw new Error(value.error||'O código de acesso expirou. Abra novamente pelo comando local.');sessionStorage.setItem(tokenKey,value.token);}catch(e){pairingError=e instanceof Error?e:new Error(String(e));}
})():Promise.resolve();
export class ApiError extends Error {constructor(message:string, public status:number){super(message);}}
export async function api<T>(path:string, body?:unknown, method=body===undefined?'GET':'POST', signal?:AbortSignal):Promise<T>{
 await ready;if(pairingError)throw pairingError;
 const response=await fetch(path,{method,signal,headers:{Authorization:`Bearer ${sessionStorage.getItem(tokenKey)||''}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new ApiError(data.error?.message||data.error||data.message||`Não foi possível concluir (${response.status}).`,response.status);
 return data as T;
}
export function command(snapshot:Snapshot, command:Command){return api<Snapshot>('/api/command',{expectedRevision:snapshot.board.revision,expectedFingerprint:snapshot.fingerprint,command,requestId:uid('request')});}
export async function stream(onSnapshot:(s:Snapshot)=>void,onState:(online:boolean)=>void,signal:AbortSignal){
 await ready;if(pairingError){onState(false);return;}
 while(!signal.aborted){try{
  const response=await fetch('/api/events',{headers:{Authorization:`Bearer ${sessionStorage.getItem(tokenKey)||''}`},signal});
  if(!response.ok||!response.body)throw new Error('Conexão indisponível');onState(true);
  const reader=response.body.getReader(), decoder=new TextDecoder();let buffer='';
  while(!signal.aborted){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');let index;
   while((index=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,index);buffer=buffer.slice(index+2);const data=block.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');if(data){try{const s=JSON.parse(data);if(s.board&&s.fingerprint)onSnapshot(s);}catch{ /* heartbeat */ }}}
  }
 }catch(e){if(signal.aborted)return;onState(false);} if(!signal.aborted)await new Promise(resolve=>setTimeout(resolve,2000));
 }
}
