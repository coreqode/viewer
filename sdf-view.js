import {Matrix4} from 'three';
import {sampleOnnxSdf} from './sdf-inference.js?v=adaptive-batch-1';
let gpu;
function validateTextureSize(device,config){
  if(config.resolution>device.limits.maxTextureDimension3D)throw Error(`This GPU supports 3D textures up to ${device.limits.maxTextureDimension3D} per axis. Choose a smaller sampling grid.`);
}
export async function requestSdfDevice(){
  if(!navigator.gpu)throw Error('This SDF view requires WebGPU. Open it in a WebGPU-enabled browser over HTTPS or localhost.');
  gpu??=(async()=>{
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter)throw Error('No WebGPU adapter is available. Check browser graphics settings.');
    const device=await adapter.requestDevice();
    device.lost.then(()=>{gpu=undefined;});
    return {device,adapter};
  })().catch(error=>{gpu=undefined;throw error;});
  return gpu;
}
export class SdfView {
  constructor(device,sample,canvas,context,pipeline,uniform,texture,bindGroup){
    Object.assign(this,{device,canvas,context,pipeline,uniform,texture,bindGroup});
    // Rendering/settings need metadata only. The uploaded CPU volume can be collected.
    this.sample={...sample};delete this.sample.values;
    this.inverse=new Matrix4();this.parameters=new Float32Array(48);this.mode='solid';this.disposed=false;
  }
  static async create(device,sample,{canvas=document.createElement('canvas'),format=navigator.gpu.getPreferredCanvasFormat()}={}){
    validateTextureSize(device,sample.config);
    const context=canvas.getContext('webgpu');
    if(!context)throw Error('Could not create a WebGPU canvas.');
    let texture,uniform,validationScopeOpen=false,memoryScopeOpen=false;
    try{
      context.configure({device,format,alphaMode:'opaque'});
      canvas.className='sdf-canvas';canvas.setAttribute('aria-hidden','true');
      const source=await(await fetch(new URL('./sdf-raymarch.wgsl?v=normal-colors-1',import.meta.url),{cache:'no-store'})).text();
      const module=device.createShaderModule({code:source,label:'Neural SDF ray marcher'});
      const compilation=await module.getCompilationInfo();
      const errors=compilation.messages.filter(message=>message.type==='error');
      if(errors.length)throw Error('SDF shader compilation failed: '+errors.map(message=>message.message).join(' '));
      device.pushErrorScope('out-of-memory');memoryScopeOpen=true;
      device.pushErrorScope('validation');validationScopeOpen=true;
      const n=sample.config.resolution;
      const layout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'unfilterable-float',viewDimension:'3d'}}]});
      const pipeline=await device.createRenderPipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),vertex:{module,entryPoint:'vertexMain'},fragment:{module,entryPoint:'fragmentMain',targets:[{format}]},primitive:{topology:'triangle-list'}});
      texture=device.createTexture({label:'Sampled ONNX field',size:[n,n,n],dimension:'3d',format:'r32float',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
      // Bound staging-buffer allocations: a 512³ texture is larger than many
      // devices' maxBufferSize even when the texture itself is supported.
      const slicesPerUpload=Math.max(1,Math.floor(Math.min(16*1024*1024,device.limits.maxBufferSize)/(n*n*4)));
      for(let z=0;z<n;z+=slicesPerUpload){
        const depth=Math.min(slicesPerUpload,n-z),start=z*n*n;
        // Give the browser a bounded backing ArrayBuffer, not a view retaining
        // the full volume. This also bounds staging on implementations which
        // inspect the BufferSource's backing allocation.
        const upload=sample.values.slice(start,start+depth*n*n);
        device.queue.writeTexture({texture,origin:[0,0,z]},upload.buffer,{bytesPerRow:n*4,rowsPerImage:n},{width:n,height:n,depthOrArrayLayers:depth});
        await device.queue.onSubmittedWorkDone();
      }
      uniform=device.createBuffer({size:192,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
      const bindGroup=device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:texture.createView()}]});
      await device.queue.onSubmittedWorkDone();
      const error=await device.popErrorScope();validationScopeOpen=false;
      const memoryError=await device.popErrorScope();memoryScopeOpen=false;
      if(error)throw Error(error.message);
      if(memoryError)throw Error('Not enough GPU memory for this field. Choose a smaller sampling grid.');
      return new SdfView(device,sample,canvas,context,pipeline,uniform,texture,bindGroup);
    }catch(error){if(validationScopeOpen)await device.popErrorScope().catch(()=>{});if(memoryScopeOpen)await device.popErrorScope().catch(()=>{});texture?.destroy();uniform?.destroy();context.unconfigure();canvas.remove();throw error;}
  }
  setIso(value){this.sample.config.iso=value;}
  setMode(mode){
    if(mode!=='normal'&&mode!=='solid')throw Error('ONNX fields support Normal and Solid display modes.');
    this.mode=mode;
  }
  render(camera){
    if(this.disposed)return;
    const ratio=Math.min(globalThis.devicePixelRatio||1,1.25,1280/Math.max(innerWidth,innerHeight));
    const width=Math.max(1,Math.floor(innerWidth*ratio)),height=Math.max(1,Math.floor(innerHeight*ratio));
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    camera.updateMatrixWorld();
    this.inverse.multiplyMatrices(camera.matrixWorld,camera.projectionMatrixInverse);
    this.parameters.set(this.inverse.elements,0);
    this.parameters.set([camera.position.x,camera.position.y,camera.position.z,0],16);
    this.parameters.set([...this.sample.config.min,0],20);
    this.parameters.set([...this.sample.config.max,0],24);
    this.parameters.set([this.sample.config.resolution,this.sample.config.iso,this.mode==='normal'?1:0,0],28);
    this.parameters.set(camera.matrixWorldInverse.elements,32);
    this.device.queue.writeBuffer(this.uniform,0,this.parameters);
    const encoder=this.device.createCommandEncoder();
    const pass=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:.96862745,g:.96862745,b:.96078431,a:1},loadOp:'clear',storeOp:'store'}]});
    pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindGroup);pass.draw(3);pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;this.texture.destroy();this.uniform.destroy();this.context.unconfigure();this.canvas.remove();
    this.sample=this.device=this.canvas=this.context=this.pipeline=this.uniform=this.texture=this.bindGroup=this.parameters=this.inverse=undefined;
  }
}
export async function buildSdfView(options){
  const {device,adapter}=await requestSdfDevice();
  validateTextureSize(device,options.config);
  const sample=await sampleOnnxSdf({...options,device,adapter});
  if(options.cancelled?.())throw new DOMException('Superseded by another file.','AbortError');
  const view=await SdfView.create(device,sample);
  return {view,device};
}
