class TapeCapture extends AudioWorkletProcessor {
  constructor(){super();this.size=2048;this.index=0;this.channels=[];this.blockStart=0;}
  process(inputs){
    const input=inputs[0];if(!input?.length)return true;
    if(this.channels.length!==input.length){this.channels=input.map(()=>new Float32Array(this.size));this.index=0;}
    const len=input[0].length;
    for(let i=0;i<len;i++){
      if(this.index===0)this.blockStart=(currentFrame+i)/sampleRate;
      for(let c=0;c<input.length;c++)this.channels[c][this.index]=input[c][i];
      this.index++;
      if(this.index===this.size){const data=this.channels;this.port.postMessage({time:this.blockStart,channels:data},data.map(c=>c.buffer));this.channels=input.map(()=>new Float32Array(this.size));this.index=0;}
    }
    return true;
  }
}
registerProcessor('tape-capture',TapeCapture);
