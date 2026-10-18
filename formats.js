// Supported entry points. Parsing belongs to the named third-party readers.
export const formats = [
  {name:'ONNX coordinate SDF',extensions:['onnx'],reader:'sdf',note:'One float32 [N,3] dynamic coordinate input and one float32 scalar output. Select external .onnx.data weights together. WebGPU rendering; scalar-grid approximation.'},
  {name:'Wavefront OBJ',extensions:['obj'],reader:'three',note:'Geometry only; MTL and textures are ignored.'},
  {name:'STL',extensions:['stl'],reader:'three'},
  {name:'PLY',extensions:['ply'],reader:'three',note:'Polygon meshes or point clouds.'},
  {name:'glTF / GLB',extensions:['gltf','glb'],reader:'three',note:'Select external .bin files together with .gltf. Draco and Meshopt geometry are supported; textures and animations are ignored.'},
  {name:'FBX',extensions:['fbx'],reader:'three',note:'Static geometry; textures and animations are ignored.'},
  {name:'COLLADA',extensions:['dae'],reader:'three',note:'Static geometry; textures and animations are ignored.'},
  {name:'3D Studio',extensions:['3ds'],reader:'three'},
  {name:'3MF',extensions:['3mf'],reader:'three',note:'Core geometry; extension-specific features may be unsupported.'},
  {name:'AMF',extensions:['amf'],reader:'three'},
  {name:'Point clouds',extensions:['pcd','xyz'],reader:'three',note:'Points only; no surface reconstruction.'},
  {name:'VTK PolyData',extensions:['vtp'],reader:'three',note:'Polygonal surfaces.'},
  {name:'STEP',extensions:['step','stp'],reader:'cad',note:'CAD surfaces are tessellated into triangles.'},
  {name:'IGES',extensions:['iges','igs'],reader:'cad',note:'CAD surfaces are tessellated into triangles; curve-only files may contain no displayable faces.'},
  {name:'Open CASCADE BREP',extensions:['brep','brp'],reader:'cad',note:'CAD surfaces are tessellated into triangles.'},
  {name:'Gmsh / ANSYS MSH',extensions:['msh'],reader:'meshio',note:'Gmsh 2.2, 4.0, 4.1 and meshio-supported ANSYS files.'},
  {name:'OFF',extensions:['off'],reader:'meshio',note:'Triangular OFF meshes.'},
  {name:'VTK / VTU',extensions:['vtk','vtu'],reader:'meshio',note:'Unstructured grids. Legacy VTK PolyData also uses a surface reader.'},
  {name:'Abaqus',extensions:['inp'],reader:'meshio',note:'Select any referenced include files together.'},
  {name:'Nastran',extensions:['bdf','nas','fem'],reader:'meshio'},
  {name:'Medit',extensions:['mesh','meshb'],reader:'meshio'},
  {name:'Netgen',extensions:['vol'],reader:'meshio'},
  {name:'TetGen',extensions:['node','ele'],reader:'meshio',note:'Select the matching .node and .ele files together.'},
  {name:'XDMF',extensions:['xdmf','xmf'],reader:'meshio',packages:['h5py'],note:'Single-grid files; select referenced .h5 files together. Time-series and collection grids are not supported.'},
  {name:'CGNS / MED / H5M',extensions:['cgns','med','h5m'],reader:'meshio',packages:['h5py'],note:'Reader-supported unstructured mesh layouts.'},
  {name:'Exodus',extensions:['e','exo','ex2'],reader:'meshio',packages:['netcdf4']},
  {name:'SU2',extensions:['su2'],reader:'meshio'},
  {name:'UGRID',extensions:['ugrid'],reader:'meshio'},
  {name:'Kratos MDPA',extensions:['mdpa'],reader:'meshio'},
  {name:'AVS-UCD',extensions:['avs'],reader:'meshio'},
  {name:'DOLFIN XML',extensions:['xml'],reader:'meshio',note:'DOLFIN mesh XML only.'},
  {name:'PERMAS',extensions:['post','dato'],reader:'meshio'},
  {name:'FLAC3D',extensions:['f3grid'],reader:'meshio'},
  {name:'Tecplot',extensions:['dat'],reader:'meshio',note:'Meshio-supported Tecplot .dat files only.'},
  {name:'WKT TIN',extensions:['wkt'],reader:'meshio',note:'Triangulated irregular networks.'}
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
