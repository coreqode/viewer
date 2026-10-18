import * as THREE from 'three';
import {formatOf} from './formats.js';
import {createWorkerReader} from './worker-client.js';

const readAnalysis=createWorkerReader(new URL('./mesh-analysis-worker.js',import.meta.url),'mesh analysis');
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
export async function captureMeshInfo(source,cancelled=()=>false){
  const root=source.geometry;root.updateMatrixWorld(true);
  const objects=[];root.traverse(object=>{if(object.geometry?.attributes.position&&(object.isMesh||object.isLine||object.isPoints))objects.push(object);});
  const overview={name:source.name,format:formatOf(source.name)?.name||'Geometry',files:source.fileInfo||[],objects:objects.length,meshInstances:0,lineObjects:0,pointObjects:0,positionRecords:0,triangles:0,lineSegments:0,points:0,bounds:null};
  const box=new THREE.Box3(),point=new THREE.Vector3(),matrix=new THREE.Matrix4(),instance=new THREE.Matrix4();
  const parts=[];
  for(const [objectIndex,object] of objects.entries()){
    object.skeleton?.update();
    const geometry=object.geometry,attribute=geometry.attributes.position;
    const kind=object.isMesh?'mesh':object.isLine?'lines':'points';
    const sourceIndices=geometry.index?.array;
    const count=sourceIndices?.length??attribute.count;
    let indices;
    if(kind==='mesh'){
      const size=Math.floor(count/3)*3;indices=new Uint32Array(size);
      for(let i=0;i<size;i++)indices[i]=sourceIndices?sourceIndices[i]:i;
    }else if(kind==='points'){
      indices=sourceIndices?new Uint32Array(sourceIndices):Uint32Array.from({length:count},(_,i)=>i);
    }else{
      const segments=object.isLineSegments?Math.floor(count/2):Math.max(0,count-1)+(object.isLineLoop&&count>1?1:0);
      indices=new Uint32Array(segments*2);
      for(let i=0;i<segments;i++){
        const a=object.isLineSegments?i*2:i,b=object.isLineSegments?a+1:(i+1)%count;
        indices[i*2]=sourceIndices?sourceIndices[a]:a;indices[i*2+1]=sourceIndices?sourceIndices[b]:b;
      }
    }
    const copies=object.isInstancedMesh?object.count:1;
    for(let copy=0;copy<copies;copy++){
      if(cancelled())throw new DOMException('Analysis cancelled.','AbortError');
      matrix.copy(object.matrixWorld);
      if(object.isInstancedMesh){object.getMatrixAt(copy,instance);matrix.multiply(instance);}
      const positions=new Float64Array(attribute.count*3);
      for(let i=0;i<attribute.count;i++){
        if(object.isMesh)object.getVertexPosition(i,point);else point.fromBufferAttribute(attribute,i);
        point.applyMatrix4(matrix);
        if(!Number.isFinite(point.x+point.y+point.z))throw Error('The geometry contains non-finite coordinates.');
        point.toArray(positions,i*3);
        if(i%50000===0){await pause();if(cancelled())throw new DOMException('Analysis cancelled.','AbortError');}
      }
      for(let k=0;k<indices.length;k++){
        const index=indices[k];if(index>=attribute.count)throw Error('The geometry contains invalid indices.');point.fromArray(positions,index*3);box.expandByPoint(point);
        if(k%150000===0){await pause();if(cancelled())throw new DOMException('Analysis cancelled.','AbortError');}
      }
      const primitiveCount=indices.length/(kind==='mesh'?3:kind==='lines'?2:1);
      parts.push({name:(object.name||`Object ${objectIndex+1}`)+(object.isInstancedMesh?` · instance ${copy+1}`:''),kind,positions,indices:new Uint32Array(indices),indexed:!!sourceIndices,attributes:Object.entries(geometry.attributes).map(([name,value])=>`${name} (${value.itemSize})`),vertex_records:attribute.count,primitives:primitiveCount});
      overview.positionRecords+=attribute.count;
      if(kind==='mesh'){overview.meshInstances++;overview.triangles+=primitiveCount;}
      else if(kind==='lines'){overview.lineObjects++;overview.lineSegments+=primitiveCount;}
      else{overview.pointObjects++;overview.points+=primitiveCount;}
    }
  }
  if(!box.isEmpty()){
    overview.bounds=[box.min.toArray(),box.max.toArray()];overview.extents=box.getSize(new THREE.Vector3()).toArray();overview.diagonal=box.min.distanceTo(box.max);overview.boxCenter=box.getCenter(new THREE.Vector3()).toArray();
  }
  const extension=source.name.toLowerCase().split('.').pop();
  overview.units=['step','stp','iges','igs'].includes(extension)?'mm (CAD importer)':['glb','gltf'].includes(extension)?'m (glTF convention)':'Source units; unspecified';
  overview.original=source.original?.info;overview.cad=!!source.original?.cad;overview.volumeCells=!!source.original?.volume;overview.linearized=!!source.original?.linearized;overview.skipped=source.original?.skipped||[];
  return {overview,parts};
}

