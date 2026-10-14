(() => {
'use strict';
function draft(bars=4,bpm=100,random=Math.random){
 if(![4,8].includes(Number(bars))||!Number.isFinite(bpm)||bpm<40||bpm>200)throw Error('请选择 4 / 8 小节和 40–200 BPM');
 const scale=['C','D','E','F','G','A','B','c'];let n=2;const lines=[];
 for(let bar=0;bar<bars;bar++){const notes=[];for(let beat=0;beat<4;beat++){n=Math.max(0,Math.min(7,n+Math.floor(random()*3)-1));notes.push(bar===bars-1&&beat===3?'C':scale[n]);}lines.push(notes.join(' '));}
 return `X:1\nT:JUNAF melody sketch\nM:4/4\nL:1/4\nQ:1/4=${bpm}\nK:C\n${lines.join(' | ')} |`;
}
function parse(abc){
 if(typeof abc!=='string'||abc.length>32000)throw Error('曲谱过长');
 const lines=abc.replace(/^\uFEFF/,'').split('\n'),headers={},body=[];let started=false;
 for(let line of lines){line=line.replace(/%.*/,'').trim();if(!line)continue;const m=line.match(/^([A-Za-z]):\s*(.*)$/);if(m){if(started)throw Error('本机试听不支持多声部或内联字段');headers[m[1]]=m[2];if(m[1]==='K')started=true;}else if(started)body.push(line);else throw Error('请先填写 ABC 头部');}
 if(!/^\d+$/.test(headers.X||'')||!/^C(?:maj)?\s*$/.test(headers.K||''))throw Error('本机试听仅支持单旋律 C 大调；其他曲谱可校对后提交');
 if(headers.V)throw Error('本机试听暂不支持多声部');
 const frac=s=>{const m=String(s).match(/^(\d+)\/(\d+)$/);if(!m||!+m[2])throw Error('单位音符无效');return +m[1]/+m[2];};
 const unit=frac(headers.L||'1/8')*4;
 const q=(headers.Q||'1/4=100').match(/^(?:(\d+\/\d+)\s*=\s*)?(\d+)$/);if(!q)throw Error('速度格式请使用 Q:1/4=100');
 const bpm=+q[2]*(q[1]?frac(q[1])*4:1);if(bpm<20||bpm>400)throw Error('曲谱速度超出试听范围');
 const source=body.join(' ');let cursor=0,beat=0,acc={};const events=[];
 while(cursor<source.length){const rest=source.slice(cursor),space=rest.match(/^[\s|]+/);if(space){if(space[0].includes('|'))acc={};cursor+=space[0].length;continue;}
 const m=rest.match(/^(\^\^|__|\^|_|=)?([A-Ga-gz])([,']*)(\d+)?(?:\/(\d*)?)?/);if(!m)throw Error('本机试听遇到不支持的记号，请使用简单单旋律 ABC');
 cursor+=m[0].length;const slash=m[0].includes('/'),duration=unit*(m[4]?+m[4]:1)/(slash?(m[5]?+m[5]:2):1);
 if(!Number.isFinite(duration)||duration<=0||duration>64)throw Error('音长无效');
 let midi=null;if(m[2]!=='z'){const c=m[2],letter=c.toUpperCase(),oct=(c===letter?0:12)+[...m[3]].reduce((a,x)=>a+(x==="'"?12:-12),0),key=c+oct;
 if(m[1])acc[key]=({'^':1,'^^':2,'_':-1,'__':-2,'=':0})[m[1]];
 midi=60+({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[letter]+oct+(acc[key]||0);if(midi<24||midi>108)throw Error('音高超出试听范围');}
 events.push({midi,startBeat:beat,durationBeats:duration});beat+=duration;if(events.length>2048||beat*60/bpm>180)throw Error('本机试听最多支持 180 秒');
 }
 if(!events.some(e=>e.midi!==null))throw Error('曲谱中没有旋律音符');return {bpm,events,duration:beat*60/bpm};
}
function fromNotes(notes,bpm){
 const total=Math.min(800,Math.ceil(Math.max(0,...notes.map(n=>n.startBeat+n.durationBeats))/4)*16);if(!total)throw Error('没有识别到稳定的单声部旋律，请使用干净清唱或单乐器录音');
 const slots=Array(total).fill(null);for(const n of notes){const a=Math.round(n.startBeat*4),b=Math.round((n.startBeat+n.durationBeats)*4);for(let i=a;i<b&&i<total;i++)slots[i]=n.midi;}
 const names=['=C','^C','=D','^D','=E','=F','^F','=G','^G','=A','^A','=B'];const parts=[];
 for(let i=0;i<slots.length;){let end=i+1;while(end<slots.length&&slots[end]===slots[i]&&end%16!==0)end++;const n=slots[i],oct=n===null?0:Math.floor(n/12)-5;let name=n===null?'z':names[((n%12)+12)%12];if(oct>0)name+="'".repeat(oct);if(oct<0)name+=','.repeat(-oct);parts.push(name+(end-i)+'/4');if(end%16===0)parts.push('|');i=end;}
 return `X:1\nT:JUNAF reference sketch\nM:4/4\nL:1/4\nQ:1/4=${bpm}\nK:C\n${parts.join(' ')} |`;
}
function toABC(events,bpm){
 if(!Array.isArray(events)||!events.length||events.length>128||!Number.isFinite(bpm)||bpm<20||bpm>400)throw Error('音符数量或速度无效');
 const names=['=C','^C','=D','^D','=E','=F','^F','=G','^G','=A','^A','=B'];let ticks=0;const parts=[];
 for(const event of events){let left=event.durationBeats*4;if(!Number.isInteger(left)||left<1||left>16)throw Error('音符编辑支持 0.25–4 拍，以 0.25 拍为步长');let token='z';if(event.midi!==null){if(!Number.isInteger(event.midi)||event.midi<36||event.midi>96)throw Error('请选择 MIDI 36–96 范围内音符');const oct=Math.floor(event.midi/12)-5;token=names[event.midi%12]+(oct>0?"'".repeat(oct):','.repeat(-oct));}
 while(left){const n=Math.min(left,16-ticks%16);parts.push(token+n+'/4');ticks+=n;left-=n;if(ticks%16===0)parts.push('|');}}
 if(ticks%16)parts.push('z'+(16-ticks%16)+'/4 |');
 return `X:1\nT:JUNAF edited melody\nM:4/4\nL:1/4\nQ:1/4=${bpm}\nK:C\n${parts.join(' ')}`;
}
const api={draft,parse,fromNotes,toABC};if(typeof module!=='undefined')module.exports=api;if(typeof window!=='undefined')window.JunafMelody=api;
})();
