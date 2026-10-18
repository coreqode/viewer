import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {loadGeometry} from './model-loaders.js?v=memory-cleanup-1';
import {formats,modelCandidates,formatOf} from './formats.js';
import {captureConversion,releaseConversion,conversionNote,exportConversion} from './conversion.js?v=memory-cleanup-1';
import {setupMeshInfo} from './mesh-info.js?v=minimal-1';
import {createOrientationGizmo} from './orientation-gizmo.js';

const $=selector=>document.querySelector(selector);
const notice=$('#notice');
let noticeTimer;
function notify(message,error=false,persistent=false){
  clearTimeout(noticeTimer);
  notice.textContent=message;notice.dataset.error=error;notice.hidden=false;
  if(!persistent)noticeTimer=setTimeout(()=>notice.hidden=true,error?10000:6000);
}
let renderer;
try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}
catch {notify('WebGL is unavailable. Please open this viewer in a browser with WebGL enabled.',true,true);throw Error('WebGL unavailable');}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0xf7f7f5,1);
$('#viewport').append(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(35,1,0.01,100);
const controls=new OrbitControls(camera,renderer.domElement);
const orientationGizmo=createOrientationGizmo($('#orientation-gizmo'));
controls.enableDamping=true;controls.dampingFactor=.09;controls.enabled=false;
for(const button of document.querySelectorAll('.toolbar button'))button.disabled=true;
scene.add(new THREE.HemisphereLight(0xffffff,0xaba4b5,2.5));
const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-3,6,5);scene.add(key);
const fill=new THREE.DirectionalLight(0xe1e6fb,1);fill.position.set(4,0,-4);scene.add(fill);
const grid=new THREE.GridHelper(12,24,0xc4c8bd,0xe1e4db);grid.position.y=-1.45;grid.visible=false;scene.add(grid);
let current,mode='edges',loadId=0;
let conversionSource,converting=false;
let activeSdf;
const meshInfo=setupMeshInfo({panel:$('#info-panel'),button:$('#info'),close:$('#close-info'),body:$('#info-body'),status:$('#info-status'),connectivity:$('#info-connectivity'),download:$('#download-info'),getSource:()=>activeSdf?undefined:conversionSource});
const viewCenter=new THREE.Vector3();
let radius=1.6;
function fit(){
  const distance=radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))/Math.min(camera.aspect,1)*1.12;
  camera.position.set(.65,.4,1).normalize().multiplyScalar(distance).add(viewCenter);
  camera.near=distance/1000;camera.far=distance*100;camera.updateProjectionMatrix();
  controls.target.copy(viewCenter);controls.minDistance=radius*.05;controls.maxDistance=distance*20;controls.update();
}
function dispose(object){
  object.traverse(child=>{
    child.geometry?.dispose();
    if(child.material){for(const material of [].concat(child.material))material.dispose();}
  });
}
function viewMode(){
  current?.traverse(child=>{
    if(child.userData.edge)child.visible=mode==='edges';
    else if(child.isMesh)child.material.wireframe=mode==='wire';
  });
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
}
function display(object,name){
  let vertices=0,triangles=0;
  object.updateMatrixWorld(true);
  const extras=[];
  object.traverse(child=>{if(child.isLight||child.isCamera)extras.push(child);});
  extras.forEach(child=>child.removeFromParent());
  object.traverse(child=>{
    if(!child.geometry)return;
    const position=child.geometry.attributes.position;
    if(!position)return;
    for(let i=0;i<position.array.length;i++)if(!Number.isFinite(position.array[i]))throw Error('The mesh contains invalid coordinates.');
    vertices+=position.count*(child.isInstancedMesh?child.count:1);
    if(vertices>2000000)throw Error('This model exceeds the 2 million display vertex limit.');
    if(child.isMesh){
      triangles+=(child.geometry.index?.count ?? position.count)/3*(child.isInstancedMesh?child.count:1);
      if(triangles>2000000)throw Error('This mesh exceeds the 2 million display triangle limit.');
      const previous=child.material;
      child.material=new THREE.MeshStandardMaterial({color:0xb9b3c9,roughness:.85,metalness:0,flatShading:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
      for(const material of [].concat(previous)){if(!material)continue;for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose();}
    }
  });
  if(!vertices)throw Error('No visible geometry found in this file.');
  const bounds=new THREE.Box3().setFromObject(object);
  const size=bounds.getSize(new THREE.Vector3());
  const center=bounds.getCenter(new THREE.Vector3());
  const extent=Math.max(size.x,size.y,size.z);
  const wrapper=new THREE.Group();
  object.position.sub(center);wrapper.add(object);
  wrapper.scale.setScalar(extent>0?2.6/extent:1);
  // Add triangle edges only after validation; keep the incoming scene untouched on errors.
  const meshes=[];object.traverse(child=>{if(child.isMesh && !child.isSkinnedMesh && !child.isInstancedMesh && !child.morphTargetInfluences?.some(value=>value!==0))meshes.push(child);});
  for(const mesh of meshes){
    const edge=new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x51475d,transparent:true,opacity:.20}));
    edge.userData.edge=true;mesh.add(edge);
  }
  if(current){scene.remove(current);dispose(current);}
  current=wrapper;scene.add(current);
  radius=new THREE.Box3().setFromObject(current).getBoundingSphere(new THREE.Sphere()).radius || 1;
  grid.position.y=new THREE.Box3().setFromObject(current).min.y-.05;
  viewCenter.set(0,0,0);fit();viewMode();
  controls.enabled=true;for(const button of document.querySelectorAll('.toolbar button'))button.disabled=false;
  $('.corner-label').hidden=false;$('#model-label').textContent=name;
  $('#stats').textContent=`${vertices.toLocaleString()} vertices · ${Math.round(triangles).toLocaleString()} triangles`;
  $('#drop-hint').hidden=true;
}