const number=value=>value==null?'Not available':typeof value==='boolean'?(value?'Yes':'No'):typeof value==='number'?(Number.isInteger(value)?value.toLocaleString():Math.abs(value)<1e-4&&value!==0||Math.abs(value)>=1e7?value.toExponential(5):value.toLocaleString(undefined,{maximumSignificantDigits:7})):String(value);
const vector=value=>value?.map(number).join(' · ')||'Not available';
function node(tag,text,className){const result=document.createElement(tag);if(text!=null)result.textContent=text;if(className)result.className=className;return result;}
function list(parent,title){const section=node('section',null,'info-section');section.append(node('h2',title));const dl=node('dl');section.append(dl);parent.append(section);return dl;}
function row(dl,label,value){dl.append(node('dt',label),node('dd',value));}
function note(parent,text){parent.append(node('p',text,'section-note'));}
export function renderOverview(parent,overview){
  const file=list(parent,'File');
  row(file,'Name',overview.name);row(file,'Format',overview.format);
  row(file,'Size',(overview.files.reduce((sum,item)=>sum+item.size,0)/1024/1024).toLocaleString(undefined,{maximumFractionDigits:2})+' MiB');
  const geometry=list(parent,'Geometry');
  row(geometry,'Objects',number(overview.objects));row(geometry,'Vertex records',number(overview.positionRecords));
  if(overview.meshInstances)row(geometry,'Triangles',number(overview.triangles));
  if(overview.lineObjects)row(geometry,'Segments',number(overview.lineSegments));
  if(overview.pointObjects)row(geometry,'Points',number(overview.points));
  if(overview.extents)row(geometry,'Size · XYZ',vector(overview.extents));
  row(geometry,'Units',overview.units==='Source units; unspecified'?'Unspecified':overview.units);
  if(overview.original){row(geometry,'Source nodes',number(overview.original.points));row(geometry,'Source elements',number(overview.original.cells));}
  if(overview.volumeCells)note(parent,'Topology includes internal cell faces.');
  if(overview.cad)note(parent,'Measurements use the CAD tessellation.');
  if(overview.skipped.length)note(parent,'Some unsupported elements were omitted.');
}
export function renderAnalysis(parent,result){
  const meshes=result.parts.filter(part=>part.kind==='mesh'&&!part.error&&part.area!=null);
  if(meshes.length){
    const summary=list(parent,'Surface · sum across objects');
    for(const [label,key] of [['Area · units²','area'],['Unique edges','unique_edges'],['Boundary edges','boundary_edges'],['Edges with >2 faces','nonmanifold_edges'],['Components','components'],['Duplicate triangles','duplicate_triangles'],['Degenerate triangles','degenerate_triangles']])row(summary,label,number(meshes.reduce((sum,part)=>sum+(part[key]||0),0)));
    row(summary,'Edge-closed objects',`${meshes.filter(part=>part.watertight).length} / ${meshes.length}`);
  }
  const objects=node('details');objects.append(node('summary','Object details'));parent.append(objects);
  for(const part of result.parts){
    const metrics=list(objects,part.name);
    if(part.error){row(metrics,'Analysis',part.error);continue;}
    row(metrics,'Type',part.kind);row(metrics,'Primitives',number(part.primitives));
    if(part.kind==='mesh'){
      row(metrics,'Euler characteristic',number(part.euler));row(metrics,'Consistent winding',number(part.winding_consistent));
      row(metrics,'Boundary loops',part.boundary?.loops==null?'Unavailable':number(part.boundary.loops));
      row(metrics,'Signed volume · units³',number(part.signed_volume));
    }else if(part.kind==='lines'){
      row(metrics,'Total length',number(part.length));row(metrics,'Components',number(part.components));
    }else if(part.kind==='points'){
      row(metrics,'Unique positions',number(part.unique_positions));row(metrics,'Duplicate positions',number(part.duplicate_positions));
    }
  }
  if(result.parts.some(part=>part.error))note(parent,'Summary includes successfully analyzed objects only.');
}

