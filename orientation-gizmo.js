import {Quaternion,Vector3} from 'three';

const namespace='http://www.w3.org/2000/svg';
const make=(tag,attributes={})=>{
  const element=document.createElementNS(namespace,tag);
  for(const [name,value] of Object.entries(attributes))element.setAttribute(name,String(value));
  return element;
};
const fixed=value=>Number(value.toFixed(3));

// Camera-relative projection of fixed world axes. No scene/GPU state is changed.
export function createOrientationGizmo(host){
  const svg=make('svg',{xmlns:namespace,viewBox:'0 0 128 128','aria-hidden':'true',focusable:'false'});
  const origin=make('circle',{cx:64,cy:64,r:2,fill:'#969e93'});
  svg.append(origin);host.replaceChildren(svg);
  const axes=[];
  for(const [label,direction,color] of [
    ['X',new Vector3(1,0,0),'#b85b60'],
    ['Y',new Vector3(0,1,0),'#4c9063'],
    ['Z',new Vector3(0,0,1),'#577fbd']
  ]){
    for(const sign of [-1,1]){
      const name=(sign<0?'−':'')+label;
      const group=make('g',{'data-axis':sign<0?'-'+label:label});
      const shaft=make('line',{x1:64,y1:64,stroke:color,'stroke-width':sign>0?1.8:1.1,'stroke-linecap':'round'});
      if(sign<0)shaft.setAttribute('stroke-dasharray','2 3');
      const head=make('path',{fill:color});
      const badge=make('g');
      badge.append(make('circle',{r:sign>0?8.5:7.5,fill:'#f7f7f5',stroke:color,'stroke-width':.8}));
      const text=make('text',{'text-anchor':'middle','dominant-baseline':'central','font-family':'system-ui, sans-serif','font-size':sign>0?10:9,'font-weight':600,fill:color});
      text.textContent=name;badge.append(text);group.append(shaft,head,badge);svg.append(group);
      axes.push({direction:direction.clone().multiplyScalar(sign),sign,group,shaft,head,badge,view:new Vector3()});
    }
  }
  const rotation=new Quaternion(),inverse=new Quaternion(),last=new Quaternion();
  let rendered=false;
  return {
    update(camera){
      camera.getWorldQuaternion(rotation);
      if(rendered&&Math.abs(rotation.dot(last))>1-1e-12)return false;
      rendered=true;last.copy(rotation);inverse.copy(rotation).invert();
      for(const axis of axes){
        const view=axis.view.copy(axis.direction).applyQuaternion(inverse);
        const dx=view.x*37,dy=-view.y*37,length=Math.hypot(dx,dy);
        const tipX=64+dx,tipY=64+dy;
        // A head-on axis is a labelled dot; the receding overlapping end is hidden.
        axis.group.setAttribute('display',view.z<0&&length<8?'none':'inline');
        axis.group.setAttribute('opacity',axis.sign<0?.5:view.z<0?.6:1);
        axis.shaft.setAttribute('display',length<5?'none':'inline');
        axis.head.setAttribute('display',axis.sign<0||length<5?'none':'inline');
        const headSize=axis.sign>0?Math.min(6,length*.4):0;
        const ux=length?dx/length:0,uy=length?dy/length:0;
        const baseX=tipX-ux*headSize,baseY=tipY-uy*headSize;
        axis.shaft.setAttribute('x2',fixed(baseX));axis.shaft.setAttribute('y2',fixed(baseY));
        axis.head.setAttribute('d',`M${fixed(tipX)},${fixed(tipY)} L${fixed(baseX-uy*headSize*.5)},${fixed(baseY+ux*headSize*.5)} L${fixed(baseX+uy*headSize*.5)},${fixed(baseY-ux*headSize*.5)} Z`);
        axis.badge.setAttribute('transform',`translate(${fixed(64+view.x*52)} ${fixed(64-view.y*52)})`);
      }
      // Painter's order gives nearer arrows/labels priority at crossings.
      for(const axis of [...axes].sort((a,b)=>a.view.z-b.view.z))svg.append(axis.group);
      return true;
    }
  };
}