let selectedFiles=[];
async function openFiles(files,selectedModel){
  if(!files.length)return;
  const candidates=modelCandidates(files);
  if(!selectedModel && candidates.length>1){
    selectedFiles=files;
    const select=$('#model-choice');select.replaceChildren();
    for(const candidate of candidates){
      const option=document.createElement('option');option.textContent=candidate.webkitRelativePath||candidate.name;
      option.value=String(files.indexOf(candidate));select.append(option);
    }
    if(!$('#model-dialog').open)$('#model-dialog').showModal();
    return;
  }
  const primary=selectedModel||candidates[0];
  if(primary && formatOf(primary.name)?.reader==='sdf'){await openSdfFiles(files,primary);return;}
  const id=++loadId;
  notify('Opening geometry…',false,true);
  let object,nextConversion;
  try{
    const result=await loadGeometry(files,message=>{if(id===loadId)notify(message,false,true);},selectedModel);
    object=result.object;
    if(id!==loadId){dispose(object);return;}
    nextConversion=captureConversion(object,result.name,result.conversion);
    nextConversion.fileInfo=files.map(file=>({name:file.webkitRelativePath||file.name,size:file.size}));
    display(object,result.name);clearSdf();notice.hidden=true;
    releaseConversion(conversionSource);conversionSource=nextConversion;nextConversion=undefined;
    meshInfo.changed();
    $('#convert').disabled=converting;
    if(result.warning)notify(result.warning,false,true);
  }catch(error){
    releaseConversion(nextConversion);
    if(object && object.parent!==current)dispose(object);
    if(id===loadId)notify(error.message||'This file could not be opened.',true,true);
  }
}
const convertDialog=$('#convert-dialog');
let dialogSource;
function selectedTarget(){return dialogSource.targets.find(target=>target.id===$('#export-format').value);}
function updateExportNote(){const target=selectedTarget();$('#export-note').textContent=target?conversionNote(dialogSource,target):'No compatible export format is available.';}
$('#convert').onclick=()=>{
  if(!conversionSource||converting)return;
  dialogSource=conversionSource;
  $('#convert-source').textContent=dialogSource.name;
  const select=$('#export-format');select.replaceChildren();
  for(const [kind,label] of [['mesh','Original mesh — keeps volume elements'],['geometry','Loaded geometry — mesh / scene export']]){
    const targets=dialogSource.targets.filter(target=>target.kind===kind);if(!targets.length)continue;
    const group=document.createElement('optgroup');group.label=label;
    for(const target of targets){const option=document.createElement('option');option.value=target.id;option.textContent=target.label;group.append(option);}
    select.append(group);
  }
  $('#convert-status').textContent='';$('#convert-status').dataset.error=false;
  updateExportNote();convertDialog.showModal();
};
$('#export-format').onchange=updateExportNote;
$('#close-convert').onclick=()=>convertDialog.close();
convertDialog.addEventListener('close',()=>{if(!converting)dialogSource=undefined;});
convertDialog.addEventListener('click',event=>{if(event.target===convertDialog)convertDialog.close();});
$('#download-converted').onclick=async()=>{
  if(converting)return;
  const source=dialogSource,target=selectedTarget();if(!target)return;
  converting=true;$('#convert').disabled=true;$('#download-converted').disabled=true;$('#export-format').disabled=true;
  $('#convert-status').dataset.error=false;$('#convert-status').textContent='Converting… Large meshes can take a moment.';
  try{
    const result=await exportConversion(source,target);
    const url=URL.createObjectURL(result.blob);
    const link=document.createElement('a');link.href=url;link.download=result.filename;link.hidden=true;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    $('#convert-status').textContent=`Download ready: ${result.filename}${result.warning?' · '+result.warning:''}`;
  }catch(error){$('#convert-status').dataset.error=true;$('#convert-status').textContent=error.message||'This conversion could not be completed.';}
  finally{converting=false;$('#convert').disabled=!!activeSdf||!conversionSource;$('#download-converted').disabled=false;$('#export-format').disabled=false;if(!convertDialog.open)dialogSource=undefined;}
};
$('#open').onclick=()=>$('#file').click();
$('#file').onchange=event=>{openFiles(Array.from(event.target.files));event.target.value='';};
notice.onclick=()=>{notice.hidden=true;};
notice.onkeydown=event=>{if(event.key==='Enter'||event.key==='Escape')notice.hidden=true;};
const formatsDialog=$('#formats-dialog');
for(const reader of ['three','meshio','cad','sdf']){
  const list=formatsDialog.querySelector(`[data-reader="${reader}"]`);
  for(const format of formats.filter(item=>item.reader===reader)){
    const row=document.createElement('li');
    const title=document.createElement('strong');title.textContent=format.name;
    const extensions=document.createElement('code');extensions.textContent=format.extensions.map(extension=>'.'+extension).join(' ');
    row.append(title,extensions);
    if(format.note){const note=document.createElement('span');note.textContent=format.note;row.append(note);}
    list.append(row);
  }
}
$('#formats').onclick=()=>formatsDialog.showModal();
$('#close-formats').onclick=()=>formatsDialog.close();
formatsDialog.addEventListener('click',event=>{if(event.target===formatsDialog)formatsDialog.close();});
function clearSdf(){
  activeSdf?.view.dispose();activeSdf=undefined;
  renderer.domElement.style.opacity='1';$('#convert').title='Convert the loaded geometry';$('#sdf-settings').hidden=true;$('#grid').disabled=false;
  for(const button of document.querySelectorAll('[data-mode]'))button.disabled=false;
  $('#info').disabled=false;$('#info').hidden=false;
}
const watchedSdfDevices=new WeakSet();
function watchSdfDevice(device){
  if(watchedSdfDevices.has(device))return;
  watchedSdfDevices.add(device);
  // One listener per shared device; never close over a loaded field or its files.
  device.lost.then(info=>{
    if(activeSdf?.device===device){activeSdf.failed=true;notify('The WebGPU device was lost. Reopen the field to retry. '+info.message,true,true);}
  });
}
function sdfNotice(sample){
  if(sample.config.iso<sample.minimum||sample.config.iso>sample.maximum)return 'This level lies outside the sampled value range. Open Field to change the level or sampling bounds.';
  if(sample.boundaryMin<=sample.config.iso&&sample.boundaryMax>=sample.config.iso)return 'The level set crosses the sampling-box boundary. Use Field to adjust the bounds or resolution.';
  return 'ONNX scalar field · WebGPU ray marching. Use Field to adjust bounds, level and resolution.';
}
async function openSdfFiles(files,model,config={resolution:64,iso:0,min:[-1,-1,-1],max:[1,1,1]}){
  const id=++loadId;
  notify('Preparing ONNX field…',false,true);
  let next;
  try{
    const {buildSdfView}=await import('./sdf-view.js?v=memory-cleanup-1');
    next=await buildSdfView({files,model,config,onProgress:message=>{if(id===loadId)notify(message,false,true);},cancelled:()=>id!==loadId});
    if(id!==loadId){next.view.dispose();return;}
    clearSdf();
    if(current){scene.remove(current);dispose(current);current=undefined;}
    releaseConversion(conversionSource);conversionSource=undefined;
    activeSdf={...next,files,model,failed:false};
    meshInfo.hide();$('#info').disabled=true;$('#info').hidden=true;
    $('#viewport').append(next.view.canvas);renderer.domElement.style.opacity='0';
    const sample=next.view.sample;
    for(let axis=0;axis<3;axis++)viewCenter.setComponent(axis,(sample.config.min[axis]+sample.config.max[axis])/2);
    radius=new THREE.Vector3(...sample.config.max).sub(new THREE.Vector3(...sample.config.min)).length()/2;
    controls.enabled=true;$('#fit').disabled=false;$('.corner-label').hidden=false;
    fit();mode='solid';viewMode();grid.visible=false;$('#grid').setAttribute('aria-pressed','false');$('#grid').disabled=true;
    for(const button of document.querySelectorAll('[data-mode]'))button.disabled=button.dataset.mode!=='solid';
    $('#convert').disabled=true;$('#convert').title='Mesh conversion is unavailable for ONNX scalar fields.';$('#sdf-settings').hidden=false;
    $('#model-label').textContent=model.name+' · SCALAR FIELD';$('#drop-hint').hidden=true;
    $('#stats').textContent=sample.config.resolution+'³ samples · WebGPU ray marching';
    notify(sdfNotice(sample),false,true);
    watchSdfDevice(next.device);
  }catch(error){
    next?.view.dispose();
    if(id===loadId&&error.name!=='AbortError')notify(error.message||'Could not display this ONNX field.',true,true);
  }
}
const sdfDialog=$('#sdf-dialog');
$('#sdf-settings').onclick=()=>{
  if(!activeSdf)return;
  const sample=activeSdf.view.sample;
  ['x','y','z'].forEach((axis,index)=>{$('#sdf-min-'+axis).value=sample.config.min[index];$('#sdf-max-'+axis).value=sample.config.max[index];});
  $('#sdf-resolution').value=sample.config.resolution;$('#sdf-iso').value=sample.config.iso;$('#sdf-error').textContent='';
  $('#sdf-summary').textContent=`Sampled values: ${sample.minimum.toPrecision(5)} to ${sample.maximum.toPrecision(5)} · Inference: ${sample.backend} · Input: ${sample.inputName} [N,3] → ${sample.outputName} scalar output.`;
  sdfDialog.showModal();
};
$('#close-sdf').onclick=()=>sdfDialog.close();
sdfDialog.addEventListener('click',event=>{if(event.target===sdfDialog)sdfDialog.close();});
$('#sdf-form').onsubmit=async event=>{
  event.preventDefault();if(!activeSdf)return;
  const config={resolution:Number($('#sdf-resolution').value),iso:Number($('#sdf-iso').value),min:['x','y','z'].map(axis=>Number($('#sdf-min-'+axis).value)),max:['x','y','z'].map(axis=>Number($('#sdf-max-'+axis).value))};
  try{
    const {validateSdfConfig}=await import('./sdf-inference.js?v=memory-cleanup-1');validateSdfConfig(config);
    const original=activeSdf.view.sample.config;
    if(config.resolution===original.resolution&&config.min.every((value,index)=>value===original.min[index])&&config.max.every((value,index)=>value===original.max[index])){
      activeSdf.view.setIso(config.iso);sdfDialog.close();notify(sdfNotice(activeSdf.view.sample),false,true);
    }else{const {files,model}=activeSdf;sdfDialog.close();await openSdfFiles(files,model,config);}
  }catch(error){$('#sdf-error').textContent=error.message;}
};
$('#open-folder').onclick=()=>$('#folder').click();
$('#folder').onchange=event=>{formatsDialog.close();openFiles(Array.from(event.target.files));event.target.value='';};
$('#confirm-model').onclick=()=>{
  const file=selectedFiles[Number($('#model-choice').value)];
  $('#model-dialog').close();openFiles(selectedFiles,file);selectedFiles=[];
};
$('#cancel-model').onclick=()=>{$('#model-dialog').close();selectedFiles=[];};
$('#fit').onclick=fit;
function toggleGrid(){if(activeSdf)return;grid.visible=!grid.visible;$('#grid').setAttribute('aria-pressed',String(grid.visible));}
$('#grid').onclick=toggleGrid;
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{mode=button.dataset.mode;viewMode();};
window.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest('button,input,select,dialog'))return;
  if(event.key.toLowerCase()==='f')fit();
  if(event.key.toLowerCase()==='g')toggleGrid();
});
let dragDepth=0;
window.addEventListener('dragenter',event=>{event.preventDefault();if([...event.dataTransfer.types].includes('Files')){$('#drag-overlay').hidden=false;dragDepth++;}});
window.addEventListener('dragover',event=>event.preventDefault());
window.addEventListener('dragleave',event=>{event.preventDefault();if(--dragDepth<=0){dragDepth=0;$('#drag-overlay').hidden=true;}});
window.addEventListener('drop',event=>{event.preventDefault();dragDepth=0;$('#drag-overlay').hidden=true;openFiles(Array.from(event.dataTransfer.files));});
window.addEventListener('resize',()=>{
  renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
});
renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
fit();
renderer.setAnimationLoop(()=>{controls.update();orientationGizmo.update(camera);if(activeSdf){if(!activeSdf.failed){try{activeSdf.view.render(camera);}catch(error){activeSdf.failed=true;notify('WebGPU rendering stopped: '+error.message,true,true);}}}else renderer.render(scene,camera);});
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();notify('The graphics context was lost. Reload the page to restore the viewer.',true,true);});

