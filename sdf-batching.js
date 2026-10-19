// Bound per-call work while allowing inexpensive dynamic models to use larger batches.
export class SdfBatchSizer {
  constructor(){this.size=8192;this.ceiling=65536;this.warmed=false;}
  record(count,milliseconds){
    // A short final batch says nothing about the cost of the selected size.
    if(count!==this.size)return;
    // Each size can trigger first-use compilation/allocation. Time steady work.
    if(!this.warmed){this.warmed=true;return;}
    let next=this.size;
    if(milliseconds<25)next=Math.min(this.size*2,this.ceiling);
    else if(milliseconds>100)next=Math.max(Math.min(256,this.ceiling),Math.floor(this.size/2));
    if(next!==this.size){this.size=next;this.warmed=false;}
  }
  backoff(failedCount){
    if(failedCount<=1)return false;
    // Do not repeatedly attempt a size that has already failed in this session.
    this.ceiling=Math.min(this.ceiling,Math.floor(failedCount/2));
    this.size=Math.min(this.size,this.ceiling);this.warmed=false;
    return true;
  }
}
