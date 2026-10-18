struct Parameters {
  inverseViewProjection: mat4x4<f32>,
  eye: vec4<f32>,
  minimum: vec4<f32>,
  maximum: vec4<f32>,
  settings: vec4<f32>,
};
@group(0) @binding(0) var<uniform> p: Parameters;
@group(0) @binding(1) var field: texture_3d<f32>;
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) ndc: vec2<f32>,
};
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let positions = array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0),vec2<f32>(3.0,-1.0),vec2<f32>(-1.0,3.0));
  var output: VertexOutput;
  output.position=vec4<f32>(positions[index],0.0,1.0);
  output.ndc=positions[index];
  return output;
}
fn valueAt(point: vec3<f32>) -> f32 {
  let n=i32(p.settings.x);
  let grid=clamp((point-p.minimum.xyz)/(p.maximum.xyz-p.minimum.xyz),vec3<f32>(0.0),vec3<f32>(1.0))*f32(n-1);
  let low=vec3<i32>(floor(grid));
  let high=min(low+vec3<i32>(1),vec3<i32>(n-1));
  let f=fract(grid);
  let c000=textureLoad(field,vec3<i32>(low.x,low.y,low.z),0).r;
  let c100=textureLoad(field,vec3<i32>(high.x,low.y,low.z),0).r;
  let c010=textureLoad(field,vec3<i32>(low.x,high.y,low.z),0).r;
  let c110=textureLoad(field,vec3<i32>(high.x,high.y,low.z),0).r;
  let c001=textureLoad(field,vec3<i32>(low.x,low.y,high.z),0).r;
  let c101=textureLoad(field,vec3<i32>(high.x,low.y,high.z),0).r;
  let c011=textureLoad(field,vec3<i32>(low.x,high.y,high.z),0).r;
  let c111=textureLoad(field,vec3<i32>(high.x,high.y,high.z),0).r;
  return mix(mix(mix(c000,c100,f.x),mix(c010,c110,f.x),f.y),mix(mix(c001,c101,f.x),mix(c011,c111,f.x),f.y),f.z)-p.settings.y;
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let background=vec4<f32>(0.96862745,0.96862745,0.96078431,1.0);
  let farPoint=p.inverseViewProjection*vec4<f32>(input.ndc,1.0,1.0);
  let origin=p.eye.xyz;
  let direction=normalize(farPoint.xyz/farPoint.w-origin);
  let epsilonDirection=select(vec3<f32>(-1e-8),vec3<f32>(1e-8),direction>=vec3<f32>(0.0));
  let safeDirection=select(direction,epsilonDirection,abs(direction)<vec3<f32>(1e-8));
  let a=(p.minimum.xyz-origin)/safeDirection;
  let b=(p.maximum.xyz-origin)/safeDirection;
  let nearPlanes=min(a,b);
  let farPlanes=max(a,b);
  let near=max(max(nearPlanes.x,nearPlanes.y),max(nearPlanes.z,0.0));
  let far=min(min(farPlanes.x,farPlanes.y),farPlanes.z);
  if(far<=near){return background;}
  let voxel=(p.maximum.xyz-p.minimum.xyz)/(p.settings.x-1.0);
  let rate=abs(direction)/voxel;
  let step=0.65/max(max(rate.x,rate.y),rate.z);
  var t=near;
  var previous=valueAt(origin+direction*t);
  var hit=false;
  var hitT=t;
  // The supplied neural field is not assumed to be a valid distance bound.
  // Bounded sampling and sign-change refinement locate its interpolated level set.
  // A full box crossing spans at most n-1 voxels on the fastest grid axis.
  let maxSteps=u32(ceil((p.settings.x-1.0)/0.65))+1u;
  for(var iteration=0u;iteration<maxSteps;iteration++){
    let nextT=min(t+step,far);
    let next=valueAt(origin+direction*nextT);
    if(previous*next<=0.0){
      var lower=t;
      var upper=nextT;
      var lowerValue=previous;
      for(var refinement=0u;refinement<9u;refinement++){
        let middle=(lower+upper)*0.5;
        let middleValue=valueAt(origin+direction*middle);
        if(lowerValue*middleValue<=0.0){upper=middle;}
        else{lower=middle;lowerValue=middleValue;}
      }
      hitT=(lower+upper)*0.5;hit=true;break;
    }
    if(nextT>=far){break;}
    previous=next;t=nextT;
  }
  if(!hit){return background;}
  let point=origin+direction*hitT;
  let dx=vec3<f32>(voxel.x*0.5,0.0,0.0);
  let dy=vec3<f32>(0.0,voxel.y*0.5,0.0);
  let dz=vec3<f32>(0.0,0.0,voxel.z*0.5);
  let gradient=vec3<f32>((valueAt(point+dx)-valueAt(point-dx))/voxel.x,(valueAt(point+dy)-valueAt(point-dy))/voxel.y,(valueAt(point+dz)-valueAt(point-dz))/voxel.z);
  var normal=-direction;
  if(length(gradient)>1e-12){normal=normalize(gradient);}
  if(dot(normal,direction)>0.0){normal=-normal;}
  let light=normalize(vec3<f32>(-0.5,0.9,0.8));
  let diffuse=max(dot(normal,light),0.0);
  let rim=pow(1.0-max(dot(normal,-direction),0.0),3.0);
  let color=vec3<f32>(0.72,0.69,0.79)*(0.64+0.34*diffuse)+vec3<f32>(0.08)*rim;
  return vec4<f32>(color,1.0);
}
