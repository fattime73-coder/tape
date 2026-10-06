export const MAX_RECALL=60;
export const dbToGain=db=>Math.pow(10,db/20);
export function encodeWav(channels,sampleRate){
  const frames=channels[0].length,n=channels.length,buffer=new ArrayBuffer(44+frames*n*2),v=new DataView(buffer);
  const str=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,36+frames*n*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,n,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*n*2,true);v.setUint16(32,n*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,frames*n*2,true);
  let p=44;for(let f=0;f<frames;f++)for(let c=0;c<n;c++){const x=Math.max(-1,Math.min(1,channels[c][f]));v.setInt16(p,x<0?x*32768:x*32767,true);p+=2;}
  return new Blob([buffer],{type:'audio/wav'});
}
export function ringTail(blocks,seconds,sampleRate,channel){
  const count=Math.min(Math.round(seconds*sampleRate),blocks.reduce((n,b)=>n+b.channels[0].length,0));
  const out=new Float32Array(count);let remaining=count;
  for(let b=blocks.length-1;b>=0&&remaining>0;b--){const data=blocks[b].channels[channel] || blocks[b].channels[0];const n=Math.min(data.length,remaining);out.set(data.subarray(data.length-n),remaining-n);remaining-=n;}
  return out;
}
export function cutCapture(block,start,end,sampleRate){
  const n=block.channels[0].length;const first=Math.min(n,Math.max(0,Math.round((start-block.time)*sampleRate)));const last=Math.min(n,Math.max(0,Math.round((end-block.time)*sampleRate)));
  return first<last?{first,last}:null;
}
export class TapeEngine {
  constructor(tracks,onBlock,onEnded){this.tracks=tracks;this.onBlock=onBlock;this.onEnded=onEnded;this.ring=[];this.ringFrames=0;this.sources=[];this.cursor=0;this.recording=null;this.channelCount=1;this.inputActive=false;this.monitor=false;this.takesPending=false;}
  async init(){
    if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('このブラウザはWeb Audioに対応していません');this.ctx=new AC({latencyHint:'interactive'});this.master=this.ctx.createGain();this.master.gain.value=.85;this.master.connect(this.ctx.destination);const split=this.ctx.createChannelSplitter(2);this.master.connect(split);this.masterMeters=[0,1].map(c=>{const a=this.ctx.createAnalyser();a.fftSize=256;split.connect(a,c);return a;});this.nodes=this.tracks.map(t=>{const volume=this.ctx.createGain(),pan=this.ctx.createStereoPanner(),meter=this.ctx.createAnalyser();meter.fftSize=256;volume.connect(pan);pan.connect(meter);meter.connect(this.master);return {volume,pan,meter};});this.updateMix();}
    await this.ctx.resume();if(this.ctx.state!=='running')throw Error('オーディオが停止しています。もう一度再生してください');
  }
  async enableInput(deviceId){
    if(this.recording||this.takesPending)throw Error('録音を停止してから入力を変更してください');
    await this.init();if(!navigator.mediaDevices?.getUserMedia)throw Error('マイクにはHTTPSでアクセスしてください');
    const stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:deviceId?{exact:deviceId}:undefined,echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:{ideal:4}},video:false});
    try{if(!this.workletLoaded){await this.ctx.audioWorklet.addModule('capture-worklet.js');this.workletLoaded=true;}
      this.disableInput();this.stream=stream;this.inputActive=true;this.inputSource=this.ctx.createMediaStreamSource(stream);this.capture=new AudioWorkletNode(this.ctx,'tape-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCountMode:'max'});this.inputSource.connect(this.capture);const silence=this.ctx.createGain();silence.gain.value=0;this.capture.connect(silence);silence.connect(this.ctx.destination);this.silence=silence;
      this.channelCount=stream.getAudioTracks()[0].getSettings().channelCount||1;
      this.capture.port.onmessage=e=>this.captureBlock(e.data);
      this.splitter=this.ctx.createChannelSplitter(32);this.inputSource.connect(this.splitter);
      this.monitorNodes=this.tracks.map((t,i)=>{const gain=this.ctx.createGain();gain.connect(this.nodes[i].volume);return gain;});this.updateMonitor();
      stream.getAudioTracks()[0].onended=()=>{if(this.recording){this.stop();this.finishRecording();}this.disableInput();this.onBlock(null);};
    }catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
  }
  disableInput(){if(this.recording||this.takesPending)throw Error('録音を停止してから入力をOFFにしてください');this.inputActive=false;this.stream?.getTracks().forEach(t=>t.stop());this.inputSource?.disconnect();this.capture?.disconnect();this.silence?.disconnect();this.splitter?.disconnect();this.monitorNodes?.forEach(n=>n.disconnect());this.monitorNodes=null;this.stream=null;this.ring=[];this.ringFrames=0;}
  updateMonitor(){if(!this.splitter||!this.monitorNodes)return;this.splitter.disconnect();this.monitorNodes.forEach((g,i)=>{g.gain.setTargetAtTime(this.monitor&&this.tracks[i].armed?dbToGain(this.tracks[i].gain):0,this.ctx.currentTime,.01);this.splitter.connect(g,Math.min(this.channelCount-1,this.tracks[i].channel));});}
  updateMix(){if(!this.nodes)return;const solo=this.tracks.some(t=>t.solo);this.tracks.forEach((t,i)=>{this.nodes[i].volume.gain.setTargetAtTime(t.mute||(solo&&!t.solo)?0:(t.volume<=-60?0:dbToGain(t.volume)),this.ctx.currentTime,.008);this.nodes[i].pan.pan.setTargetAtTime(t.pan,this.ctx.currentTime,.008);});this.updateMonitor();}
  captureBlock(block){
    if(!this.inputActive)return;this.channelCount=block.channels.length;this.ring.push(block);this.ringFrames+=block.channels[0].length;
    const max=this.ctx.sampleRate*MAX_RECALL;while(this.ring.length>1&&this.ringFrames-this.ring[0].channels[0].length>=max){this.ringFrames-=this.ring.shift().channels[0].length;}
    if(this.recording){const r=this.recording,cut=cutCapture(block,r.contextStart,r.contextEnd??Infinity,this.ctx.sampleRate);
      if(cut)r.takes.forEach(take=>{const raw=block.channels[this.tracks[take.index].channel]||block.channels[0];const data=raw.slice(cut.first,cut.last),gain=dbToGain(this.tracks[take.index].gain);for(let i=0;i<data.length;i++)data[i]*=gain;take.chunks.push(data);take.length+=data.length;});
      if(r.contextEnd!=null&&block.time+block.channels[0].length/this.ctx.sampleRate>=r.contextEnd)this.finishRecording();
    }
    this.onBlock(block);
  }
  duration(){return this.tracks.reduce((d,t)=>Math.max(d,...t.clips.map(c=>c.start+c.buffer.duration)),0);}
  position(){return this.running?Math.max(this.startCursor,this.startCursor+(this.ctx.currentTime-this.contextStart)):this.cursor;}
  startPlayback(cursor=this.cursor){
    this.sources.forEach(s=>{try{s.stop();}catch{}});this.sources=[];this.cursor=cursor;this.startCursor=cursor;this.contextStart=this.ctx.currentTime+.08;this.running=true;
    this.tracks.forEach((track,i)=>track.clips.forEach(clip=>{const end=clip.start+clip.buffer.duration;if(end<=cursor)return;const src=this.ctx.createBufferSource();src.buffer=clip.buffer;src.connect(this.nodes[i].volume);src.start(this.contextStart+Math.max(0,clip.start-cursor),Math.max(0,cursor-clip.start));this.sources.push(src);}));
  }
  startRecording(){if(!this.inputActive)throw Error('入力を有効にしてください');if(this.takesPending)throw Error('テイクを保存中です');const armed=this.tracks.flatMap((t,index)=>t.armed?[{index,chunks:[],length:0}]:[]);if(!armed.length)throw Error('録音したいトラックの赤い●をONにしてください');this.startPlayback();this.recording={contextStart:this.contextStart,start:this.startCursor,takes:armed};}
  stop(reset=false){
    const pos=this.position();this.sources.forEach(s=>{try{s.stop();}catch{}});this.sources=[];this.running=false;this.cursor=reset?0:pos;
    if(this.recording&&this.recording.contextEnd==null){this.recording.contextEnd=this.ctx.currentTime;this.takesPending=true;this.finishTimer=setTimeout(()=>this.finishRecording(),220);}
  }
  finishRecording(){if(!this.recording)return;clearTimeout(this.finishTimer);const r=this.recording;this.recording=null;this.takesPending=false;const added=[];
    r.takes.forEach(take=>{if(!take.length)return;const buffer=this.ctx.createBuffer(1,take.length,this.ctx.sampleRate),data=buffer.getChannelData(0);let offset=0;for(const chunk of take.chunks){data.set(chunk,offset);offset+=chunk.length;}const clip={id:crypto.randomUUID(),start:r.start,buffer};this.tracks[take.index].clips.push(clip);added.push({index:take.index,id:clip.id});});this.onEnded(added);
  }
  recall(seconds,index){if(!this.inputActive||!this.ringFrames)throw Error('入力を有効にして音をキープしてください');if(this.recording||this.takesPending)throw Error('録音を停止してからリコールしてください');const data=ringTail(this.ring,seconds,this.ctx.sampleRate,this.tracks[index].channel),gain=dbToGain(this.tracks[index].gain);for(let i=0;i<data.length;i++)data[i]*=gain;const buffer=this.ctx.createBuffer(1,data.length,this.ctx.sampleRate);buffer.copyToChannel(data,0);const clip={id:crypto.randomUUID(),start:this.cursor,buffer};this.tracks[index].clips.push(clip);return [{index,id:clip.id}];}
  async renderMix(onlyTrack){const duration=this.duration();if(duration<=0)throw Error('まだテープに音がありません');const sr=48000,ctx=new OfflineAudioContext(2,Math.ceil(duration*sr),sr),master=ctx.createGain();master.gain.value=onlyTrack==null?.85:1;master.connect(ctx.destination);const solo=this.tracks.some(t=>t.solo);
    this.tracks.forEach((t,i)=>{if(onlyTrack!=null&&i!==onlyTrack)return;if(onlyTrack==null&&(t.mute||solo&&!t.solo))return;const gain=ctx.createGain(),pan=ctx.createStereoPanner();gain.gain.value=onlyTrack==null?(t.volume<=-60?0:dbToGain(t.volume)):1;pan.pan.value=onlyTrack==null?t.pan:0;gain.connect(pan);pan.connect(master);t.clips.forEach(clip=>{const src=ctx.createBufferSource();src.buffer=clip.buffer;src.connect(gain);src.start(clip.start);});});return ctx.startRendering();}
}
export function makeDemo(ctx){
  const sr=ctx.sampleRate,bpm=108,beat=60/bpm,duration=beat*32,buffers=Array.from({length:4},()=>ctx.createBuffer(1,Math.ceil(duration*sr),sr));
  const add=(tr,start,dur,fn)=>{const data=buffers[tr].getChannelData(0),first=Math.round(start*sr),n=Math.min(Math.round(dur*sr),data.length-first);for(let k=0;k<n;k++)data[first+k]+=fn(k/sr,k/n);};
  let seed=9;const noise=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2147483648-1;};
  for(let b=0;b<32;b++){if(b%4===0||b%4===2)add(0,b*beat,.24,t=>Math.sin(2*Math.PI*(46*t+24*(1-Math.exp(-t*30))/30))*Math.exp(-t*18)*.52);if(b%4===1||b%4===3)add(0,b*beat,.15,t=>(noise()*.35+Math.sin(t*2*Math.PI*180)*.12)*Math.exp(-t*26));for(let h=0;h<2;h++)add(0,(b+h*.5)*beat,.06,t=>noise()*.065*Math.exp(-t*65));
    const midi=[45,45,48,43][Math.floor(b/8)],freq=440*Math.pow(2,(midi-69)/12);add(1,b*beat,beat*.8,(t,u)=>(Math.sin(2*Math.PI*freq*t)+.2*Math.sin(4*Math.PI*freq*t))*.21*Math.min(1,t*90)*Math.pow(1-u,.8));
    if(b%4===0){const chord=[[57,60,64],[57,60,64],[60,64,67],[55,59,62]][Math.floor(b/8)];add(2,b*beat,beat*3.8,(t,u)=>chord.reduce((s,n)=>s+Math.sin(2*Math.PI*440*Math.pow(2,(n-69)/12)*t),0)*.055*Math.min(1,t*8)*(1-u));}
    if(b%2===0){const note=[76,72,69,72,76,79,76,72,79,76,72,76,74,71,67,71][b/2];const f=440*Math.pow(2,(note-69)/12);add(3,b*beat,beat*1.4,(t,u)=>(Math.sin(2*Math.PI*f*t)+.12*Math.sin(2*Math.PI*f*2*t))*.13*Math.min(1,t*50)*Math.exp(-t*3)*(1-u));}
  }return buffers;
}
