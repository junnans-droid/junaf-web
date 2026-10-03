(() => {
  'use strict';
  const BASE = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:3100/api' : 'https://api.junaf.com/api';
  const $ = id => document.getElementById(id);
  let project = null, currentJob = null, selected = null, dirty = false, busy = false, jobs = [];
  const muted = new Set();
  let audioContext = null, stopPlayback = null, playingTrackId = null;
  const programs = [[0, '钢琴'], [4, '电钢琴'], [24, '吉他'], [32, '贝斯'], [48, '弦乐'], [80, '合成器']];
  const el = (tag, text) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element; };
  const status = message => { $('am-status').textContent = message; };
  const editStatus = message => { $('am-edit-status').textContent = message; };
  const markDirty = () => { dirty = true; editStatus('有未保存的修改。可以先试听，再保存或导出 MIDI。'); };
  async function api(path, options = {}) {
    const response = await fetch(BASE + path, {credentials: 'include', cache: 'no-store', ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = Error(data.message || `请求失败 (${response.status})`); error.status = response.status; throw error; }
    return data;
  }
  const safeName = name => (name || 'junaf-audio-midi').replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fff-]+/g, '-').slice(0, 50);
  const seconds = value => `${Number(value || 0).toFixed(1)}s`;
  const clockTime = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  function showPlayback(position, duration, label) {
    $('am-playback-label').textContent = label;
    $('am-playback-progress').max = Math.max(duration, .01);
    $('am-playback-progress').value = Math.min(position, duration);
    $('am-playback-time').textContent = `${clockTime(position)} / ${clockTime(duration)}`;
  }
  async function refresh() {
    try {
      const data = await api('/tools/audio-midi/jobs');
      jobs = data.jobs || [];
      $('am-login').hidden = true; $('am-workspace').hidden = false;
      renderJobs();
      if (!busy) status(data.workerOnline ? '分析服务器已就绪。每位用户每天可分析 2 次，管理员每天 20 次。' : '分析服务器当前未开机。任务可以先上传，开机后会继续处理。');
    } catch (error) {
      if (error.status === 401) { $('am-login').hidden = false; $('am-workspace').hidden = true; }
      else status(error.message === 'Failed to fetch' ? '连接工作台失败，请检查网络后重试。' : error.message);
    }
  }
  function renderJobs() {
    const list = $('am-jobs'); list.replaceChildren();
    if (!jobs.length) { list.append(el('p', '还没有音频任务。从一段短声音开始。')); return; }
    for (const job of jobs) {
      const article = el('article');
      article.append(el('h3', job.name), el('small', {queued: '等待分析', running: '正在分析', completed: '可以编辑', failed: '分析失败'}[job.status] || job.status));
      article.append(el('time', new Date(job.createdAt).toLocaleString('zh-CN')));
      if (job.error) article.append(el('small', job.error));
      if (job.status === 'completed') {
        article.append(el('small', `${seconds(job.duration)} · ${job.noteCount} 个音符`));
        const button = el('button', '打开多轨编辑 ↗'); button.type = 'button';
        button.addEventListener('click', () => openJob(job.id)); article.append(button);
      }
      if (job.status !== 'running') {
        const remove = el('button', '删除任务'); remove.type = 'button';
        remove.addEventListener('click', async () => {
          if (!confirm(`删除「${job.name}」和保存的 MIDI 草稿？`)) return;
          try {
            await api(`/tools/audio-midi/jobs/${job.id}`, {method: 'DELETE'});
            if (currentJob?.id === job.id) { stopPlayback?.(); currentJob = null; project = null; dirty = false; $('am-editor').hidden = true; }
            await refresh();
          } catch (error) { status(error.message); }
        });
        article.append(remove);
      }
      list.append(article);
    }
  }
  $('am-upload').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const file = $('am-file').files[0]; if (!file) return;
    if (file.size > 12 * 1024 * 1024) { status('音频不能超过 12 MB。'); return; }
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['wav', 'mp3', 'm4a', 'flac', 'ogg'].includes(extension)) { status('请选择 WAV、MP3、M4A、FLAC 或 OGG。'); return; }
    busy = true; $('am-submit').disabled = true; status('正在上传音频……');
    try {
      const data = await api(`/tools/audio-midi/jobs?name=${encodeURIComponent(file.name)}`, {method: 'POST',
        headers: {'Content-Type': 'application/octet-stream'}, body: file});
      $('am-file').value = ''; status('上传完成。模型正在拆分声部并提取音符，完成后自动显示。');
      await refresh();
      if (data.job?.id) setTimeout(refresh, 3000);
    } catch (error) { status(error.message === 'Failed to fetch' ? '上传连接中断，请重试。' : error.message); }
    finally { busy = false; $('am-submit').disabled = false; }
  });
  async function openJob(id) {
    if (dirty && !confirm('当前修改尚未保存，确定切换任务吗？')) return;
    try {
      const data = await api(`/tools/audio-midi/jobs/${id}`);
      if (!data.job.project) throw Error('识别结果尚未准备好');
      stopPlayback?.();
      currentJob = data.job; project = structuredClone(data.job.project); selected = null; dirty = false; muted.clear();
      $('am-title').textContent = data.job.name.replace(/\.[^.]+$/, '');
      $('am-tempo').value = project.tempo;
      $('am-source').src = `${BASE}/tools/audio-midi/jobs/${id}/audio`;
      $('am-editor').hidden = false; $('am-note-panel').hidden = true;
      showPlayback(0, 0, 'MIDI 试听');
      renderTracks(); editStatus('识别结果是可编辑的草稿，请用原音频核对。');
      $('am-editor').scrollIntoView({behavior: 'smooth'});
    } catch (error) { status(error.message); }
  }
  const rangeFor = track => {
    const pitches = track.notes.map(note => note.pitch);
    const low = pitches.length ? Math.min(...pitches) : (track.isDrum ? 36 : 48);
    const high = pitches.length ? Math.max(...pitches) : (track.isDrum ? 48 : 72);
    const min = Math.max(0, Math.floor((low - 3) / 12) * 12);
    const max = Math.min(127, Math.ceil((high + 3) / 12) * 12);
    return [min, Math.max(min + 12, max)];
  };
  function renderTracks() {
    const list = $('am-tracks'); list.replaceChildren();
    if (!project) return;
    for (const track of project.tracks) {
      const card = el('article'); card.className = 'am-track';
      const controls = el('div'); controls.className = 'am-track-controls';
      const name = el('input'); name.value = track.name; name.maxLength = 40; name.setAttribute('aria-label', '音轨名称');
      name.addEventListener('change', () => { track.name = name.value.trim() || track.name; markDirty(); });
      const program = el('select'); program.setAttribute('aria-label', 'MIDI 乐器');
      for (const [number, label] of programs) { const option = el('option', label); option.value = number; program.append(option); }
      if (track.isDrum) { const option = el('option', '鼓组'); option.value = 0; program.replaceChildren(option); program.disabled = true; }
      else if (!programs.some(([number]) => number === track.program)) { const option = el('option', `乐器 ${track.program}`); option.value = track.program; program.append(option); }
      program.value = track.program; program.addEventListener('change', () => { track.program = Number(program.value); markDirty(); });
      const mute = el('button', muted.has(track.id) ? '取消静音' : '静音'); mute.type = 'button';
      mute.addEventListener('click', () => { muted.has(track.id) ? muted.delete(track.id) : muted.add(track.id); renderTracks(); });
      const audition = el('button', playingTrackId === track.id ? '停止试听' : '试听此轨'); audition.type = 'button';
      audition.disabled = track.notes.length === 0;
      audition.setAttribute('aria-label', `${playingTrackId === track.id ? '停止试听' : '单独试听'}${track.name}的 MIDI 音符`);
      audition.addEventListener('click', () => { if (playingTrackId === track.id) stopPlayback?.(); else playTracks(track.id); });
      const count = el('small', `${track.notes.length} 个音符`);
      const remove = el('button', '删除轨道'); remove.type = 'button'; remove.disabled = project.tracks.length <= 1;
      remove.addEventListener('click', () => { if (project.tracks.length > 1 && confirm(`删除「${track.name}」整条音轨？`)) { if (playingTrackId === track.id) stopPlayback?.(); project.tracks = project.tracks.filter(item => item !== track); selected = null; $('am-note-panel').hidden = true; markDirty(); renderTracks(); } });
      controls.append(name, program, audition, mute, count, remove); card.append(controls);
      const wrap = el('div'); wrap.className = 'am-roll-wrap';
      const roll = el('div'); roll.className = 'am-roll';
      const [minPitch, maxPitch] = rangeFor(track);
      roll.style.height = `${(maxPitch - minPitch + 1) * 18}px`;
      roll.style.width = `${Math.max(780, Math.ceil((currentJob.duration || 15) * 60))}px`;
      roll.title = '双击空白处添加音符';
      roll.addEventListener('dblclick', event => {
        if (event.target !== roll) return;
        const rect = roll.getBoundingClientRect();
        const start = Math.max(0, Math.round((event.clientX - rect.left) / 60 * 100) / 100);
        const pitch = Math.max(0, Math.min(127, maxPitch - Math.floor((event.clientY - rect.top) / 18)));
        track.notes.push({pitch, start, duration: .5, velocity: 90});
        selected = {trackId: track.id, index: track.notes.length - 1}; markDirty(); renderTracks(); showNote();
      });
      track.notes.forEach((note, index) => {
        const button = el('button'); button.type = 'button'; button.className = 'am-note';
        button.style.left = `${note.start * 60}px`;
        button.style.top = `${(maxPitch - note.pitch) * 18 + 2}px`;
        button.style.width = `${Math.max(5, note.duration * 60)}px`;
        button.title = `${JunafMidi.noteName(note.pitch)} · ${seconds(note.start)} · ${seconds(note.duration)}`;
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-pressed', String(selected?.trackId === track.id && selected.index === index));
        button.addEventListener('click', () => { selected = {trackId: track.id, index}; renderTracks(); showNote(); });
        roll.append(button);
      });
      wrap.append(roll); card.append(wrap); list.append(card);
    }
  }
  function selectedNote() {
    const track = project?.tracks.find(item => item.id === selected?.trackId);
    return track ? {track, note: track.notes[selected.index]} : null;
  }
  function showNote() {
    const item = selectedNote(); $('am-note-panel').hidden = !item?.note;
    if (!item?.note) return;
    $('am-note-pitch').value = item.note.pitch;
    $('am-note-start').value = item.note.start;
    $('am-note-duration').value = item.note.duration;
    $('am-note-velocity').value = item.note.velocity;
  }
  $('am-update-note').addEventListener('click', () => {
    const item = selectedNote(); if (!item?.note) return;
    const values = {pitch: Number($('am-note-pitch').value), start: Number($('am-note-start').value),
      duration: Number($('am-note-duration').value), velocity: Number($('am-note-velocity').value)};
    if (!Number.isInteger(values.pitch) || values.pitch < 0 || values.pitch > 127 || !Number.isFinite(values.start)
      || values.start < 0 || !Number.isFinite(values.duration) || values.duration < .03
      || !Number.isInteger(values.velocity) || values.velocity < 1 || values.velocity > 127) { editStatus('请检查音符的音高、起点、时长和力度。'); return; }
    Object.assign(item.note, values); markDirty(); renderTracks(); showNote();
  });
  $('am-delete-note').addEventListener('click', () => { const item = selectedNote(); if (!item?.note) return; item.track.notes.splice(selected.index, 1); selected = null; $('am-note-panel').hidden = true; markDirty(); renderTracks(); });
  $('am-add-track').addEventListener('click', () => { if (!project || project.tracks.length >= 12) return editStatus('最多 12 条音轨。'); project.tracks.push({id: `custom_${Date.now()}`, name: '新音轨', program: 0, isDrum: false, notes: []}); markDirty(); renderTracks(); });
  $('am-tempo').addEventListener('change', () => { if (!project) return; const tempo = Number($('am-tempo').value); if (tempo >= 40 && tempo <= 240) { project.tempo = tempo; markDirty(); } else $('am-tempo').value = project.tempo; });
  $('am-save').addEventListener('click', async () => {
    if (!currentJob || !project) return;
    $('am-save').disabled = true; editStatus('正在保存编辑……');
    try { await api(`/tools/audio-midi/jobs/${currentJob.id}`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(project)}); dirty = false; editStatus('已保存到 JUNAF 账号。'); await refresh(); }
    catch (error) { editStatus(error.message); }
    finally { $('am-save').disabled = false; }
  });
  $('am-export').addEventListener('click', () => {
    if (!project) return;
    const bytes = JunafMidi.writeMidi(project);
    const url = URL.createObjectURL(new Blob([bytes], {type: 'audio/midi'}));
    const link = el('a'); link.href = url; link.download = `${safeName(currentJob.name)}.mid`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    editStatus('MIDI 已下载。可导入支持标准 MIDI 的音乐软件继续编辑。');
  });
  async function playTracks(trackId = null) {
    if (!project) return;
    stopPlayback?.();
    const tracks = trackId === null ? project.tracks.filter(track => !muted.has(track.id)) : project.tracks.filter(track => track.id === trackId);
    if (!tracks.some(track => track.notes.length)) { editStatus('这条音轨还没有音符，可以双击时间线添加。'); return; }
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
    } catch { editStatus('浏览器无法启动声音，请检查音频播放权限。'); return; }
    const master = audioContext.createGain(); master.gain.value = .12; master.connect(audioContext.destination);
    const base = audioContext.currentTime + .1;
    const oscillators = [];
    let lastEnd = 0;
    for (const track of tracks) {
      for (const note of track.notes.slice(0, 2000)) {
        const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
        oscillator.type = track.isDrum ? 'square' : track.program >= 80 ? 'sawtooth' : 'sine';
        oscillator.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
        const start = base + note.start, end = start + (track.isDrum ? Math.min(.12, note.duration) : note.duration);
        lastEnd = Math.max(lastEnd, note.start + note.duration);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(Math.min(.5, note.velocity / 254), start + .01);
        gain.gain.setValueAtTime(Math.min(.5, note.velocity / 254), Math.max(start + .01, end - .04));
        gain.gain.linearRampToValueAtTime(0, end);
        oscillator.connect(gain).connect(master); oscillator.start(start); oscillator.stop(end + .02); oscillators.push(oscillator);
      }
    }
    playingTrackId = trackId;
    $('am-play').textContent = trackId === null ? '停止播放' : '播放全部 MIDI';
    renderTracks();
    const label = trackId === null ? '全部音轨' : tracks[0].name;
    showPlayback(0, lastEnd, label);
    editStatus(trackId === null ? '正在播放未静音的 MIDI 音轨。' : `正在单独试听「${label}」的 MIDI 音符。`);
    const progressTimer = setInterval(() => showPlayback(Math.max(0, audioContext.currentTime - base), lastEnd, label), 100);
    const timer = setTimeout(() => { stopPlayback?.(true); }, (lastEnd + 1) * 1000);
    stopPlayback = (completed = false) => {
      const position = completed ? lastEnd : Math.min(lastEnd, Math.max(0, audioContext.currentTime - base));
      clearTimeout(timer); clearInterval(progressTimer);
      for (const oscillator of oscillators) { try { oscillator.stop(); } catch {} }
      master.disconnect(); stopPlayback = null; playingTrackId = null;
      showPlayback(position, lastEnd, label); $('am-play').textContent = '播放 MIDI'; renderTracks();
      editStatus(completed ? '试听完成。' : '已停止试听。');
    };
  }
  $('am-play').addEventListener('click', () => { if (stopPlayback && playingTrackId === null) stopPlayback(); else playTracks(); });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  refresh(); setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 7000);
})();
