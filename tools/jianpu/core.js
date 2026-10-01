(() => {
  'use strict';
  const ROOTS = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
  const QUALITY = {
    maj:{name:'大三和弦',suffix:'',intervals:[0,4,7]},
    min:{name:'小三和弦',suffix:'m',intervals:[0,3,7]},
    dim:{name:'减三和弦',suffix:'dim',intervals:[0,3,6]},
    aug:{name:'增三和弦',suffix:'aug',intervals:[0,4,8]},
    sus2:{name:'挂二和弦',suffix:'sus2',intervals:[0,2,7]},
    sus4:{name:'挂四和弦',suffix:'sus4',intervals:[0,5,7]},
    '7':{name:'属七和弦',suffix:'7',intervals:[0,4,7,10]},
    maj7:{name:'大七和弦',suffix:'maj7',intervals:[0,4,7,11]},
    m7:{name:'小七和弦',suffix:'m7',intervals:[0,3,7,10]},
    m7b5:{name:'半减七和弦',suffix:'m7♭5',intervals:[0,3,6,10]},
    dim7:{name:'减七和弦',suffix:'dim7',intervals:[0,3,6,9]}
  };
  const SCALES = {major:[0,2,4,5,7,9,11],minor:[0,2,3,5,7,8,10]};
  const DIATONIC = {major:['maj','min','min','maj','maj','min','dim'],
    minor:['min','dim','maj','min','min','maj','maj']};
  const mod = (x,n) => ((x%n)+n)%n;
  const beatCount = meter => Number(String(meter).split('/')[0]) || 4;
  const chordName = (root,quality) => ROOTS[mod(root,12)] + (QUALITY[quality]?.suffix ?? '');
  const chordNotes = (root,quality) => (QUALITY[quality]?.intervals || []).map(x => ROOTS[mod(root+x,12)]);
  function keyChords(root,mode) {
    return SCALES[mode].map((offset,i) => ({degree:['I','II','III','IV','V','VI','VII'][i],
      root:mod(root+offset,12),quality:DIATONIC[mode][i]}));
  }
  function noteName(midi) {return `${ROOTS[mod(midi,12)]}${Math.floor(midi/12)-1}`;}
  function stepScaleMidi(midi,key,mode,direction) {
    const scale=SCALES[mode]||SCALES.major,step=direction<0?-1:1;
    for(let candidate=midi+step;candidate>=36&&candidate<=96;candidate+=step)
      if(scale.includes(mod(candidate-key,12)))return candidate;
    return midi;
  }
  function jianpu(midi,key,mode) {
    const pitch = mod(midi-key,12), scale = SCALES[mode] || SCALES.major;
    let degree = scale.indexOf(pitch), accidental = '';
    if (degree < 0) {
      degree = scale.findIndex(value => mod(value+1,12) === pitch);
      if (degree >= 0) accidental = '♯';
      else {
        degree = scale.findIndex(value => mod(value-1,12) === pitch);
        accidental = '♭';
      }
    }
    if (degree < 0) return '?';
    const tonicMidi = 60 + mod(key,12);
    const octave = Math.floor((midi - tonicMidi - scale[degree]) / 12);
    const mark = octave > 0 ? '̇'.repeat(Math.min(octave,3)) : octave < 0 ? '̣'.repeat(Math.min(-octave,3)) : '';
    return `${accidental}${degree+1}${mark}`;
  }
  function detectPitch(samples,sampleRate) {
    const n = Math.min(samples.length,2048);
    let energy = 0;
    for (let i=0;i<n;i++) energy += samples[i]*samples[i];
    if (Math.sqrt(energy/n) < 0.018) return null;
    const minLag = Math.floor(sampleRate/900), maxLag = Math.min(Math.floor(sampleRate/80),Math.floor(n/2));
    let bestLag = 0, bestScore = Infinity;
    const scores = [];
    for (let lag=minLag;lag<=maxLag;lag++) {
      let diff=0,base=0;
      for (let i=0;i<n-lag;i+=2) {
        const a=samples[i],b=samples[i+lag];
        diff+=(a-b)*(a-b);base+=a*a+b*b;
      }
      const score=diff/(base+1e-9);
      scores[lag]=score;
      if (score<bestScore) {bestScore=score;bestLag=lag;}
    }
    if (bestScore>0.22 || !bestLag) return null;
    for (let lag=minLag+1;lag<maxLag;lag++) {
      if (scores[lag]<0.15 && scores[lag]<=scores[lag-1] && scores[lag]<=scores[lag+1]) {
        bestLag=lag;break;
      }
    }
    const midi=Math.round(69+12*Math.log2((sampleRate/bestLag)/440));
    return midi>=36&&midi<=96?midi:null;
  }
  function framesToNotes(frames,bpm,offsetBeat,segmentId) {
    const notes=[];
    if (!frames.length) return notes;
    let current=null,start=0,last=0;
    const add=(end) => {
      if (current===null || end-start<0.18) return;
      const beat=60/bpm;
      const startBeat=Math.round((offsetBeat+start/beat)*4)/4;
      const durationBeats=Math.max(0.25,Math.round(((end-start)/beat)*4)/4);
      notes.push({id:crypto.randomUUID(),segmentId,midi:current,startBeat,durationBeats});
    };
    for (const frame of frames) {
      const midi=frame.midi;
      if (midi===current) {last=frame.time;continue;}
      if (current!==null) add(Math.max(frame.time,last+0.08));
      current=midi;start=frame.time;last=frame.time;
    }
    if (current!==null) add(last+0.08);
    return notes;
  }
  function suggestChords(score) {
    const beats=beatCount(score.meter), maxBar=Math.max(1,...score.notes.map(n=>Math.floor(n.startBeat/beats)+1));
    const palette=keyChords(score.key,score.mode);
    const suggestions=[];
    for (let bar=1;bar<=Math.min(maxBar,128);bar++) {
      const notes=score.notes.filter(n=>Math.floor(n.startBeat/beats)+1===bar);
      if (!notes.length) continue;
      let best=palette[0],bestScore=-Infinity;
      for (const chord of palette) {
        const tones=new Set(QUALITY[chord.quality].intervals.map(x=>mod(chord.root+x,12)));
        const scoreValue=notes.reduce((sum,n)=>sum+(tones.has(mod(n.midi,12))?2:-1)*n.durationBeats,0);
        if (scoreValue>bestScore) {bestScore=scoreValue;best=chord;}
      }
      suggestions.push({bar,root:best.root,quality:best.quality});
    }
    return suggestions;
  }
  function playbackEvents(score,includeChords=true,fromBeat=0) {
    const events=score.notes.map(note=>({type:'note',midi:note.midi,startBeat:note.startBeat,
      durationBeats:note.durationBeats,noteId:note.id}));
    if(includeChords)for(const chord of score.chords) {
      const startBeat=(chord.bar-1)*beatCount(score.meter);
      const root=48+mod(chord.root,12);
      for(const interval of QUALITY[chord.quality]?.intervals||[])
        events.push({type:'chord',midi:root+interval,startBeat,
          durationBeats:beatCount(score.meter)*.9});
    }
    return events.filter(event=>event.startBeat+event.durationBeats>fromBeat)
      .map(event=>({...event,startBeat:Math.max(event.startBeat,fromBeat)-fromBeat,
        durationBeats:event.startBeat+event.durationBeats-Math.max(event.startBeat,fromBeat)}))
      .sort((a,b)=>a.startBeat-b.startBeat || (a.type==='chord')-(b.type==='chord'));
  }
  function scoreText(score) {
    const lines=[`JUNAF 简谱｜${score.title}`,`调性：${ROOTS[score.key]} ${score.mode==='major'?'大调':'小调'}  速度：${score.bpm} BPM  拍号：${score.meter}`,''];
    const beats=beatCount(score.meter);
    const bars=new Map();
    for (const note of [...score.notes].sort((a,b)=>a.startBeat-b.startBeat)) {
      const bar=Math.floor(note.startBeat/beats)+1;
      if (!bars.has(bar)) bars.set(bar,[]);
      bars.get(bar).push(`${jianpu(note.midi,score.key,score.mode)}(${note.durationBeats}拍)${note.lyric?`「${note.lyric}」`:''}`);
    }
    const barNumbers=[...new Set([...bars.keys(),...score.chords.map(chord=>chord.bar)])].sort((a,b)=>a-b);
    for (const bar of barNumbers) {
      const chord=score.chords.find(c=>c.bar===bar);
      lines.push(`${String(bar).padStart(2,'0')}｜${(bars.get(bar)||[]).join(' ')}${chord?`    [${chordName(chord.root,chord.quality)}]`:''}`);
    }
    if (!barNumbers.length) lines.push('尚无音符');
    if (score.segments.length) lines.push('',`段落：${score.segments.map(s=>s.name).join(' / ')}`);
    if (score.idea) lines.push('','创作笔记：',score.idea);
    return lines.join('\n');
  }
  function scoreSvg(score) {
    const beats=beatCount(score.meter);
    const barNumbers=[...new Set([...score.notes.map(n=>Math.floor(n.startBeat/beats)+1),
      ...score.chords.map(chord=>chord.bar)])].sort((a,b)=>a-b);
    if(!barNumbers.length)barNumbers.push(1);
    const barsPerLine=4,lineHeight=100,lines=Math.ceil(barNumbers.length/barsPerLine);
    const width=900,height=170+lines*lineHeight+Math.min(220,score.idea.length?90:0);
    const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
    const nodes=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<rect width="100%" height="100%" fill="#f5f3ec"/>`,
      `<text x="44" y="56" font-family="sans-serif" font-size="30" fill="#171814">${esc(score.title)}</text>`,
      `<text x="44" y="86" font-family="sans-serif" font-size="15" fill="#555">1=${esc(ROOTS[score.key])} ${score.mode==='major'?'大调':'小调'} · ${score.meter} · ♩=${score.bpm}</text>`];
    for (const [index,bar] of barNumbers.entries()) {
      const line=Math.floor(index/barsPerLine),col=index%barsPerLine,x=44+col*207,y=125+line*lineHeight;
      const notes=score.notes.filter(n=>Math.floor(n.startBeat/beats)+1===bar).sort((a,b)=>a.startBeat-b.startBeat);
      const chord=score.chords.find(c=>c.bar===bar);
      nodes.push(`<rect x="${x}" y="${y}" width="194" height="72" fill="none" stroke="#c7c4ba"/>`,
        `<text x="${x+8}" y="${y+17}" font-family="sans-serif" font-size="12" fill="#777">${bar}${chord?` · ${esc(chordName(chord.root,chord.quality))}`:''}</text>`);
      const shown=notes.slice(0,9);
      shown.forEach((note,i)=>{
        nodes.push(`<text x="${x+10+i*20}" y="${y+43}" font-family="sans-serif" font-size="20" fill="#171814">${esc(jianpu(note.midi,score.key,score.mode))}</text>`);
        if(note.lyric)nodes.push(`<text x="${x+10+i*20}" y="${y+63}" font-family="sans-serif" font-size="12" fill="#555">${esc(note.lyric.slice(0,2))}</text>`);
      });
      if (notes.length>9) nodes.push(`<text x="${x+175}" y="${y+50}" font-size="12">…</text>`);
    }
    if (score.idea) nodes.push(`<text x="44" y="${135+lines*lineHeight}" font-family="sans-serif" font-size="13" fill="#555">创作笔记：${esc(score.idea.slice(0,100))}</text>`);
    nodes.push(`<text x="44" y="${height-24}" font-family="sans-serif" font-size="11" fill="#999">JUNAF / TOOLS / 简谱</text></svg>`);
    return nodes.join('');
  }
  const api={ROOTS,QUALITY,SCALES,DIATONIC,beatCount,chordName,chordNotes,keyChords,noteName,stepScaleMidi,
    jianpu,detectPitch,framesToNotes,suggestChords,playbackEvents,scoreText,scoreSvg};
  if (typeof module!=='undefined'&&module.exports) module.exports=api;
  if (typeof window!=='undefined') window.JunafJianpuCore=api;
})();