export function setupMeshInfo({panel,button,close,body,status,connectivity,download,getSource}){
  let revision=0,pending=false,report;
  const cache=new WeakMap();
  function stop(){revision++;if(pending)readAnalysis.cancel();pending=false;}
  async function refresh(){
    stop();const id=revision,source=getSource();body.replaceChildren();report=undefined;download.disabled=true;
    if(!source){status.textContent='Open mesh geometry to inspect its information.';return;}
    status.textContent='Reading geometry…';
    try{
      const weld=connectivity.value==='welded',key=weld?'welded':'indexed';
      const cached=cache.get(source)?.[key];
      if(cached){report=cached;renderOverview(body,report.overview);renderAnalysis(body,report.analysis);status.textContent=report.analysisStatus==='partial'?'Partial analysis.':'Ready';download.disabled=false;return;}
      const {overview,parts}=await captureMeshInfo(source,()=>id!==revision);
      if(id!==revision)return;
      report={schema:1,overview,connectivity:key,analysisStatus:'pending'};renderOverview(body,overview);
      status.textContent='Analyzing… First use downloads analysis packages.';
      pending=true;
      const transfer=parts.flatMap(part=>[part.positions.buffer,part.indices.buffer]);
      const result=await readAnalysis({parts,weld},transfer);
      if(id!==revision)return;
      pending=false;report.analysis=result;report.analysisStatus=result.parts.some(part=>part.error)?'partial':'ready';renderAnalysis(body,result);status.textContent=report.analysisStatus==='partial'?'Partial analysis.':'Ready';download.disabled=false;
      const entry=cache.get(source)||{};entry[key]=report;cache.set(source,entry);
    }catch(error){if(id===revision&&error.name!=='AbortError'){pending=false;status.textContent=error.message||'Analysis unavailable.';status.dataset.error='true';if(report){report.analysisStatus='unavailable';report.analysisError=status.textContent;download.disabled=false;}}}
  }
  button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(panel.hidden)stop();else{status.dataset.error='false';refresh();}};
  close.onclick=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');stop();button.focus();};
  connectivity.onchange=()=>{status.dataset.error='false';refresh();};
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close.click();}});
  download.onclick=()=>{
    if(!report)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=node('a');link.href=url;link.download=(report.overview.name.replace(/\.[^.]+$/,'').replace(/[\\/\x00-\x1f]/g,'_')||'mesh')+'-info.json';link.hidden=true;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  };
  return {changed(){stop();report=undefined;body.replaceChildren();download.disabled=true;status.textContent='';status.dataset.error='false';if(!panel.hidden)refresh();},hide(){panel.hidden=true;button.setAttribute('aria-expanded','false');stop();report=undefined;body.replaceChildren();download.disabled=true;}};
}
