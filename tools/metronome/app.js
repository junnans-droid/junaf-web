(() => {
  'use strict';
  const core = window.JUNAFMetronomeCore;
  const AudioEngine = window.JUNAFMetronomeAudio;
  const $ = selector => document.querySelector(selector);
  const origin = ['localhost','127.0.0.1'].includes(location.hostname)
    ? 'http://127.0.0.1:3100' : 'https://api.junaf.com';
  const GUEST_KEY = 'junaf.metronome.v1.guest';
  let scopeKey = GUEST_KEY, accountEmail = null, sessions = [], currentId = null;
  let playing = false, playStartedAt = 0, ticker = null, pulseTimer = null;
  let syncTimer = null, syncQueue = Promise.resolve(), pendingIds = new Set();
  let tapTimes = [], noteTimer = null, tempoTimer = null;
  const audio = new AudioEngine(onBeat);
  const now = () => new Date().toISOString();
  const current = () => sessions.find(item => item.id === currentId);
  const formatTime = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2,'0')}`;
  const elapsed = () => (current()?.elapsedMs || 0) + (playing ? performance.now() - playStartedAt : 0);
  const status = message => {$('#metro-status').textContent = message;};
  const saveStatus = message => {$('#save-status').textContent = message;};
  function loadLocal(key) {
    try {
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(rows) ? rows.filter(item => item && /^[a-f0-9-]{36}$/.test(item.id)
        && typeof item.title === 'string' && Array.isArray(item.markers)
        && Array.isArray(item.sections)).slice(0,100) : [];
    } catch {return [];}
  }
  function saveLocal() {
    try {
      localStorage.setItem(scopeKey,JSON.stringify(sessions));
      localStorage.setItem(`${scopeKey}.current`,currentId || '');
      if (!accountEmail) saveStatus('已保存在此浏览器 · 登录后可存入自己的账号');
    } catch {saveStatus('本机存储空间不足，请导出当前记录');}
  }
  function draft() {
    return {id:crypto.randomUUID(),title:`节拍记录 ${new Date().toLocaleString('zh-CN')}`,
      bpm:120,meter:'4/4',sound:'wood',style:'straight',beats:0,elapsedMs:0,
      markers:[],sections:[],idea:'',createdAt:now(),updatedAt:now()};
  }
  async function cloudRequest(path,method='GET',body) {
    const response = await fetch(`${origin}/api/tools/metronome${path}`,{
      method,credentials:'include',cache:'no-store',
      headers:body ? {'Content-Type':'application/json'} : {},
      body:body ? JSON.stringify(body) : undefined,
      signal:AbortSignal.timeout(12000)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw Error(data.message || '云端暂不可用');
    return data;
  }
  function scheduleCloud(id) {
    if (!accountEmail) return;
    pendingIds.add(id);
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
      syncTimer = null;
      const ids = [...pendingIds];pendingIds.clear();
      const snapshots = ids.map(value => sessions.find(item => item.id === value)).filter(Boolean)
        .map(item => JSON.parse(JSON.stringify(item)));
      syncQueue = syncQueue.catch(() => {}).then(async () => {
        for (const item of snapshots) await cloudRequest(`/sessions/${encodeURIComponent(item.id)}`,'PUT',item);
        if (snapshots.length) saveStatus('已同步到 JUNAF 账号');
      }).catch(error => saveStatus(`本机已保存；云端同步失败：${error.message}`));
    },900);
  }
  function commit(session,cloud=true) {
    if (!session) return;
    session.updatedAt=now();saveLocal();
    if (cloud) scheduleCloud(session.id);
  }
  function addSession() {
    if (sessions.length >= 100) {status('最多保留 100 份记录，请先导出并删除旧记录');return;}
    stop();
    const item = draft();sessions.unshift(item);currentId=item.id;
    commit(item);renderSession();status('新记录已创建');
  }
  function renderPicker() {
    const picker=$('#session-picker');picker.replaceChildren();
    for (const item of sessions) {
      const option=document.createElement('option');option.value=item.id;option.textContent=item.title;
      picker.append(option);
    }
    picker.value=currentId;
  }
  function renderLights() {
    const session=current();if (!session) return;
    const count=core.meterCount(session.meter),pos=core.position(session.beats,session.meter);
    const lights=$('#beat-lights');lights.replaceChildren();
    for (let index=1;index<=count;index++) {
      const light=document.createElement('i');light.classList.toggle('on',index===pos.beat);
      lights.append(light);
    }
    $('#bar-value').textContent=`小节 ${pos.bar}`;
    $('#beat-value').textContent=`拍 ${pos.beat}`;
  }
  function renderStats() {
    const session=current();if (!session) return;
    $('#total-beats').textContent=String(session.beats);
    $('#total-bars').textContent=String(core.position(session.beats,session.meter).bar);
    $('#elapsed-time').textContent=formatTime(elapsed());
  }
  function recordRow(title,detail) {
    const item=document.createElement('li'),strong=document.createElement('strong'),span=document.createElement('span');
    strong.textContent=title;span.textContent=detail;item.append(strong,span);return item;
  }
  function renderRecords() {
    const session=current();if (!session) return;
    $('#beat-records').replaceChildren(...session.markers.slice().reverse().map(item => {
      const position=item.bar !== undefined ? {bar:item.bar,beat:item.beatInBar} :
        core.position(item.beat,session.meter);
      return recordRow(item.note || '拍点标记',`第 ${position.bar} 小节 · 第 ${position.beat} 拍 · ${formatTime(item.elapsedMs)}`);
    }));
    $('#section-records').replaceChildren(...session.sections.slice().reverse().map(item => {
      const position=item.bar !== undefined ? {bar:item.bar,beat:item.beatInBar} :
        core.position(item.beat,session.meter);
      return recordRow(item.name,`第 ${position.bar} 小节 · 第 ${position.beat} 拍 · ${formatTime(item.elapsedMs)}${item.note ? ' · '+item.note : ''}`);
    }));
  }
  function renderSession() {
    const session=current();if (!session) return;
    renderPicker();
    $('#session-title').value=session.title;
    $('#tempo-number').value=String(session.bpm);$('#tempo-range').value=String(session.bpm);
    $('#meter').value=session.meter;$('#sound').value=session.sound;$('#style').value=session.style;
    $('#idea-note').value=session.idea;
    renderLights();renderStats();renderRecords();
  }
  function pulse() {
    const element=$('#pulse');
    element.classList.remove('on');void element.offsetWidth;element.classList.add('on');
    clearTimeout(pulseTimer);pulseTimer=setTimeout(() => element.classList.remove('on'),55);
  }
  function onBeat(number) {
    const session=current();if (!session || !playing) return;
    session.beats=number;
    pulse();renderLights();renderStats();
    const position=core.position(number,session.meter);
    if (position.beat===1) commit(session);
  }
  function audioConfig() {
    const session=current();
    return {bpm:session.bpm,meter:session.meter,sound:session.sound,
      style:session.style,volume:Number($('#volume').value)};
  }
  async function start() {
    const session=current();if (!session || session.bpm===0) {status('将速度设为 1–1000 BPM 后开始');return;}
    try {
      $('#toggle').disabled=true;
      await audio.start(audioConfig(),session.beats);
      playing=true;playStartedAt=performance.now();
      $('#toggle').textContent='暂停播放 ■';
      ticker=setInterval(renderStats,500);
      status(`${session.bpm} BPM · ${core.styles[session.style]} · 正在播放`);
    } catch (error) {status(error.message || '音频无法启动');audio.stop();}
    finally {$('#toggle').disabled=false;}
  }
  function stop(message='已暂停；记录已保存') {
    if (!playing) return;
    const session=current();
    session.elapsedMs=Math.round(elapsed());
    playing=false;audio.stop();
    clearInterval(ticker);ticker=null;clearTimeout(pulseTimer);
    $('#pulse').classList.remove('on');
    $('#toggle').textContent='继续播放 →';
    commit(session);renderStats();status(message);
  }
  function setTempo(value) {
    const session=current();if (!session) return;
    const next=core.tempo(value),wasPlaying=playing;
    if (wasPlaying) stop('正在调整速度…');
    session.bpm=next;
    $('#tempo-number').value=String(next);$('#tempo-range').value=String(next);
    commit(session);
    if (wasPlaying && next>0) start();
    else status(next===0 ? '0 BPM：节拍器已停止' : `速度已设置为 ${next} BPM`);
  }
  function markBeat() {
    const session=current();if (!session) return;
    if (session.markers.length>=200) {status('拍点标记已达到 200 条，请导出并新建记录');return;}
    const position=core.position(session.beats,session.meter);
    session.markers.push({beat:session.beats,elapsedMs:Math.round(elapsed()),note:$('#beat-note').value.trim(),
      bar:position.bar,beatInBar:position.beat,meter:session.meter});
    $('#beat-note').value='';commit(session);renderRecords();status('已记录当前拍点');
  }
  function markSection() {
    const session=current();if (!session) return;
    const name=$('#section-name').value.trim();
    if (!name) {status('请先填写段落名称');$('#section-name').focus();return;}
    if (session.sections.length>=100) {status('段落已达到 100 条，请导出并新建记录');return;}
    const position=core.position(session.beats,session.meter);
    session.sections.push({beat:session.beats,elapsedMs:Math.round(elapsed()),name,
      bar:position.bar,beatInBar:position.beat,meter:session.meter,
      note:$('#section-note').value.trim()});
    $('#section-name').value='';$('#section-note').value='';
    commit(session);renderRecords();status(`已添加段落「${name}」`);
  }
  function exportSession() {
    const session=current();if (!session) return;
    const lines=[`JUNAF 节拍记录 / ${session.title}`,
      `BPM: ${session.bpm} · 拍号: ${session.meter} · 音色: ${core.sounds[session.sound]} · 风格: ${core.styles[session.style]}`,
      `总拍数: ${session.beats} · 累计播放: ${formatTime(elapsed())}`,'','拍点标记',
      ...session.markers.map((item,index)=>`${index+1}. 第 ${item.beat} 拍 / ${formatTime(item.elapsedMs)} · ${item.note || '拍点'}`),
      '','段落记录',...session.sections.map((item,index)=>`${index+1}. ${item.name} · 第 ${item.beat} 拍 / ${formatTime(item.elapsedMs)}${item.note ? ' · '+item.note : ''}`),
      '','灵感记录',session.idea];
    const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`JUNAF-节拍记录-${new Date().toISOString().slice(0,10)}.txt`;
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    status('当前记录已导出');
  }
  async function detectAccount() {
    try {
      const response=await fetch(`${origin}/api/auth/me`,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw Error('not-authenticated');
      const data=await response.json();
      if (!data.ok || !data.account?.email) throw Error('not-authenticated');
      accountEmail=data.account.email.toLowerCase();
      scopeKey=`junaf.metronome.v1.account:${accountEmail}`;
      sessions=loadLocal(scopeKey);
      $('#cloud-status').textContent=`${data.account.email} · JUNAF 账号记录`;
      const guest=loadLocal(GUEST_KEY);
      $('#import-guest').hidden=!guest.length;
      try {
        const remote=await cloudRequest('/sessions');
        const remoteIds=new Set(remote.sessions.map(item=>item.id));
        const local=[...sessions],map=new Map(local.map(item=>[item.id,item]));
        for (const item of remote.sessions) {
          const existing=map.get(item.id);
          if (!existing || Date.parse(item.updatedAt)>Date.parse(existing.updatedAt)) map.set(item.id,item);
        }
        sessions=[...map.values()].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).slice(0,100);
        for (const item of local) if (!remoteIds.has(item.id) ||
          Date.parse(item.updatedAt)>Date.parse(remote.sessions.find(row=>row.id===item.id)?.updatedAt)) scheduleCloud(item.id);
        saveStatus('已连接 JUNAF 云端记录');
      } catch (error) {saveStatus(`云端暂不可用；继续保存在本机：${error.message}`);}
    } catch {
      accountEmail=null;scopeKey=GUEST_KEY;sessions=loadLocal(GUEST_KEY);
      $('#cloud-status').textContent='未登录 · 记录仅保存在此浏览器';
      $('#login-link').hidden=false;
    }
    const last=localStorage.getItem(`${scopeKey}.current`);
    currentId=sessions.some(item=>item.id===last) ? last : sessions[0]?.id || null;
    if (!currentId) {const item=draft();sessions=[item];currentId=item.id;commit(item);}
    saveLocal();renderSession();$('#toggle').disabled=false;
  }
  $('#toggle').disabled=true;
  $('#toggle').addEventListener('click',()=>playing ? stop() : start());
  $('#tempo-number').addEventListener('change',event=>setTempo(event.target.value));
  $('#tempo-range').addEventListener('input',event=>{
    const value=event.target.value;$('#tempo-number').value=value;
    clearTimeout(tempoTimer);tempoTimer=setTimeout(()=>setTempo(value),120);
  });
  $('#tempo-range').addEventListener('change',event=>{
    clearTimeout(tempoTimer);setTempo(event.target.value);
  });
  $('#tempo-minus').addEventListener('click',()=>setTempo((current()?.bpm||0)-1));
  $('#tempo-plus').addEventListener('click',()=>setTempo((current()?.bpm||0)+1));
  $('#meter').addEventListener('change',event=>{const item=current();if (!item)return;item.meter=event.target.value;commit(item);renderLights();renderStats();if(playing)audio.update(audioConfig());});
  $('#sound').addEventListener('change',event=>{const item=current();if (!item)return;item.sound=event.target.value;commit(item);if(playing)audio.update(audioConfig());});
  $('#style').addEventListener('change',event=>{const item=current();if (!item)return;item.style=event.target.value;commit(item);if(playing)audio.update(audioConfig());status(`律动已切换为 ${core.styles[item.style]}`);});
  $('#volume').addEventListener('input',()=>{if(playing)audio.update(audioConfig());});
  $('#tap').addEventListener('click',()=>{
    const time=performance.now(),last=tapTimes.at(-1);
    if (!last || time-last>2000) tapTimes=[];
    tapTimes.push(time);if(tapTimes.length>6)tapTimes.shift();
    if(tapTimes.length<2){status('继续点击，测量速度');return;}
    const gaps=tapTimes.slice(1).map((value,index)=>value-tapTimes[index]).filter(value=>value>=55 && value<=2000).sort((a,b)=>a-b);
    if(!gaps.length)return;
    setTempo(Math.round(60000/gaps[Math.floor(gaps.length/2)]));
  });
  $('#session-picker').addEventListener('change',event=>{stop();currentId=event.target.value;saveLocal();renderSession();status('已切换记录');});
  $('#session-title').addEventListener('change',event=>{const item=current();if(!item)return;item.title=event.target.value.trim().slice(0,80)||item.title;commit(item);renderPicker();});
  $('#new-session').addEventListener('click',addSession);
  $('#delete-session').addEventListener('click',async()=>{
    const item=current();if(!item || !window.confirm(`确定删除「${item.title}」？请先导出需要保留的内容。`))return;
    stop();pendingIds.delete(item.id);
    sessions=sessions.filter(row=>row.id!==item.id);currentId=sessions[0]?.id||null;
    if(!currentId){const next=draft();sessions=[next];currentId=next.id;commit(next);}
    saveLocal();renderSession();status('记录已从本机删除');
    if(accountEmail){
      syncQueue=syncQueue.catch(()=>{}).then(()=>cloudRequest(`/sessions/${encodeURIComponent(item.id)}`,'DELETE'))
        .then(()=>saveStatus('记录已从 JUNAF 账号删除'))
        .catch(error=>saveStatus(`云端删除失败：${error.message}`));
    }
  });
  $('#mark-beat').addEventListener('click',markBeat);
  $('#mark-section').addEventListener('click',markSection);
  $('#beat-note').addEventListener('keydown',event=>{if(event.key==='Enter')markBeat();});
  $('#section-note').addEventListener('keydown',event=>{if(event.key==='Enter')markSection();});
  $('#idea-note').addEventListener('input',event=>{
    const item=current();if(!item)return;
    item.idea=event.target.value.slice(0,10000);
    clearTimeout(noteTimer);noteTimer=setTimeout(()=>{commit(item);saveStatus(accountEmail?'正在同步到 JUNAF 账号…':'已保存在此浏览器');},450);
  });
  $('#export-session').addEventListener('click',exportSession);
  $('#import-guest').addEventListener('click',()=>{
    const guest=loadLocal(GUEST_KEY),existing=new Set(sessions.map(item=>item.id));let count=0;
    for(const item of guest){if(existing.has(item.id)||sessions.length>=100)continue;
      item.updatedAt=now();sessions.push(item);scheduleCloud(item.id);count++;}
    sessions.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
    saveLocal();renderPicker();$('#import-guest').hidden=true;
    status(`已导入 ${count} 份本机记录到当前账号`);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('页面已离开，播放暂停并保存记录');});
  window.addEventListener('pagehide',()=>stop());
  detectAccount();
})();
