(() => {
  'use strict';
  const C = window.JunafJianpuCore;
  const API = ['localhost','127.0.0.1'].includes(location.hostname)
    ? 'http://127.0.0.1:3100' : 'https://api.junaf.com';
  const GUEST_KEY = 'junaf_jianpu_guest_v1';
  const $ = id => document.getElementById(id);
  const node = (tag,text,className) => {const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(className)x.className=className;return x;};
  const uuid = () => crypto.randomUUID();
  const status = text => { $('save-status').textContent = text; };
  let account=null,summaries=[],score=null,saveTimer=null,saveQueue=Promise.resolve(),recording=null,playback=null;
  const localAudio=new Map(),pendingAudio=new Map();
  function freshScore() {
    return {id:uuid(),title:'未命名旋律',key:0,mode:'major',bpm:90,meter:'4/4',idea:'',
      segments:[{id:uuid(),name:'手写旋律',durationMs:0}],notes:[],chords:[]};
  }
  function guestScores() {
    try {const data=JSON.parse(localStorage.getItem(GUEST_KEY)||'[]');return Array.isArray(data)?data:[];}
    catch {return [];}
  }
  function persistGuest(item) {
    const rows=guestScores();const i=rows.findIndex(x=>x.id===item.id);
    if(i>=0)rows[i]=item;else rows.unshift(item);
    try {localStorage.setItem(GUEST_KEY,JSON.stringify(rows.slice(0,50)));status('曲谱已保存在本机；录音请及时下载');}
    catch {status('本机空间不足，请导出曲谱备份');}
  }
  async function request(path,method='GET',body) {
    const response=await fetch(`${API}/api/tools/jianpu${path}`,{method,credentials:'include',cache:'no-store',
      headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,
      signal:AbortSignal.timeout(20000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw Error(data.message||'请求失败');
    return data;
  }
  function summaryOf(item) {return {id:item.id,title:item.title,key:item.key,mode:item.mode,updatedAt:new Date().toISOString()};}
  function updatePicker() {
    const picker=$('score-picker');picker.replaceChildren();
    for(const item of summaries){const option=node('option',`${item.title} · ${C.ROOTS[item.key]}${item.mode==='major'?'大':'小'}调`);option.value=item.id;picker.append(option);}
    if(score)picker.value=score.id;
  }
  function updateSummary(item) {
    summaries=summaries.filter(x=>x.id!==item.id);summaries.unshift(summaryOf(item));updatePicker();
  }
  async function saveScore(item) {
    if(!item)return;
    if(!account){persistGuest(item);updateSummary(item);return;}
    saveQueue=saveQueue.catch(()=>{}).then(async()=>{
      await request(`/scores/${item.id}`,'PUT',item);
      if(score?.id===item.id)status('已同步到 JUNAF 账号');
      updateSummary(item);
      await uploadPending(item.id);
    });
    try {await saveQueue;}catch(error){status(`同步失败：${error.message}`);}
  }
  function scheduleSave(){if(!score)return;stopPlayback();const item=score;status(account?'正在同步…':'正在保存本机…');clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveScore(item),700);}
  function playerTime(seconds){const n=Math.max(0,Math.floor(seconds));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}
  function playerUi() {
    $('play-score').textContent=playback?.paused?'继续播放 ▶':playback?'暂停 Ⅱ':'播放曲谱 ▶';
    $('stop-score').disabled=!playback;
    const total=playback?.totalSeconds||Math.max(0,...C.playbackEvents(score||{notes:[],chords:[],meter:'4/4'},$('play-chords').checked)
      .map(x=>x.startBeat+x.durationBeats))*60/(score?.bpm||90);
    const elapsed=playback?Math.min(total,Math.max(0,playback.context.currentTime-playback.startTime)):0;
    $('play-progress').textContent=`${playerTime(elapsed)} / ${playerTime(total)}`;
  }
  function stopPlayback() {
    if(!playback)return;
    clearInterval(playback.timer);
    const old=playback;playback=null;
    old.context.close().catch(()=>{});
    playerUi();
  }
  function scheduleTone(context,event,start,duration) {
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type=event.type==='chord'?'triangle':'sine';
    oscillator.frequency.value=440*Math.pow(2,(event.midi-69)/12);
    const level=event.type==='chord'?.045:.17;
    gain.gain.setValueAtTime(0,start);
    gain.gain.linearRampToValueAtTime(level,start+.015);
    gain.gain.setValueAtTime(level,start+Math.max(.016,duration-.055));
    gain.gain.linearRampToValueAtTime(0,start+duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);oscillator.stop(start+duration+.01);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  async function playScore() {
    if(playback){
      try {if(playback.paused){await playback.context.resume();playback.paused=false;}
        else {await playback.context.suspend();playback.paused=true;}playerUi();}
      catch(error){stopPlayback();status(`播放失败：${error.message}`);}
      return;
    }
    if(recording){status('请先结束录音，再播放曲谱');return;}
    const events=C.playbackEvents(score,$('play-chords').checked);
    if(!events.length){status('曲谱还没有音符或和弦');return;}
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio){status('此浏览器不支持曲谱播放');return;}
    try {
      const context=new Audio();await context.resume();
      const beatSeconds=60/score.bpm,startTime=context.currentTime+.08;
      const endBeat=Math.max(...events.map(x=>x.startBeat+x.durationBeats));
      const session={context,events,index:0,startTime,beatSeconds,endBeat,
        totalSeconds:endBeat*beatSeconds,paused:false,timer:null};
      playback=session;
      const tick=()=>{
        if(playback!==session||session.paused)return;
        const now=context.currentTime;
        while(session.index<events.length&&startTime+events[session.index].startBeat*beatSeconds<now+.25){
          const event=events[session.index++];
          const at=Math.max(now+.005,startTime+event.startBeat*beatSeconds);
          const duration=Math.max(.06,event.durationBeats*beatSeconds*.9);
          scheduleTone(context,event,at,duration);
        }
        playerUi();
        if(session.index===events.length&&now>=startTime+endBeat*beatSeconds+.08)stopPlayback();
      };
      session.timer=setInterval(tick,50);tick();
    }catch(error){stopPlayback();status(`播放失败：${error.message}`);}
  }
  async function uploadPending(scoreId) {
    for(const [key,blob] of [...pendingAudio]) {
      if(!key.startsWith(`${scoreId}:`))continue;
      const segmentId=key.slice(scoreId.length+1);
      try {
        const response=await fetch(`${API}/api/tools/jianpu/scores/${scoreId}/segments/${segmentId}/audio`,{
          method:'PUT',credentials:'include',cache:'no-store',headers:{'Content-Type':blob.type||'audio/webm'},
          body:blob,signal:AbortSignal.timeout(30000)});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||!result.ok)throw Error(result.message||'录音上传失败');
        pendingAudio.delete(key);
        const segment=score?.id===scoreId&&score.segments.find(x=>x.id===segmentId);
        if(segment)segment.audioAvailable=true;
        status('曲谱与录音已同步到 JUNAF 账号');
      } catch(error) {status(`曲谱已保存，录音待重试：${error.message}`);}
    }
  }
  function labelOptions(select,values) {select.replaceChildren();values.forEach(([value,name])=>{const option=node('option',name);option.value=value;select.append(option);});}
  function setupReference() {
    for(const id of ['score-key','chord-root','reference-key'])labelOptions($(id),C.ROOTS.map((name,i)=>[String(i),name]));
    labelOptions($('reference-root'),[['all','全部根音'],...C.ROOTS.map((name,i)=>[String(i),name])]);
    labelOptions($('chord-quality'),Object.entries(C.QUALITY).map(([key,q])=>[key,`${q.name} ${q.suffix}`]));
    labelOptions($('reference-quality'),[['all','全部类型'],...Object.entries(C.QUALITY).map(([key,q])=>[key,q.name])]);
    renderReference();
  }
  function renderReference() {
    const rootFilter=$('reference-root').value,qualityFilter=$('reference-quality').value;
    const catalog=$('chord-catalog');catalog.replaceChildren();
    for(let root=0;root<12;root++)for(const [quality,definition] of Object.entries(C.QUALITY)) {
      if(rootFilter!=='all'&&Number(rootFilter)!==root || qualityFilter!=='all'&&qualityFilter!==quality)continue;
      const button=node('button');button.type='button';
      button.append(node('strong',C.chordName(root,quality)),node('span',`${definition.name} · ${C.chordNotes(root,quality).join(' · ')}`));
      button.addEventListener('click',()=>{$('chord-root').value=String(root);$('chord-quality').value=quality;$('chord-bar').focus();});
      catalog.append(button);
    }
    const keyRoot=Number($('reference-key').value),mode=$('reference-mode').value;
    const table=$('key-chords');table.replaceChildren();
    for(const chord of C.keyChords(keyRoot,mode)) {
      const button=node('button');button.type='button';
      button.append(node('strong',`${chord.degree} · ${C.chordName(chord.root,chord.quality)}`),
        node('span',C.chordNotes(chord.root,chord.quality).join(' · ')));
      button.addEventListener('click',()=>{$('chord-root').value=String(chord.root);$('chord-quality').value=chord.quality;$('chord-bar').focus();});
      table.append(button);
    }
  }
  function renderPreview() {
    const preview=$('score-preview');preview.replaceChildren();
    preview.append(node('div',`1=${C.ROOTS[score.key]} ${score.mode==='major'?'大调':'小调'} · ${score.meter} · ♩=${score.bpm}`,'jp-preview-head'));
    if(!score.notes.length&&!score.chords.length){preview.append(node('p','尚无音符。开始录音或手动添加音符。'));return;}
    const beats=C.beatCount(score.meter);
    const allBarNumbers=[...new Set([...score.notes.map(n=>Math.floor(n.startBeat/beats)+1),
      ...score.chords.map(chord=>chord.bar)])].sort((a,b)=>a-b);
    const barNumbers=allBarNumbers.slice(0,128);
    const bars=node('div',undefined,'jp-bars');
    for(const bar of barNumbers) {
      const box=node('div',undefined,'jp-bar');box.append(node('small',`小节 ${bar}`));
      const chord=score.chords.find(x=>x.bar===bar);
      const chordEdit=node('div',undefined,'jp-inline-chord');
      const root=node('select');root.setAttribute('aria-label',`第 ${bar} 小节和弦根音`);
      labelOptions(root,[['none','无和弦'],...C.ROOTS.map((name,i)=>[String(i),name])]);root.value=chord?String(chord.root):'none';
      const quality=node('select');quality.setAttribute('aria-label',`第 ${bar} 小节和弦类型`);
      labelOptions(quality,Object.entries(C.QUALITY).map(([id,item])=>[id,item.name]));quality.value=chord?.quality||'maj';quality.disabled=!chord;
      root.addEventListener('change',()=>{
        score.chords=score.chords.filter(x=>x.bar!==bar);
        if(root.value!=='none')score.chords.push({bar,root:Number(root.value),quality:quality.value});
        renderChords();renderPreview();scheduleSave();
      });
      quality.addEventListener('change',()=>{const item=score.chords.find(x=>x.bar===bar);
        if(item){item.quality=quality.value;renderChords();renderPreview();scheduleSave();}});
      chordEdit.append(root,quality);box.append(chordEdit);
      const line=node('div',undefined,'jp-bar-notes');
      for(const note of score.notes.filter(x=>Math.floor(x.startBeat/beats)+1===bar).sort((a,b)=>a.startBeat-b.startBeat)) {
        const cell=node('div',undefined,'jp-note-edit');
        const symbol=node('button',C.jianpu(note.midi,score.key,score.mode));symbol.type='button';symbol.title='点击定位到音符详细编辑';
        symbol.append(node('small',`${note.durationBeats}拍`));
        symbol.addEventListener('click',()=>{const row=document.getElementById(`note-${note.id}`);row?.scrollIntoView({behavior:'smooth',block:'center'});row?.querySelector('input[type=number]')?.focus();});
        const pitch=node('input');pitch.type='number';pitch.min=36;pitch.max=96;pitch.value=note.midi;
        pitch.setAttribute('aria-label',`第 ${bar} 小节音符音高 MIDI`);
        pitch.addEventListener('change',()=>{note.midi=Math.max(36,Math.min(96,Math.round(Number(pitch.value)||60)));renderPreview();renderNotes();scheduleSave();});
        const lyric=node('input');lyric.type='text';lyric.maxLength=40;lyric.value=note.lyric||'';lyric.placeholder='歌词';
        lyric.setAttribute('aria-label',`第 ${bar} 小节音符歌词`);
        lyric.addEventListener('input',()=>{note.lyric=lyric.value;scheduleSave();});
        cell.append(symbol,pitch,lyric);
        line.append(cell);
      }
      box.append(line);bars.append(box);
    }
    preview.append(bars);
    if(allBarNumbers.length>128)preview.append(node('p','这里只显示前 128 个有内容的小节；导出文件包含完整曲谱。'));
  }
  function renderSegments() {
    const list=$('segment-list');list.replaceChildren();
    for(const segment of score.segments) {
      const row=node('article');
      const name=node('input');name.type='text';name.maxLength=60;name.value=segment.name;name.setAttribute('aria-label','段落名称');
      name.addEventListener('change',()=>{segment.name=name.value.trim()||'未命名段落';scheduleSave();renderNotes();});
      row.append(name,node('small',segment.durationMs?`${Math.round(segment.durationMs/1000)} 秒 · ${score.notes.filter(n=>n.segmentId===segment.id).length} 个音符`:'手写段落'));
      const actions=node('div',undefined,'jp-actions');
      const key=`${score.id}:${segment.id}`;
      if(localAudio.has(key)||segment.audioAvailable) {
        const play=node('button','播放录音');play.type='button';
        play.addEventListener('click',async()=>{
          try {
            let url=localAudio.get(key);
            if(!url){const response=await fetch(`${API}/api/tools/jianpu/scores/${score.id}/segments/${segment.id}/audio`,
              {credentials:'include',cache:'no-store'});if(!response.ok)throw Error('录音暂不可用');
              url=URL.createObjectURL(await response.blob());localAudio.set(key,url);}
            const audio=node('audio');audio.controls=true;audio.src=url;row.querySelector('audio')?.remove();row.append(audio);await audio.play();
          }catch(error){status(error.message);}
        });actions.append(play);
        const download=node('button','下载录音');download.type='button';
        download.addEventListener('click',async()=>{
          try {let url=localAudio.get(key);
            if(!url){const response=await fetch(`${API}/api/tools/jianpu/scores/${score.id}/segments/${segment.id}/audio`,
              {credentials:'include',cache:'no-store'});if(!response.ok)throw Error('录音暂不可用');
              url=URL.createObjectURL(await response.blob());localAudio.set(key,url);}
            const a=node('a');a.href=url;a.download=`${safeName(score.title)}-${safeName(segment.name)}.audio`;a.click();
          }catch(error){status(error.message);}
        });actions.append(download);
      }
      if(score.segments.length>1){const remove=node('button','删除段落');remove.type='button';remove.addEventListener('click',()=>{
        if(!confirm(`删除段落“${segment.name}”及其中的音符和录音？`))return;
        score.segments=score.segments.filter(x=>x.id!==segment.id);score.notes=score.notes.filter(x=>x.segmentId!==segment.id);
        pendingAudio.delete(key);if(localAudio.has(key)){URL.revokeObjectURL(localAudio.get(key));localAudio.delete(key);}
        renderAll();scheduleSave();
      });actions.append(remove);}
      row.append(actions);list.append(row);
    }
  }
  function renderNotes() {
    const body=$('note-rows');body.replaceChildren();
    for(const note of [...score.notes].sort((a,b)=>a.startBeat-b.startBeat).slice(0,1500)) {
      const tr=node('tr');tr.id=`note-${note.id}`;
      const segment=node('select');labelOptions(segment,score.segments.map(x=>[x.id,x.name]));segment.value=note.segmentId;
      segment.addEventListener('change',()=>{note.segmentId=segment.value;scheduleSave();});
      const midi=node('input');midi.type='number';midi.min=36;midi.max=96;midi.value=note.midi;midi.setAttribute('aria-label','MIDI 音高');
      midi.title=C.noteName(note.midi);midi.addEventListener('change',()=>{note.midi=Math.max(36,Math.min(96,Math.round(Number(midi.value)||60)));midi.value=note.midi;midi.title=C.noteName(note.midi);renderPreview();renderNotes();scheduleSave();});
      const start=node('input');start.type='number';start.min=0;start.step=.25;start.value=note.startBeat;
      start.addEventListener('change',()=>{note.startBeat=Math.max(0,Math.min(100000,Number(start.value)||0));renderPreview();scheduleSave();});
      const duration=node('input');duration.type='number';duration.min=.125;duration.max=64;duration.step=.25;duration.value=note.durationBeats;
      duration.addEventListener('change',()=>{note.durationBeats=Math.max(.125,Math.min(64,Number(duration.value)||1));renderPreview();scheduleSave();});
      const lyric=node('input');lyric.type='text';lyric.maxLength=40;lyric.value=note.lyric||'';lyric.placeholder='歌词';
      lyric.setAttribute('aria-label','音符歌词');lyric.addEventListener('input',()=>{note.lyric=lyric.value;renderPreview();scheduleSave();});
      const remove=node('button','删除');remove.type='button';remove.addEventListener('click',()=>{score.notes=score.notes.filter(x=>x.id!==note.id);renderAll();scheduleSave();});
      const pitch=node('div');pitch.append(midi,node('small',`${C.noteName(note.midi)} · 简谱 ${C.jianpu(note.midi,score.key,score.mode)}`));
      for(const control of [segment,pitch,start,duration,lyric,remove]){const td=node('td');td.append(control);tr.append(td);}body.append(tr);
    }
  }
  function renderChords() {
    const list=$('chord-list');list.replaceChildren();
    for(const chord of [...score.chords].sort((a,b)=>a.bar-b.bar)) {
      const row=node('article');row.append(node('strong',`小节 ${chord.bar} · ${C.chordName(chord.root,chord.quality)}`),
        node('small',C.chordNotes(chord.root,chord.quality).join(' · ')));
      const edit=node('button','载入修改');edit.type='button';edit.addEventListener('click',()=>{$('chord-bar').value=chord.bar;$('chord-root').value=chord.root;$('chord-quality').value=chord.quality;$('add-chord').focus();});
      const remove=node('button','删除');remove.type='button';remove.addEventListener('click',()=>{score.chords=score.chords.filter(x=>x!==chord);renderChords();renderPreview();scheduleSave();});
      const actions=node('div',undefined,'jp-actions');actions.append(edit,remove);row.append(actions);list.append(row);
    }
    if(!score.chords.length)list.append(node('p','暂无和弦。可根据旋律建议，或从和弦表选择后添加。'));
  }
  function renderAll() {
    $('score-title').value=score.title;$('score-key').value=score.key;$('score-mode').value=score.mode;
    $('score-bpm').value=score.bpm;$('score-meter').value=score.meter;$('score-idea').value=score.idea;
    renderSegments();renderNotes();renderChords();renderPreview();updatePicker();playerUi();
  }
  function safeName(value) {return String(value).replace(/[\\/:*?"<>|]/g,'-').slice(0,80)||'JUNAF';}
  function download(content,type,name) {
    const url=URL.createObjectURL(new Blob([content],{type}));const a=node('a');a.href=url;a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function choose(id) {
    stopPlayback();
    clearTimeout(saveTimer);if(score)await saveScore(score);
    if(account){try{score=(await request(`/scores/${id}`)).score;}catch(error){status(error.message);return;}}
    else score=guestScores().find(x=>x.id===id);
    if(score)renderAll();
  }
  async function startRecording() {
    stopPlayback();
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){$('record-status').textContent='此浏览器不支持录音；可手动添加音符。';return;}
    if(score.segments.length>=30){$('record-status').textContent='当前曲谱已达到 30 个段落上限，请新建曲谱。';return;}
    if(score.notes.length>=1500){$('record-status').textContent='当前曲谱已达到 1500 个音符上限，请新建曲谱。';return;}
    $('record-toggle').disabled=true;
    let stream;
    try {stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      const context=new (window.AudioContext||window.webkitAudioContext)();await context.resume();
      const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();analyser.fftSize=2048;source.connect(analyser);
      const options=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg']
        .find(x=>typeof MediaRecorder.isTypeSupported==='function'&&MediaRecorder.isTypeSupported(x));
      const recorder=new MediaRecorder(stream,options?{mimeType:options}:undefined),chunks=[],frames=[];
      const samples=new Float32Array(analyser.fftSize),started=performance.now();
      recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
      recorder.onstop=async()=>{
        clearInterval(recording?.timer);stream.getTracks().forEach(track=>track.stop());await context.close().catch(()=>{});
        $('record-toggle').textContent='开始录音 ●';$('record-toggle').disabled=false;
        $('score-picker').disabled=false;$('new-score').disabled=false;$('delete-score').disabled=false;recording=null;
        const durationMs=Math.round(performance.now()-started),mime=recorder.mimeType.split(';')[0]||'audio/webm';
        const blob=new Blob(chunks,{type:mime});
        if(blob.size<100){$('record-status').textContent='录音过短，请再试一次。';return;}
        const segmentId=uuid(),name=$('segment-name').value.trim()||`段落 ${score.segments.length}`;
        const offset=Math.ceil(Math.max(0,...score.notes.map(n=>n.startBeat+n.durationBeats)));
        const stable=frames.map((frame,i)=>{
          const nearby=frames.slice(Math.max(0,i-1),i+2).map(x=>x.midi).filter(x=>x!==null).sort((a,b)=>a-b);
          return {...frame,midi:nearby.length>=2?nearby[Math.floor(nearby.length/2)]:frame.midi};
        });
        const recognized=C.framesToNotes(stable,score.bpm,offset,segmentId).slice(0,1500-score.notes.length);
        score.segments.push({id:segmentId,name,durationMs});score.notes.push(...recognized);
        const key=`${score.id}:${segmentId}`;localAudio.set(key,URL.createObjectURL(blob));pendingAudio.set(key,blob);
        $('segment-name').value='';$('record-status').textContent=`已保存段落：识别 ${recognized.length} 个音符。请在下方校对。`;
        renderAll();await saveScore(score);
      };
      recorder.start(1000);
      const timer=setInterval(()=>{
        if(!recording)return;
        analyser.getFloatTimeDomainData(samples);
        frames.push({time:(performance.now()-started)/1000,midi:C.detectPitch(samples,context.sampleRate)});
        const seconds=Math.floor((performance.now()-started)/1000);
        $('record-timer').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
        if(seconds>=300&&recorder.state==='recording')recorder.stop();
      },80);
      recording={recorder,timer};$('record-toggle').disabled=false;$('record-toggle').textContent='结束本段 ■';
      $('score-picker').disabled=true;$('new-score').disabled=true;$('delete-score').disabled=true;
      $('record-status').textContent='正在录音与分析单声部音高…';
    }catch(error){stream?.getTracks().forEach(track=>track.stop());$('record-toggle').disabled=false;$('record-status').textContent=`无法开始录音：${error.message}`;}
  }
  function bind() {
    $('play-score').addEventListener('click',playScore);
    $('stop-score').addEventListener('click',stopPlayback);
    $('play-chords').addEventListener('change',()=>{stopPlayback();playerUi();});
    $('score-picker').addEventListener('change',e=>choose(e.target.value));
    $('new-score').addEventListener('click',async()=>{stopPlayback();clearTimeout(saveTimer);if(score)await saveScore(score);score=freshScore();renderAll();await saveScore(score);});
    $('delete-score').addEventListener('click',async()=>{if(!score||!confirm(`删除曲谱“${score.title}”及其录音？`))return;
      const id=score.id;stopPlayback();try{if(account)await request(`/scores/${id}`,'DELETE');else localStorage.setItem(GUEST_KEY,JSON.stringify(guestScores().filter(x=>x.id!==id)));
        summaries=summaries.filter(x=>x.id!==id);score=null;
        if(summaries.length)await choose(summaries[0].id);else{score=freshScore();renderAll();await saveScore(score);}status('曲谱已删除');
      }catch(error){status(error.message);}});
    for(const [id,key,convert] of [['score-title','title',v=>v.trim()||'未命名旋律'],['score-key','key',Number],
      ['score-mode','mode',String],['score-bpm','bpm',v=>Math.max(30,Math.min(300,Math.round(Number(v)||90)))],['score-meter','meter',String]]) {
      $(id).addEventListener('change',e=>{score[key]=convert(e.target.value);renderAll();scheduleSave();});
    }
    $('score-idea').addEventListener('input',e=>{score.idea=e.target.value;scheduleSave();});
    $('record-toggle').addEventListener('click',()=>{if(recording){if(recording.recorder.state==='recording'){
      $('record-toggle').disabled=true;recording.recorder.stop();}}else startRecording();});
    $('add-note').addEventListener('click',()=>{if(score.notes.length>=1500){status('当前曲谱最多 1500 个音符');return;}
      const segment=score.segments.at(-1),start=Math.ceil(Math.max(0,...score.notes.map(n=>n.startBeat+n.durationBeats)));
      score.notes.push({id:uuid(),segmentId:segment.id,midi:60+score.key,startBeat:start,durationBeats:1});renderAll();scheduleSave();});
    $('suggest-chords').addEventListener('click',()=>{if(!score.notes.length){status('请先录音或添加音符');return;}
      score.chords=C.suggestChords(score);renderChords();renderPreview();scheduleSave();});
    $('add-chord').addEventListener('click',()=>{const bar=Math.max(1,Math.round(Number($('chord-bar').value)||1));
      score.chords=score.chords.filter(x=>x.bar!==bar);score.chords.push({bar,root:Number($('chord-root').value),quality:$('chord-quality').value});
      renderChords();renderPreview();scheduleSave();});
    for(const id of ['reference-root','reference-quality','reference-key','reference-mode'])$(id).addEventListener('change',renderReference);
    $('export-text').addEventListener('click',()=>download(C.scoreText(score),'text/plain;charset=utf-8',`${safeName(score.title)}.txt`));
    $('export-svg').addEventListener('click',()=>download(C.scoreSvg(score),'image/svg+xml;charset=utf-8',`${safeName(score.title)}.svg`));
    $('import-guest').addEventListener('click',async()=>{if(!account)return;const rows=guestScores();let added=0;
      for(const item of rows){if(summaries.some(x=>x.id===item.id))item.id=uuid();await saveScore(item);added++;}
      localStorage.removeItem(GUEST_KEY);$('import-guest').hidden=true;status(`已导入 ${added} 份本机曲谱；本机录音文件无法补传`);});
    window.addEventListener('pagehide',()=>{stopPlayback();if(recording)recording.recorder.stop();});
  }
  async function initialize() {
    setupReference();bind();
    try {const response=await fetch(`${API}/api/auth/me`,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(8000)});
      const data=await response.json();if(response.ok&&data.ok)account=data.account;
    }catch{}
    $('account-status').textContent=account?`已登录 ${account.email} · 曲谱与录音同步到账号`:'未登录 · 曲谱保存在此浏览器';
    $('login-link').hidden=!!account;
    if(account){try{summaries=(await request('/scores')).scores;
        $('import-guest').hidden=!guestScores().length;
        if(summaries.length)score=(await request(`/scores/${summaries[0].id}`)).score;
      }catch(error){status(error.message);}}
    else {const rows=guestScores();summaries=rows.map(summaryOf);score=rows[0];}
    if(!score){score=freshScore();await saveScore(score);}
    renderAll();
  }
  initialize();
})();
