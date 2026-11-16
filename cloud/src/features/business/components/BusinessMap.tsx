import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow, useStore, type Node, type Edge, type NodeProps } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { ArrowUpRight, Check, Circle, Plus, Sparkles, Target } from 'lucide-react';
import type { Board } from '../../../business/model';
const elk=new ELK();
type Data=Record<string,unknown>&{title:string;text?:string;count?:number;ghost?:boolean;lane?:string;done?:boolean;focus?:boolean;sectionId?:string;suggestionId?:string;onAdd?:()=>void;onOpen?:()=>void;semanticType?:string;firstStep?:string;readOnly?:boolean};
function CardNode({data,selected}:NodeProps<Node<Data>>){return <div className={`map-card ${selected?'selected':''} ${data.ghost?'ghost':''} ${data.done?'is-done':''}`}>
 <Handle type="target" position={Position.Left}/><div className="card-eyebrow"><span>{data.ghost?<><Sparkles size={11}/> PROPOSTA</>:data.semanticType||'NOTA'}</span>{data.focus&&<Target size={13}/>}</div>
 <h3>{data.title||'Nota sem título'}</h3>{data.text&&<p>{data.text}</p>}<div className="card-bottom"><span className={data.lane==='now'?'now':''}>{data.done?<><Check size={11}/> Concluído</>:data.lane==='later'?'Depois':'Agora'}</span>{data.firstStep&&<ArrowUpRight size={13}/>}</div><Handle type="source" position={Position.Right}/></div>;}
