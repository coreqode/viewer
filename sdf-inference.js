// ONNX Runtime executes the network. This module samples its scalar output for visualization.
let runtime;
async function loadRuntime(){
  runtime??=import('./vendor/ort/ort.webgpu.bundle.min.mjs').then(async ort=>{
    ort.env.wasm.numThreads=1;
    ort.env.wasm.proxy=false;
    ort.env.wasm.wasmPaths=new URL('./vendor/ort/',import.meta.url).href;
    const urls=[new URL('./vendor/ort/ort-runtime.part1.bin',import.meta.url),new URL('./vendor/ort/ort-runtime.part2.bin',import.meta.url)];
    const parts=await Promise.all(urls.map(async url=>{
      const response=await fetch(url);
      if(!response.ok)throw Error('Could not load the bundled ONNX runtime.');
      return new Uint8Array(await response.arrayBuffer());
    }));
    const binary=new Uint8Array(parts.reduce((total,part)=>total+part.byteLength,0));
    let offset=0;for(const part of parts){binary.set(part,offset);offset+=part.byteLength;}
    ort.env.wasm.wasmBinary=binary;
    return ort;
  }).catch(error=>{runtime=undefined;throw error;});
  return runtime;
}
export function validateSdfConfig(config){
  if(![64,96,128,256,512].includes(config.resolution))throw Error('Choose a grid resolution of 64, 96, 128, 256 or 512.');
  if(!Number.isFinite(config.iso))throw Error('The level value must be finite.');
  for(let axis=0;axis<3;axis++){
    if(!Number.isFinite(config.min[axis])||!Number.isFinite(config.max[axis])||config.max[axis]<=config.min[axis])throw Error('Each maximum bound must be greater than its minimum.');
    if(Math.abs(config.min[axis])>1e6||Math.abs(config.max[axis])>1e6)throw Error('Please keep sampling bounds within ±1,000,000.');
  }
}
export async function sampleOnnxSdf({files,model,config,device,adapter,onProgress=()=>{},cancelled=()=>false,forceWasm=false}){
  validateSdfConfig(config);
  if(files.reduce((total,file)=>total+file.size,0)>40*1024*1024)throw Error('Select model files totaling less than 40 MB.');
  const ort=await loadRuntime();
  const externalData=[];
  for(const file of files.filter(file=>file!==model)){
    const data=new Uint8Array(await file.arrayBuffer());
    externalData.push({path:file.name,data});
    if(file.webkitRelativePath&&file.webkitRelativePath!==file.name)externalData.push({path:file.webkitRelativePath,data});
  }
  const modelBytes=new Uint8Array(await model.arrayBuffer());
  if(cancelled())throw new DOMException('Superseded by another file.','AbortError');
  onProgress('Loading ONNX coordinate field…');
  let session,backend='WASM';
  try{
    if(device&&!forceWasm){
      if(adapter)ort.env.webgpu.adapter=adapter;
      try{
        session=await ort.InferenceSession.create(modelBytes,{executionProviders:[{name:'webgpu',device}],externalData});
        backend='WebGPU EP';
      }catch{
        onProgress('GPU inference unavailable for this model. Sampling with WASM; rendering will use WebGPU.');
      }
    }
    if(!session)session=await ort.InferenceSession.create(modelBytes,{executionProviders:['wasm'],externalData});
    const input=session.inputMetadata[0],output=session.outputMetadata[0];
    if(session.inputNames.length!==1||session.outputNames.length!==1||!input?.isTensor||input.type!=='float32'||input.shape.length!==2||input.shape[1]!==3)throw Error('This loader expects one float32 coordinate input [N,3] and one scalar-distance output.');
    if(!output?.isTensor||output.type!=='float32'||!(output.shape.length===1||(output.shape.length===2&&output.shape[1]===1)))throw Error('The SDF output must be float32 [N] or [N,1].');
    const fixedBatch=typeof input.shape[0]==='number'?input.shape[0]:undefined;
    if(fixedBatch!==undefined&&(!Number.isSafeInteger(fixedBatch)||fixedBatch<1))throw Error('The coordinate input batch size must be positive.');
    if(typeof output.shape[0]==='number'&&fixedBatch!==undefined&&output.shape[0]!==fixedBatch)throw Error('The model must return one scalar for each coordinate.');
    // Small fixed batches pay GPU submission/readback costs for every few points.
    // WASM avoids those round trips, especially for single-coordinate exports.
    if(backend==='WebGPU EP'&&fixedBatch!==undefined&&fixedBatch<64){
      await session.release();session=undefined;
      onProgress('Sampling fixed-batch ONNX field with WASM…');
      session=await ort.InferenceSession.create(modelBytes,{executionProviders:['wasm'],externalData});
      backend='WASM';
    }
    const n=config.resolution,total=n*n*n,batchSize=fixedBatch??8192;
    let values;
    try{values=new Float32Array(total);}
    catch{throw Error(`Could not allocate the ${n}³ field (${total*4/1024/1024} MiB). Choose a smaller sampling grid.`);}
    let minimum=Infinity,maximum=-Infinity,boundaryMin=Infinity,boundaryMax=-Infinity,lastYield=performance.now();
    for(let base=0;base<total;base+=batchSize){
      if(cancelled())throw new DOMException('Superseded by another file.','AbortError');
      const count=Math.min(batchSize,total-base),runCount=fixedBatch??count,coordinates=new Float32Array(runCount*3);
      for(let i=0;i<runCount;i++){
        // Repeat the final valid coordinate to fill a fixed-size final batch.
        const index=base+Math.min(i,count-1),x=index%n,y=Math.floor(index/n)%n,z=Math.floor(index/(n*n));
        coordinates[i*3]=config.min[0]+x/(n-1)*(config.max[0]-config.min[0]);
        coordinates[i*3+1]=config.min[1]+y/(n-1)*(config.max[1]-config.min[1]);
        coordinates[i*3+2]=config.min[2]+z/(n-1)*(config.max[2]-config.min[2]);
      }
      const tensor=new ort.Tensor('float32',coordinates,[runCount,3]);
      let outputs;
      try{
        outputs=await session.run({[input.name]:tensor});
        const distances=outputs[output.name];
        const data=distances.data;
        if(data.length!==runCount||distances.dims[0]!==runCount||!(distances.dims.length===1||(distances.dims.length===2&&distances.dims[1]===1)))throw Error('The model did not return one scalar for each coordinate.');
        for(let i=0;i<count;i++){
          const value=data[i];
          if(!Number.isFinite(value))throw Error('The model produced a non-finite distance. Adjust the bounds or verify its normalization.');
          values[base+i]=value;minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);
          const index=base+i,x=index%n,y=Math.floor(index/n)%n,z=Math.floor(index/(n*n));
          if(x===0||x===n-1||y===0||y===n-1||z===0||z===n-1){boundaryMin=Math.min(boundaryMin,value);boundaryMax=Math.max(boundaryMax,value);}
        }
      }finally{tensor.dispose();for(const result of Object.values(outputs||{}))result.dispose();}
      // Yield by elapsed time so fixed [1,3] models stay responsive without
      // incurring a browser timer delay for each of the hundreds of thousands of points.
      if(performance.now()-lastYield>=50||base+count===total){
        onProgress(`Sampling ONNX field · ${Math.round(Math.min(base+count,total)/total*100)}%`);
        await new Promise(resolve=>setTimeout(resolve,0));
        lastYield=performance.now();
      }
    }
    if(cancelled())throw new DOMException('Superseded by another file.','AbortError');
    return {values,config:{...config,min:[...config.min],max:[...config.max]},backend,inputName:input.name,outputName:output.name,inputShape:[...input.shape],minimum,maximum,boundaryMin,boundaryMax};
  }catch(error){
    if(error?.name==='AbortError')throw error;
    if(!session)throw Error('Could not load the ONNX model. Select its external .onnx.data weights together with the model. '+String(error.message||error));
    throw error;
  }finally{await session?.release();}
}
