// Visualization adapter: element corners become triangles for the GPU.
// Higher-order elements are displayed with straight edges between corner nodes.
const faces = {
  triangle:[[0,1,2]], quad:[[0,1,2,3]],
  tetra:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]],
  hexahedron:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],
  wedge:[[0,2,1],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]],
  pyramid:[[0,3,2,1],[0,1,4],[1,2,4],[2,3,4],[3,0,4]]
};
export function cellGeometry(mesh) {
  if(!mesh.points.length) throw Error('The file contains no points.');
  const vertices=new Float32Array(mesh.points.length*3);
  mesh.points.forEach((point,i)=>{
    for(let axis=0;axis<3;axis++){
      const value=point[axis] ?? 0;
      if(!Number.isFinite(value) || Math.abs(value)>3e38) throw Error('The mesh contains invalid coordinates.');
      vertices[3*i+axis]=value;
    }
  });
  const triangles=[],lines=[],pointIndices=[],skipped=new Set();
  let linearized=false;
  const types=mesh.cells.map(block=>block.type.replace(/\d+$/,''));
  mesh.cells.forEach((block,blockIndex)=>{
    const type=types[blockIndex];
    if(type==='vertex'){
      for(const cell of block.data){
        if(cell.some(index=>!Number.isInteger(index)||index<0||index>=mesh.points.length))throw Error('The mesh contains invalid point indices.');
        pointIndices.push(...cell);
      }
      return;
    }
    if(!faces[type] && type!=='line'){skipped.add(block.type);return;}
    const corners=type==='line'?2:Math.max(...faces[type].flat())+1;
    for(const cell of block.data){
      if(cell.length<corners || cell.some(index=>!Number.isInteger(index)||index<0||index>=mesh.points.length))throw Error('The mesh contains invalid element indices.');
      if(cell.length>corners)linearized=true;
      if(type==='line'){lines.push(cell[0],cell[1]);continue;}
      for(const face of faces[type]){
        for(let i=1;i<face.length-1;i++)triangles.push(cell[face[0]],cell[face[i]],cell[face[i+1]]);
      }
      if(triangles.length>6000000)throw Error('This mesh exceeds the 2 million display triangle limit.');
    }
  });
  if(skipped.size && !triangles.length && !lines.length && !pointIndices.length)throw Error(`Unsupported element types: ${[...skipped].join(', ')}.`);
  return {vertices,triangles,lines,pointIndices,linearized,skipped:[...skipped]};
}
