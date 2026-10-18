// Trimesh/SciPy own geometry and graph analysis. Local buffers never leave this worker.
let runtime,queue=Promise.resolve();
async function initialize(){
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');
  const py=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'});
  await py.loadPackage(['numpy','scipy','micropip']);
  py.globals.set('analysis_wheel_url',new URL('./vendor/trimesh/trimesh-5.1.1-py3-none-any.whl',self.location.href).href);
  await py.runPythonAsync("import micropip\nawait micropip.install(analysis_wheel_url, deps=False)");
  const response=await fetch(new URL('./mesh-analysis.py',self.location.href));
  if(!response.ok)throw Error('Could not load the mesh analysis module.');
  await py.runPythonAsync(await response.text());
  return py;
}
async function process({id,parts,weld}){
  let py;
  try{
    runtime??=initialize().catch(error=>{runtime=undefined;throw error;});
    py=await runtime;
    py.globals.set('analysis_parts_js',parts);py.globals.set('analysis_weld',weld);
    const result=await py.runPythonAsync('json.dumps(analyze_parts(analysis_parts_js.to_py(), analysis_weld), allow_nan=False)');
    self.postMessage({id,result:JSON.parse(result)});
  }catch(error){self.postMessage({id,error:'Mesh analysis failed. '+String(error.message||error).split('\n').filter(Boolean).slice(-1)[0]});}
  finally{if(py){py.globals.delete('analysis_parts_js');py.globals.delete('analysis_weld');await py.runPythonAsync('gc.collect()');}}
}
self.onmessage=({data})=>{queue=queue.then(()=>process(data));};
