// meshio owns parsing. Jobs are serialized because its Python runtime is shared.
let runtime;
let queue=Promise.resolve();
async function initialize(){
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');
  const py=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'});
  await py.loadPackage(['numpy','micropip']);
  await py.runPythonAsync("import micropip\nawait micropip.install('meshio==5.3.5')\nimport meshio, json, os, shutil, io, contextlib");
  return py;
}
async function process({id,files,filename,packages=[],action='read',target}){
  const directory=`/mesh-job-${id}`;
  let py,scope;
  try {
    runtime??=initialize().catch(error=>{runtime=undefined;throw error;});
    py=await runtime;
    if(packages.length)await py.loadPackage(packages);
    py.FS.mkdir(directory);
    for(const file of files){
      // Paths come from selected local files only; retain their relative directories.
      const parts=file.path.split('/').filter(Boolean);
      if(parts.some(part=>part==='..'||part==='.'))throw Error('Invalid companion file path.');
      let folder=directory;
      for(const part of parts.slice(0,-1)){folder+='/'+part;try{py.FS.mkdir(folder);}catch{}}
      py.FS.writeFile(`${directory}/${parts.join('/')}`,new Uint8Array(file.bytes));
    }
    // Keep per-file Python objects out of the long-lived runtime namespace.
    scope=py.toPy({job_directory:directory,input_name:filename,conversion_action:action,conversion_target:target||''});
    const result=await py.runPythonAsync(`
import meshio, json, os, shutil, io, contextlib
previous_directory = os.getcwd()
try:
    os.chdir(job_directory)
    os.chdir(os.path.dirname(input_name) or '.')
    mesh = meshio.read(os.path.basename(input_name))
    if len(mesh.points) > 2000000:
        raise ValueError('This mesh exceeds the 2 million point limit.')
    from meshio._vtk_common import meshio_to_vtk_type
    from meshio.gmsh.common import _meshio_to_gmsh_type
    from meshio.abaqus._abaqus import meshio_to_abaqus_type
    from meshio.nastran._nastran import meshio_to_nastran_type
    compatible_types = {'vtu': meshio_to_vtk_type, 'vtk': meshio_to_vtk_type, 'gmsh22': _meshio_to_gmsh_type, 'abaqus': meshio_to_abaqus_type, 'nastran': meshio_to_nastran_type}
    targets = [name for name, mapping in compatible_types.items() if all(c.type in mapping for c in mesh.cells)]
    if conversion_action == 'convert':
        if conversion_target not in targets:
            raise ValueError('The selected format cannot encode every original element type.')
        extensions = {'vtu': 'vtu', 'vtk': 'vtk', 'gmsh22': 'msh', 'abaqus': 'inp', 'nastran': 'bdf'}
        output_path = job_directory + '/converted.' + extensions[conversion_target]
        output_options = {'binary': False} if conversion_target == 'gmsh22' else {}
        export_log = io.StringIO()
        with contextlib.redirect_stdout(export_log), contextlib.redirect_stderr(export_log):
            meshio.write(output_path, mesh, file_format=conversion_target, **output_options)
        result = json.dumps({'warning': export_log.getvalue().strip(), 'output_path': output_path})
    else:
        info = {
            'points': len(mesh.points), 'coordinate_dimension': mesh.points.shape[1],
            'cells': sum(len(c.data) for c in mesh.cells),
            'blocks': [{'type': c.type, 'count': len(c.data), 'nodes_per_cell': c.data.shape[1] if getattr(c.data, 'ndim', None) == 2 else None} for c in mesh.cells],
            'point_data': [{'name': name, 'shape': list(value.shape), 'dtype': str(value.dtype)} for name, value in mesh.point_data.items()],
            'cell_data': [{'name': name, 'shapes': [list(a.shape) for a in values], 'dtypes': [str(a.dtype) for a in values]} for name, values in mesh.cell_data.items()],
            'field_data': [{'name': name, 'shape': list(value.shape), 'dtype': str(value.dtype)} for name, value in mesh.field_data.items()],
            'point_sets': [{'name': name, 'count': len(value)} for name, value in mesh.point_sets.items()],
            'cell_sets': [{'name': name, 'counts': [len(a) if a is not None else 0 for a in values]} for name, values in mesh.cell_sets.items()]
        }
        result = json.dumps({'points': mesh.points.tolist(), 'cells': [{'type': c.type, 'data': c.data.tolist()} for c in mesh.cells], 'conversion_targets': targets, 'info': info})
except BaseException as error:
    raise ValueError('Reader rejected the file: ' + str(error)) from None
finally:
    os.chdir(previous_directory)
    if conversion_action != 'convert':
        shutil.rmtree(job_directory, ignore_errors=True)
result
`,{globals:scope});
    const output=JSON.parse(result);
    if(action==='convert'){
      const bytes=py.FS.readFile(output.output_path);
      self.postMessage({id,result:{bytes,warning:output.warning}},[bytes.buffer]);
    }else self.postMessage({id,result:output});
  }catch(error){
    const detail=String(error.message||error).split('\n').filter(Boolean).slice(-1)[0];
    self.postMessage({id,error:action==='convert'?`Could not convert this mesh. ${detail}`:`Could not read this mesh. Confirm the format and select any companion files together. ${detail}`});
  }finally{
    if(scope){scope.clear();scope.destroy();}
    if(py){
      py.globals.set('cleanup_directory',directory);
      try{await py.runPythonAsync("os.chdir('/')\nshutil.rmtree(cleanup_directory, ignore_errors=True)");}
      finally{py.globals.delete('cleanup_directory');}
    }
  }
}
self.onmessage=({data})=>{queue=queue.then(()=>process(data));};
