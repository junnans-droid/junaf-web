(() => {'use strict';
const ROOTS=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const chordNotes=(root,quality)=>[root,root+(['min','dim'].includes(quality)?3:4),root+(quality==='dim'?6:7)];
function suggest(plan){
 const count=Math.ceil(plan.duration*plan.bpm/60/4);if(count<1||count>64)throw Error('伴奏最多处理 64 小节，请截取短段');
 const hist=Array(12).fill(0);for(const n of plan.events)if(n.midi!==null)hist[n.midi%12]+=n.durationBeats;
 let best=-Infinity,key=0,mode='major';for(let tonic=0;tonic<12;tonic++)for(const kind of ['major','minor']){const scale=kind==='major'?[0,2,4,5,7,9,11]:[0,2,3,5,7,8,10];const score=hist.reduce((s,v,pc)=>s+v*(scale.includes((pc-tonic+12)%12)?1:-1.3),0)+(hist[tonic]||0)*.15;if(score>best){best=score;key=tonic;mode=kind;}}
 const scale=mode==='major'?[0,2,4,5,7,9,11]:[0,2,3,5,7,8,10],qualities=mode==='major'?['maj','min','min','maj','maj','min','dim']:['min','dim','maj','min','min','maj','maj'];let previous=key;
 const chart=[];for(let bar=0;bar<count;bar++){const weights=Array(12).fill(0);for(const n of plan.events){if(n.midi===null)continue;const overlap=Math.max(0,Math.min(n.startBeat+n.durationBeats,(bar+1)*4)-Math.max(n.startBeat,bar*4));weights[n.midi%12]+=overlap;}if(!weights.some(Boolean)){chart.push({root:0,quality:'none'});continue;}let chosen={root:key,quality:mode==='major'?'maj':'min'},score=-Infinity;for(let degree=0;degree<7;degree++){const root=(key+scale[degree])%12,quality=qualities[degree],pcs=chordNotes(root,quality).map(n=>n%12);let value=weights.reduce((s,w,pc)=>s+w*(pcs.includes(pc)?1:-.35),0);if(root===previous)value+=.12;if(degree===0)value+=.08;if(quality==='dim')value-=.25;if(value>score){score=value;chosen={root,quality};}}chart.push(chosen);previous=chosen.root;}
 return {chart,key,mode};
}
function validate(chart){if(!Array.isArray(chart)||!chart.length||chart.length>64)throw Error('请先建议或填写和弦');for(const c of chart)if(!Number.isInteger(c.root)||c.root<0||c.root>11||!['maj','min','dim','none'].includes(c.quality))throw Error('和弦格式无效');}
function schedule({plan,chart,instrument='piano',goal='accompaniment',pattern='arpeggio',offset=0,duration}){
 if(!['piano','guitar'].includes(instrument)||!['melody','accompaniment'].includes(goal)||!['arpeggio','block','strum'].includes(pattern))throw Error('请选择支持的乐器与演奏方式');
 if(!Number.isFinite(offset)||Math.abs(offset)>2||!Number.isFinite(duration)||duration<=0||duration>60)throw Error('长度最多 60 秒，偏移范围为 -2 到 2 秒');
 const beat=60/plan.bpm,events=[];const add=(midi,time,length,gain)=>{time+=offset;const end=Math.min(duration,time+length),start=Math.max(0,time);if(end<=start)return;events.push({midi,time:start,duration:end-start,gain});};
 if(goal==='melody'){for(const n of plan.events)if(n.midi!==null)add(n.midi,n.startBeat*beat,n.durationBeats*beat,.65);}
 else {validate(chart);chart.forEach((c,bar)=>{if(c.quality==='none')return;const base=48+c.root,triad=chordNotes(base,c.quality);if(pattern==='arpeggio'){const order=[0,2,1,2,0,2,1,2];order.forEach((degree,j)=>add(triad[degree],(bar*4+j*.5)*beat,.85*beat,.45));}else{for(let j=0;j<4;j++){const notes=instrument==='guitar'?[triad[0],triad[2],triad[0]+12,triad[1]+12,triad[2]+12]:triad;notes.forEach((midi,k)=>add(midi,(bar*4+j)*beat+(pattern==='strum'?k*.016:0),.9*beat,.22));}}});}
 if(!events.length)throw Error('当前设置没有可演奏音符，请检查和弦与偏移');return events;
}
function render(options,rate=22050){
 const events=schedule(options),pcm=new Float32Array(Math.ceil(options.duration*rate));let seed=4321;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296*2-1;};
 for(const n of events){const start=Math.round(n.time*rate),length=Math.min(Math.ceil(n.duration*rate),pcm.length-start),freq=440*2**((n.midi-69)/12);if(options.instrument==='guitar'){const period=Math.max(2,Math.round(rate/freq)),ring=Float32Array.from({length:period},random);let cursor=0;for(let i=0;i<length;i++){const value=ring[cursor];ring[cursor]=.496*(value+ring[(cursor+1)%period]);cursor=(cursor+1)%period;const fade=Math.min(1,i/(rate*.003),(length-i)/(rate*.025));pcm[start+i]+=value*fade*n.gain*.6;}}
 else {for(let i=0;i<length;i++){const t=i/rate,phase=2*Math.PI*freq*t,env=(1-Math.exp(-t*500))*Math.exp(-t*3.2)*Math.min(1,(length-i)/(rate*.025));pcm[start+i]+=(Math.sin(phase)+.27*Math.sin(phase*2)+.12*Math.sin(phase*3))*env*n.gain*.26;}}}
 let peak=0;for(const value of pcm)peak=Math.max(peak,Math.abs(value));const gain=peak>.9?.9/peak:1;if(gain<1)for(let i=0;i<pcm.length;i++)pcm[i]*=gain;
 return {pcm,rate,events,peak:Math.min(.9,peak),duration:options.duration};
}
function wav(pcm,rate){const buffer=new ArrayBuffer(44+pcm.length*2),v=new DataView(buffer),str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};str(0,'RIFF');v.setUint32(4,36+pcm.length*2,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,pcm.length*2,true);for(let i=0;i<pcm.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),true);return buffer;}
const api={ROOTS,chordNotes,suggest,validate,schedule,render,wav};if(typeof module!=='undefined')module.exports=api;if(typeof window!=='undefined')window.JunafAccompanimentCore=api;
})();
