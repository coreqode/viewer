import * as THREE from 'three';
import {OBJLoader} from './vendor/OBJLoader.js';
import {STLLoader} from './vendor/STLLoader.js';
import {PLYLoader} from './vendor/PLYLoader.js';
import {formatOf,extensionOf,selectModel} from './formats.js';
import {createWorkerReader} from './worker-client.js';
import {cellGeometry} from './cell-geometry.js';

export const readMesh=createWorkerReader(new URL('./mesh-worker.js?v=memory-cleanup-1',import.meta.url),'mesh');
const readCAD=createWorkerReader(new URL('./cad-worker.js',import.meta.url),'CAD');
const text=bytes=>new TextDecoder().decode(bytes);
const placeholder='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

function localResources(files){
  const urls=new Map();
  const paths=files.map(file=>({file,path:(file.webkitRelativePath||file.name).replaceAll('\\','/')}));
  const manager=new THREE.LoadingManager();
  manager.setURLModifier(url=>{
    if(/^(data:|blob:)/i.test(url))return url;
    let name;
    try{name=decodeURIComponent(url.split(/[?#]/)[0]).replaceAll('\\','/');}catch{throw Error('Invalid companion-file URL.');}
    const matches=paths.filter(item=>name===item.path || name.endsWith('/'+item.path) || name.split('/').pop()===item.file.name);
    if(matches.length===1){
      const {file}=matches[0];
      if(!urls.has(file))urls.set(file,URL.createObjectURL(file));
      return urls.get(file);
    }
    // Appearance is outside this viewer's scope. Missing textures never block geometry.
    if(/\.(png|jpe?g|gif|webp|bmp|tga|tiff?|dds|ktx2?)$/i.test(name))return placeholder;
    if(matches.length>1)throw Error(`Several companion files match ${name}. Use distinct filenames.`);
    throw Error(`Missing companion file: ${name.split('/').pop()}. Select it together with the model.`);
  });
  return {manager,release:()=>{for(const url of urls.values())URL.revokeObjectURL(url);}};
}
function points(geometry){return new THREE.Points(geometry,new THREE.PointsMaterial({color:0x807391,size:.025}));}
export function fromCells(data){
  const buffers=cellGeometry(data);
  const group=new THREE.Group();
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(buffers.vertices,3));
  if(buffers.triangles.length){geometry.setIndex(buffers.triangles);geometry.computeVertexNormals();group.add(new THREE.Mesh(geometry));}
  else if(!buffers.lines.length && !buffers.pointIndices.length)group.add(points(geometry));
  if(buffers.lines.length){
    const lines=geometry.clone();lines.setIndex(buffers.lines);
    group.add(new THREE.LineSegments(lines,new THREE.LineBasicMaterial({color:0x807391})));
    if(!buffers.triangles.length)geometry.dispose();
  }
  if(buffers.pointIndices.length){
    const isolated=geometry.clone();isolated.setIndex(buffers.pointIndices);group.add(points(isolated));
    if(!buffers.triangles.length && !buffers.lines.length)geometry.dispose();
  }
  const warnings=[];
  if(buffers.linearized)warnings.push('Higher-order elements are displayed using their corner nodes.');
  if(buffers.skipped.length)warnings.push(`Skipped unsupported elements: ${buffers.skipped.join(', ')}.`);
  return {object:group,warning:warnings.join(' '),geometryInfo:{linearized:buffers.linearized,skipped:buffers.skipped}};
}
export function fromCAD(data){
  const group=new THREE.Group();
  for(const part of data.meshes){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.attributes.position.array,3));
    geometry.setIndex(part.index.array);
    if(part.attributes.normal)geometry.setAttribute('normal',new THREE.Float32BufferAttribute(part.attributes.normal.array,3));
    else geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry);mesh.name=part.name||'';group.add(mesh);
  }
  return {object:group,warning:'CAD faces are displayed as a triangulated approximation.'};
}
async function parseModel(bytes,extension,manager){
  switch(extension){
    case 'obj':return new OBJLoader().parse(text(bytes));
    case 'stl':return new THREE.Mesh(new STLLoader().parse(bytes));
    case 'ply':{
      const geometry=new PLYLoader().parse(bytes);
      return geometry.userData.hasFaces?new THREE.Mesh(geometry):points(geometry);
    }
    case 'glb':case 'gltf':{
      const [{GLTFLoader},{DRACOLoader},{MeshoptDecoder}]=await Promise.all([
        import('./vendor/three/loaders/GLTFLoader.js'),import('./vendor/three/loaders/DRACOLoader.js'),import('./vendor/three/libs/meshopt_decoder.module.js')
      ]);
      const draco=new DRACOLoader();draco.setDecoderPath(new URL('./vendor/three/libs/draco/gltf/',import.meta.url).href);draco.setWorkerLimit(2);
      const loader=new GLTFLoader(manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
      loader.register(parser=>({name:'VIEWER_GEOMETRY_ONLY',loadMaterial:()=>Promise.resolve(new THREE.MeshStandardMaterial()),beforeRoot:()=>{parser.json.animations=[];}}));
      try{return (await loader.parseAsync(bytes,'')).scene;}
      finally{draco.dispose();}
    }
    case 'fbx':{const {FBXLoader}=await import('./vendor/three/loaders/FBXLoader.js');return new FBXLoader(manager).parse(bytes,'');}
    case 'dae':{const {ColladaLoader}=await import('./vendor/three/loaders/ColladaLoader.js');return new ColladaLoader(manager).parse(text(bytes),'').scene;}
    case '3ds':{const {TDSLoader}=await import('./vendor/three/loaders/TDSLoader.js');return new TDSLoader(manager).parse(bytes,'');}
    case '3mf':{const {ThreeMFLoader}=await import('./vendor/three/loaders/3MFLoader.js');return new ThreeMFLoader(manager).parse(bytes);}
    case 'amf':{const {AMFLoader}=await import('./vendor/three/loaders/AMFLoader.js');return new AMFLoader(manager).parse(bytes);}
    case 'pcd':{const {PCDLoader}=await import('./vendor/three/loaders/PCDLoader.js');return new PCDLoader(manager).parse(bytes);}
    case 'xyz':{const {XYZLoader}=await import('./vendor/three/loaders/XYZLoader.js');return points(new XYZLoader().parse(text(bytes)));}
    case 'vtk':case 'vtp':{const {VTKLoader}=await import('./vendor/three/loaders/VTKLoader.js');return new THREE.Mesh(new VTKLoader(manager).parse(bytes));}
    default:throw Error('No model reader is available for this extension.');
  }
}
export async function loadGeometry(fileList,onProgress=()=>{},selectedModel){
  const files=Array.from(fileList);
  const file=selectedModel||selectModel(files),format=formatOf(file.name),extension=extensionOf(file.name);
  if(!files.includes(file)||!format)throw Error('Choose a supported model from the selected files.');
  if(files.reduce((total,file)=>total+file.size,0)>40*1024*1024)throw Error('Please select files totaling less than 40 MB.');
  const paths=files.map(file=>file.webkitRelativePath||file.name);
  if(new Set(paths).size!==paths.length)throw Error('Companion files must have distinct paths.');
  const bytes=await file.arrayBuffer();
  if(format.reader==='cad'){
    onProgress('Opening CAD geometry… Loading the CAD reader on first use.');
    return {...fromCAD(await readCAD({bytes,extension},[bytes])),name:file.name,conversion:{cad:true}};
  }
  const vtkPolyData=extension==='vtk' && /DATASET\s+POLYDATA/i.test(text(bytes.slice(0,512)));
  if(format.reader==='meshio' && !vtkPolyData){
    onProgress('Opening mesh… Loading the mesh reader on first use.');
    const selected=await Promise.all(files.map(async selected=>({path:selected.webkitRelativePath||selected.name,bytes:selected===file?bytes:await selected.arrayBuffer()})));
    const result=await readMesh({files:selected,filename:file.webkitRelativePath||file.name,packages:format.packages||[]},selected.map(file=>file.bytes));
    const display=fromCells(result);
    return {...display,name:file.name,conversion:{files,filename:file.webkitRelativePath||file.name,packages:format.packages||[],targets:result.conversion_targets,volume:result.cells.some(cell=>/^(tetra|hexahedron|wedge|pyramid|polyhedron)/.test(cell.type)),linearized:display.geometryInfo.linearized,skipped:display.geometryInfo.skipped,info:result.info}};
  }
  onProgress('Opening geometry…');
  const resources=localResources(files);
  try{
    const object=await parseModel(bytes,extension,resources.manager);
    const warnings=[];
    if(['glb','gltf','fbx','dae','3ds','3mf','amf'].includes(extension))warnings.push('Geometry only: materials and animations are not displayed.');
    return {object,name:file.name,warning:warnings.join(' ')};
  }finally{resources.release();}
}
