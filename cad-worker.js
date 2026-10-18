let runtime;
let queue=Promise.resolve();
async function process({id,bytes,extension}){
  try{
    if(!runtime){
      importScripts('./vendor/occt/occt-import-js.js');
      runtime=occtimportjs({locateFile:path=>new URL('./vendor/occt/'+path,self.location.href).href}).catch(error=>{runtime=undefined;throw error;});
    }
    const occt=await runtime;
    const methods={step:'ReadStepFile',stp:'ReadStepFile',iges:'ReadIgesFile',igs:'ReadIgesFile',brep:'ReadBrepFile',brp:'ReadBrepFile'};
    const result=occt[methods[extension]](new Uint8Array(bytes),{linearDeflectionType:'bounding_box_ratio',linearDeflection:.002,angularDeflection:.5});
    if(!result.success || !result.meshes?.length)throw Error('No displayable CAD faces found. Check the file; curve-only geometry is not supported.');
    const count=result.meshes.reduce((total,mesh)=>total+mesh.index.array.length/3,0);
    if(count>2000000)throw Error('This CAD model exceeds the 2 million display triangle limit.');
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:String(error.message||error)});}
}
self.onmessage=({data})=>{queue=queue.then(()=>process(data));};
