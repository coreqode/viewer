import * as THREE from 'three';
import {clone} from './vendor/three/utils/SkeletonUtils.js';
import {readMesh as convertMesh} from './model-loaders.js?v=memory-cleanup-1';

const sceneTargets=[
  {id:'obj',label:'OBJ (.obj)',extension:'obj',kind:'geometry',mime:'text/plain'},
  {id:'stl',label:'STL — binary (.stl)',extension:'stl',kind:'geometry',mime:'application/octet-stream'},
  {id:'ply',label:'PLY — binary (.ply)',extension:'ply',kind:'geometry',mime:'application/octet-stream'},
  {id:'glb',label:'GLB (.glb)',extension:'glb',kind:'geometry',mime:'model/gltf-binary'},
  {id:'gltf',label:'glTF — embedded buffers (.gltf)',extension:'gltf',kind:'geometry',mime:'model/gltf+json'}
];
const meshTargets=[
  {id:'vtu',label:'VTU (.vtu)',extension:'vtu',kind:'mesh'},
  {id:'vtk',label:'VTK (.vtk)',extension:'vtk',kind:'mesh'},
  {id:'gmsh22',label:'Gmsh 2.2 (.msh)',extension:'msh',kind:'mesh'},
  {id:'abaqus',label:'Abaqus (.inp)',extension:'inp',kind:'mesh'},
  {id:'nastran',label:'Nastran (.bdf)',extension:'bdf',kind:'mesh'}
];
// Capture the loaded scene BEFORE the viewer centers or scales it.
// SkeletonUtils preserves skeleton references; serializers handle format encoding.
export function captureConversion(object,name,original){
  const geometry=clone(object);
  const extras=[];
  let meshes=0,points=0,lines=0,advanced=false;
  geometry.traverse(child=>{
    if(child.isLight||child.isCamera)extras.push(child);
    if(child.isMesh){
      meshes++;
      advanced ||= !!(child.isSkinnedMesh||child.isInstancedMesh||child.morphTargetInfluences?.some(value=>value!==0));
      child.material=new THREE.MeshStandardMaterial({color:0xb9b3c9,roughness:.85,side:THREE.DoubleSide});
    }else if(child.isPoints){points++;child.material=new THREE.PointsMaterial({color:0x807391,size:.025});}
    else if(child.isLine){lines++;child.material=new THREE.LineBasicMaterial({color:0x807391});}
  });
  extras.forEach(child=>child.removeFromParent());
  geometry.updateMatrixWorld(true);
  const available=sceneTargets.filter(target=>{
    if(['glb','gltf'].includes(target.id))return true;
    if(advanced)return false;
    if(target.id==='stl')return meshes>0;
    if(target.id==='ply')return !lines && !(meshes && points);
    return true;
  });
  return {geometry,name,original,targets:[...available,...meshTargets.filter(target=>original?.targets?.includes(target.id))]};
}
export function releaseConversion(source){
  // Geometry buffers are shared with the viewer; only these independent materials are owned here.
  source?.geometry.traverse(child=>{for(const material of [].concat(child.material||[]))material.dispose();});
}
export function conversionNote(source,target){
  if(target.kind==='mesh')return 'Uses original nodes, coordinates and element connectivity. Metadata and field support depend on the output format; exporter warnings are shown.';
  const messages=['Exports loaded geometry in its original coordinates. Materials, textures, animations and simulation fields are omitted.'];
  if(['glb','gltf'].includes(target.id))messages.push('No unit conversion is performed; glTF consumers normally interpret coordinates in meters.');
  if(target.id==='stl')messages.push('STL contains triangles only; lines and points are omitted.');
  if(source.original?.volume)messages.push('Volume meshes export ALL display cell faces, including internal faces. Choose an original-mesh format to preserve volume elements.');
  if(source.original?.linearized)messages.push('Higher-order elements export as straight triangles between corner nodes.');
  if(source.original?.skipped?.length)messages.push('Unsupported elements omitted from the view are also omitted from this export.');
  if(source.original?.cad)messages.push('CAD output is a triangulated approximation. STEP/IGES import coordinates use millimeters; BREP units are unspecified.');
  return messages.join(' ');
}
export async function exportConversion(source,target){
  if(!source.targets.some(option=>option.id===target.id && option.kind===target.kind))throw Error('This output is not available for the loaded geometry.');
  let data,warning='';
  if(target.kind==='mesh'){
    const original=source.original;
    const files=await Promise.all(original.files.map(async file=>({path:file.webkitRelativePath||file.name,bytes:await file.arrayBuffer()})));
    const result=await convertMesh({action:'convert',files,filename:original.filename,packages:original.packages,target:target.id},files.map(file=>file.bytes));
    data=result.bytes;warning=result.warning||'';
  }else{
    // Exporter traversal must use source matrices, never normalized viewer matrices.
    source.geometry.updateMatrixWorld(true);
    switch(target.id){
      case 'obj':{const {OBJExporter}=await import('./vendor/three/exporters/OBJExporter.js');data=new OBJExporter().parse(source.geometry);break;}
      case 'stl':{const {STLExporter}=await import('./vendor/three/exporters/STLExporter.js');data=new STLExporter().parse(source.geometry,{binary:true});break;}
      case 'ply':{const {PLYExporter}=await import('./vendor/three/exporters/PLYExporter.js');data=new PLYExporter().parse(source.geometry,undefined,{binary:true,littleEndian:true,excludeAttributes:['color','uv']});break;}
      case 'glb':case 'gltf':{
        const {GLTFExporter}=await import('./vendor/three/exporters/GLTFExporter.js');
        const output=await new GLTFExporter().parseAsync(source.geometry,{binary:target.id==='glb',onlyVisible:false,animations:[],includeCustomExtensions:false});
        data=target.id==='glb'?output:JSON.stringify(output,null,2);break;
      }
    }
  }
  if(data==null)throw Error('The exporter produced no file.');
  const base=source.name.replace(/\.[^.]+$/,'').replace(/[\\/\x00-\x1f]/g,'_')||'mesh';
  return {blob:new Blob([data],{type:target.mime||'application/octet-stream'}),filename:`${base}.${target.extension}`,warning};
}
