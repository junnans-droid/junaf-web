(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const input = $('#audio-file'), fileName = $('#audio-file-name'), start = $('#analyze-audio');
  const status = $('#audio-status'), progress = $('#audio-progress'), player = $('#audio-player');
  const canvas = $('#audio-waveform');
  let selectedFile = null, objectUrl = null, worker = null, rejectWorker = null, runId = 0, result = null;
  const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,'0')}`;
  function setStatus(value) { status.textContent = value; }
  function stopWorker(reason) {
    if (worker) {worker.terminate();worker = null;}
    const reject = rejectWorker; rejectWorker = null;
    if (reason && reject) reject(Error(reason));
  }
  function resetOutput() {
    $('#audio-result').hidden = true; result = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null; player.removeAttribute('src');player.load();
  }
  function selectFile(file) {
    runId++;stopWorker('分析已取消');resetOutput();
    selectedFile = null; start.disabled = true; progress.hidden = true;progress.value = 0;
    if (!file) {fileName.textContent = '尚未选择音频';setStatus('选择一段完整音乐，开始分析。');return;}
    const allowed = /\.(mp3|m4a|wav|flac|ogg|aac)$/i.test(file.name) || file.type.startsWith('audio/');
    if (!allowed) {setStatus('请选择常见音频格式，如 MP3、M4A、WAV 或 FLAC。');return;}
    if (file.size > 50 * 1024 * 1024) {setStatus('文件超过 50 MB，请选择较小的音频。');return;}
    selectedFile = file;start.disabled = false;
    fileName.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    setStatus('音频已就绪；点击“分析音频”。文件只在当前浏览器处理。');
  }
  async function downsample(buffer, targetRate, currentRun) {
    const length = Math.ceil(buffer.duration * targetRate), output = new Float32Array(length);
    const channels = Array.from({length:buffer.numberOfChannels},(_,i) => buffer.getChannelData(i));
    const ratio = buffer.sampleRate / targetRate;
    for (let from = 0; from < length; from += 50000) {
      const to = Math.min(length,from + 50000);
      for (let i = from; i < to; i++) {
        const position = Math.min(buffer.length - 1,Math.floor(i * ratio));
        let value = 0;
        for (const channel of channels) value += channel[position];
        output[i] = value / channels.length;
      }
      if (currentRun !== runId) throw Error('分析已取消');
      progress.value = 10 + Math.round(to / length * 14);
      await new Promise(resolve => setTimeout(resolve,0));
    }
    return output;
  }
  function summaryCard(label,value) {
    const card = document.createElement('div'),small=document.createElement('span'),strong=document.createElement('strong');
    small.textContent=label;strong.textContent=value;card.append(small,strong);return card;
  }
  function drawWaveform(analysis) {
    const ratio = window.devicePixelRatio || 1, width = canvas.clientWidth || 900, height = canvas.clientHeight || 120;
    canvas.width = Math.round(width * ratio);canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');context.scale(ratio,ratio);
    context.fillStyle = '#23241f';context.fillRect(0,0,width,height);
    const max = Math.max(...analysis.levels,0.001);
    context.fillStyle = '#aaa99f';
    for (let pixel = 0; pixel < width; pixel++) {
      const from = Math.floor(pixel / width * analysis.levels.length);
      const to = Math.min(analysis.levels.length,Math.ceil((pixel+1) / width * analysis.levels.length));
      let level = 0;
      for (let i = from; i < to; i++) level = Math.max(level,analysis.levels[i] || 0);
      const bar = Math.max(2,level / max * (height - 16));
      context.fillRect(pixel,(height - bar) / 2,1,bar);
    }
    context.fillStyle = '#e45132';
    for (const section of analysis.sections.slice(1)) {
      const x = section.start / analysis.duration * width;
      context.fillRect(x,0,2,height);
    }
  }
  function render(analysis) {
    result = analysis;$('#audio-result').hidden = false;
    $('#audio-summary').replaceChildren(
      summaryCard('时长',formatTime(analysis.duration)),
      summaryCard('速度估计',analysis.tempo ? `${analysis.tempo} BPM` : '无法可靠判断'),
      summaryCard('检测段落',`${analysis.sections.length} 段`));
    const list = $('#audio-sections');list.replaceChildren();
    for (const [index,section] of analysis.sections.entries()) {
      const item=document.createElement('li'),button=document.createElement('button');
      button.type='button';button.className='audio-section';
      const number=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');
      number.textContent=`${String(index+1).padStart(2,'0')} / ${section.label}`;
      name.textContent=section.role;
      detail.textContent=`${formatTime(section.start)} – ${formatTime(section.end)} · 相对能量 ${section.energy}%`;
      button.append(number,name,detail);
      button.addEventListener('click',() => {player.currentTime=section.start;player.play().catch(()=>{});});
      item.append(button);list.append(item);
    }
    $('#audio-method').textContent=analysis.method + ' “主歌／副歌”等功能名称仅供参考，请结合听感修正。';
    requestAnimationFrame(()=>drawWaveform(analysis));
    $('#audio-result').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function runWorker(samples,sampleRate,currentRun) {
    return new Promise((resolve,reject) => {
      stopWorker('分析已取消');worker=new Worker('/tools/music-structure/audio-worker.js');
      rejectWorker = reject;
      worker.onmessage = event => {
        if (currentRun !== runId) return;
        if (event.data.type === 'progress') progress.value = 24 + Math.round(event.data.progress * .76);
        if (event.data.type === 'result') {stopWorker();resolve(event.data.result);}
        if (event.data.type === 'error') {stopWorker();reject(Error(event.data.message));}
      };
      worker.onerror = () => {stopWorker();reject(Error('音频分析程序未能启动'));};
      worker.postMessage({samples:samples.buffer,sampleRate},[samples.buffer]);
    });
  }
  async function analyze() {
    if (!selectedFile) return;
    const file = selectedFile,currentRun = ++runId;
    start.disabled = true;progress.hidden = false;progress.value = 2;
    setStatus('正在解码音频…');resetOutput();
    let context;
    try {
      const bytes = await file.arrayBuffer();
      if (currentRun !== runId) return;
      context = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await context.decodeAudioData(bytes);
      if (decoded.duration < 15 || decoded.duration > 600)
        throw Error('请选择 15 秒至 10 分钟的音频。');
      progress.value = 10;setStatus('正在提取音频特征…');
      const samples = await downsample(decoded,5512,currentRun);
      if (currentRun !== runId) return;
      setStatus('正在寻找段落变化与重复主题…');
      const analysis = await runWorker(samples,5512,currentRun);
      if (currentRun !== runId) return;
      objectUrl = URL.createObjectURL(file);player.src = objectUrl;
      render(analysis);progress.value = 100;setStatus('分析完成。点击段落可跳转试听。');
    } catch (error) {
      if (currentRun === runId) {setStatus(error.message || '无法分析此音频');progress.hidden = true;}
    } finally {
      if (context) context.close().catch(()=>{});
      if (currentRun === runId) start.disabled = false;
    }
  }
  input.addEventListener('change',()=>selectFile(input.files?.[0]));
  start.addEventListener('click',analyze);
  $('#audio-copy').addEventListener('click',async()=>{
    if (!result) return;
    const lines=[`JUNAF 音频结构分析 · ${selectedFile.name}`,
      `时长 ${formatTime(result.duration)}｜速度 ${result.tempo ? result.tempo+' BPM' : '未可靠检测'}`,
      ...result.sections.map((s,i)=>`${i+1}. ${formatTime(s.start)}–${formatTime(s.end)}｜段落 ${s.label}｜${s.role}｜相对能量 ${s.energy}%`),
      '段落功能是算法推测，请以听感校正。'];
    try{await navigator.clipboard.writeText(lines.join('\n'));setStatus('分析结果已复制');}
    catch{setStatus('复制失败，请检查浏览器权限');}
  });
  window.addEventListener('resize',()=>{if(result)drawWaveform(result);});
  window.addEventListener('pagehide',()=>{stopWorker('分析已取消');if(objectUrl)URL.revokeObjectURL(objectUrl);});
})();