function SectionNode({data,selected}:NodeProps<Node<Data>>){return <div className={`map-section ${selected?'selected':''} ${data.ghost?'ghost':''}`}><Handle type="target" position={Position.Left}/><div className="section-head"><div><span className="eyebrow">{data.ghost?'ÁREA PROPOSTA':'ÁREA DO NEGÓCIO'}</span><h2>{data.title||'Nova área'}</h2></div><span className="section-count">{data.count}</span></div>{data.count===0&&<p className="section-empty">Um espaço para desenvolver<br/>esta parte do negócio.</p>}<div className="section-foot">{data.ghost?<span><Sparkles size={12}/> Aguardando sua revisão</span>:<><button className="nodrag" onClick={e=>{e.stopPropagation();data.onAdd?.();}}>{!data.readOnly&&<Plus size={13}/>} {data.readOnly?'Explorar notas':Number(data.hiddenCards)>0?`Nova nota · +${data.hiddenCards} em detalhe`:'Nova nota'}</button><button className="nodrag icon-button" title="Abrir área" onClick={e=>{e.stopPropagation();data.onOpen?.();}}><ArrowUpRight size={15}/></button></>}</div><Handle type="source" position={Position.Right}/></div>;}
const nodeTypes={card:CardNode,section:SectionNode};
type Props={board:Board;selected:string;query:string;area:string|null;onSelect:(id:string)=>void;onAdd:(id:string)=>void;onOpen:(id:string)=>void;onProposal:(id:string)=>void;theme:string;readOnly?:boolean};
function MapInner({board,selected,query,area,onSelect,onAdd,onOpen,onProposal,theme,readOnly}:Props){
 const [layout,setLayout]=useState<{nodes:Node<Data>[];edges:Edge[]}>({nodes:[],edges:[]});const flow=useReactFlow();const width=useStore(s=>s.width),height=useStore(s=>s.height);
 const fittedSignature=useRef<string|null>(null);
 const signature=JSON.stringify([board.sections,board.relations,board.suggestions.filter(s=>s.kind==='map_draft'&&s.status==='pending'),area]);
 useEffect(()=>{if(!width||!height)return;let cancelled=false,frame=0,timer:number|undefined;const build=async()=>{
  const sections=board.sections.filter(s=>!area||s.id===area).map(s=>({...s,ghost:false,suggestionId:''}));
  if(!area)board.suggestions.filter(s=>s.status==='pending'&&s.mapDraft).forEach(s=>s.mapDraft!.sections.forEach(section=>{const existing=board.sections.find(a=>a.id===section.id),cards=section.cards.filter(c=>!board.sections.some(a=>a.cards.some(confirmed=>confirmed.id===c.id)));if(!existing||cards.length)sections.push({...section,cards,id:`ghost:${s.id}:${section.id}`,ghost:true,suggestionId:s.id});}));
  const cardOwners=new Map<string,string>();sections.forEach(s=>{cardOwners.set(s.id,s.id);s.cards.forEach(c=>cardOwners.set(c.id,s.id));});
  const relations=(board.relations||[]).filter(r=>cardOwners.has(r.fromId)&&cardOwners.has(r.toId));
  const groupWidth=area?350:300, cardHeight=area?146:116,gap=10,head=area?82:75,foot=38;
  const groupHeight=(s:typeof sections[number])=>head+Math.max(1,Math.min(area?500:3,s.cards.length))*(cardHeight+gap)+foot;
  const result:ElkNode=await elk.layout({id:'root',layoutOptions:{'elk.algorithm':'rectpacking','elk.aspectRatio':String(Math.max(.6,(width||900)/(height||650))),'elk.spacing.nodeNode':'25'},children:sections.map(s=>({id:s.id,width:groupWidth,height:groupHeight(s)}))});
  const nodes:Node<Data>[]=[];sections.forEach(s=>{const position=result.children?.find(n=>n.id===s.id);const height=groupHeight(s);
   nodes.push({id:s.id,type:'section',position:{x:position?.x||0,y:position?.y||0},style:{width:groupWidth,height},data:{title:s.title,count:s.cards.length,ghost:s.ghost,onAdd:()=>onAdd(s.id),onOpen:()=>onOpen(s.id),suggestionId:s.suggestionId,readOnly,hiddenCards:Math.max(0,s.cards.length-(area?500:3))},draggable:false});
   s.cards.slice(0,area?500:3).forEach((c,i)=>nodes.push({id:s.ghost?`ghost:${s.suggestionId}:${c.id}`:c.id,type:'card',parentId:s.id,extent:'parent',position:{x:14,y:head+i*(cardHeight+gap)},style:{width:groupWidth-28,height:cardHeight},data:{...c,ghost:s.ghost,focus:board.focus.cardIds.includes(c.id),sectionId:s.id,suggestionId:s.suggestionId},draggable:false}));
  });
  const nodeIds=new Set(nodes.map(n=>n.id));const edges:Edge[]=relations.map(r=>({id:r.id,source:nodeIds.has(r.fromId)?r.fromId:cardOwners.get(r.fromId)!,target:nodeIds.has(r.toId)?r.toId:cardOwners.get(r.toId)!,label:r.label,type:'smoothstep',markerEnd:{type:MarkerType.ArrowClosed,width:16,height:16},style:{stroke:'var(--edge)',strokeWidth:1.25},labelStyle:{fill:'var(--muted)',fontSize:12},labelBgStyle:{fill:'var(--paper)'},labelBgPadding:[7,5],labelBgBorderRadius:4}));
  if(!area)board.suggestions.filter(s=>s.status==='pending'&&s.mapDraft).forEach(s=>s.mapDraft!.relations.forEach(r=>{
   const endpoint=(id:string)=>nodeIds.has(id)?id:nodeIds.has(`ghost:${s.id}:${id}`)?`ghost:${s.id}:${id}`:cardOwners.get(id);
   const source=endpoint(r.fromId),target=endpoint(r.toId);if(source&&target&&nodeIds.has(source)&&nodeIds.has(target))edges.push({id:`ghost:${s.id}:${r.id}`,source,target,label:r.label,type:'smoothstep',markerEnd:{type:MarkerType.ArrowClosed,width:14,height:14},style:{stroke:'var(--edge)',strokeWidth:1.2,strokeDasharray:'5 4'},labelStyle:{fill:'var(--muted)',fontSize:12},labelBgStyle:{fill:'var(--canvas)'},labelBgPadding:[7,5]});
  }));
  if(!cancelled){setLayout({nodes,edges});
   // Refit new content, not host resizes or unchanged polling results. Preserve
   // the user's pan/zoom when the inspector or iframe changes dimensions.
   if(fittedSignature.current!==signature)frame=requestAnimationFrame(()=>{timer=window.setTimeout(()=>{if(cancelled)return;fittedSignature.current=signature;if(width<500&&!area)flow.setViewport({x:Math.max(12,(width-(result.width||650)*.55)/2),y:18,zoom:.55},{duration:300});else flow.fitView({padding:.07,maxZoom:1,duration:300});},80);});
  }
 };build().catch(console.error);return()=>{cancelled=true;cancelAnimationFrame(frame);window.clearTimeout(timer);};},[signature,width,height,readOnly]);
 const nodes=useMemo(()=>layout.nodes.map(n=>({...n,selected:n.id===selected,data:{...n.data,focus:board.focus.cardIds.includes(n.id)},className:query&&!`${n.data.title} ${n.data.text||''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())?'search-dim':''})),[layout.nodes,selected,query,board.focus.cardIds]);
 return <ReactFlow nodes={nodes} edges={layout.edges} nodeTypes={nodeTypes} onNodeClick={(_,node)=>{if(node.data.ghost)onProposal(node.data.suggestionId as string);else onSelect(node.id);}} onPaneClick={()=>onSelect(board.boardId)} fitView minZoom={.15} maxZoom={1.6} nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null} colorMode={theme==='dark'?'dark':'light'} proOptions={{hideAttribution:true}}><Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--dot)"/><Controls showInteractive={false}/>{nodes.length>8&&<MiniMap pannable zoomable nodeColor={n=>n.type==='section'?'var(--sage-soft)':'var(--paper)'} maskColor="transparent"/>}<div className="map-legend"><span><Circle size={9} fill="currentColor"/> Confirmado</span>{board.suggestions.some(s=>s.status==='pending'&&s.mapDraft)&&<span className="proposal-legend"><Sparkles size={11}/> Proposta para revisar</span>}</div></ReactFlow>;
}
export function BusinessMap(props:Props){return <ReactFlowProvider><MapInner {...props}/></ReactFlowProvider>;}
