// Supported entry points. Parsing belongs to the named third-party readers.
export const formats = [
  {name:'ONNX SDF',extensions:['onnx'],note:'float32 [N,3] → scalar. WebGPU required; include external weights.',reader:'sdf'},
  {name:'Wavefront OBJ',extensions:['obj'],reader:'three'},
  {name:'STL',extensions:['stl'],reader:'three'},
  {name:'PLY',extensions:['ply'],reader:'three'},
  {name:'glTF / GLB',extensions:['gltf','glb'],note:'.gltf: include referenced .bin files.',reader:'three'},
  {name:'FBX',extensions:['fbx'],reader:'three'},
  {name:'COLLADA',extensions:['dae'],reader:'three'},
  {name:'3D Studio',extensions:['3ds'],reader:'three'},
  {name:'3MF',extensions:['3mf'],reader:'three'},
  {name:'AMF',extensions:['amf'],reader:'three'},
  {name:'Point clouds',extensions:['pcd','xyz'],reader:'three'},
  {name:'VTK PolyData',extensions:['vtp'],reader:'three'},
  {name:'STEP',extensions:['step','stp'],reader:'cad'},
  {name:'IGES',extensions:['iges','igs'],note:'Surfaces only.',reader:'cad'},
  {name:'Open CASCADE BREP',extensions:['brep','brp'],reader:'cad'},
  {name:'Gmsh / ANSYS MSH',extensions:['msh'],reader:'meshio'},
  {name:'OFF',extensions:['off'],note:'Triangles only.',reader:'meshio'},
  {name:'VTK / VTU',extensions:['vtk','vtu'],reader:'meshio'},
  {name:'Abaqus',extensions:['inp'],reader:'meshio'},
  {name:'Nastran',extensions:['bdf','nas','fem'],reader:'meshio'},
  {name:'Medit',extensions:['mesh','meshb'],reader:'meshio'},
  {name:'Netgen',extensions:['vol'],reader:'meshio'},
  {name:'TetGen',extensions:['node','ele'],note:'Select the matching .node and .ele files.',reader:'meshio'},
  {name:'XDMF',extensions:['xdmf','xmf'],note:'Single grids only; include referenced .h5 files.',reader:'meshio',packages:['h5py']},
  {name:'CGNS / MED / H5M',extensions:['cgns','med','h5m'],reader:'meshio',packages:['h5py']},
  {name:'Exodus',extensions:['e','exo','ex2'],reader:'meshio',packages:['netcdf4']},
  {name:'SU2',extensions:['su2'],reader:'meshio'},
  {name:'UGRID',extensions:['ugrid'],reader:'meshio'},
  {name:'Kratos MDPA',extensions:['mdpa'],reader:'meshio'},
  {name:'AVS-UCD',extensions:['avs'],reader:'meshio'},
  {name:'DOLFIN XML',extensions:['xml'],reader:'meshio'},
  {name:'PERMAS',extensions:['post','dato'],reader:'meshio'},
  {name:'FLAC3D',extensions:['f3grid'],reader:'meshio'},
  {name:'Tecplot',extensions:['dat'],reader:'meshio'},
  {name:'WKT TIN',extensions:['wkt'],reader:'meshio'}
];
export const extensionOf = name => name.toLowerCase().split('.').pop();
export const formatOf = name => formats.find(format=>format.extensions.includes(extensionOf(name)));
export function modelCandidates(files){
  const candidates=files.filter(file=>formatOf(file.name));
  const primaries=candidates.filter(file=>!(extensionOf(file.name)==='ele' && candidates.some(other=>other.name.toLowerCase()===file.name.toLowerCase().replace(/\.ele$/,'.node'))));
  return primaries;
}
export function selectModel(files){
  const primaries=modelCandidates(files);
  if(!primaries.length)throw Error('No supported model found. See Formats for the available readers.');
  if(primaries.length>1)throw Error('Select one model together with its companion files. Multiple models cannot be opened at once.');
  return primaries[0];
}
