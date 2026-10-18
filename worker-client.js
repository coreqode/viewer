// Integration plumbing shared by the independent geometry readers.
export function createWorkerReader(url,label){
  let worker,sequence=0;
  const pending=new Map();
  function reset(message){
    worker?.terminate();worker=undefined;
    for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error(message));}
    pending.clear();
  }
  function read(payload,transfer=[]){
    if(!worker){
      worker=new Worker(url);
      worker.onmessage=({data})=>{
        const request=pending.get(data.id);if(!request)return;
        clearTimeout(request.timer);pending.delete(data.id);
        if(data.error)request.reject(Error(data.error));else request.resolve(data.result);
      };
      worker.onerror=()=>reset(`Could not start the ${label} reader. Check your connection and try again.`);
      worker.onmessageerror=()=>reset(`Could not receive data from the ${label} reader.`);
    }
    return new Promise((resolve,reject)=>{
      const id=++sequence;
      const timer=setTimeout(()=>reset(`The ${label} reader timed out. Try a smaller file or check your connection.`),180000);
      pending.set(id,{resolve,reject,timer});
      worker.postMessage({id,...payload},transfer);
    });
  }
  read.cancel=()=>reset(`The ${label} request was cancelled.`);
  return read;
}
