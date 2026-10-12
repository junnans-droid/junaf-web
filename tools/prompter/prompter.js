const $ = selector => document.querySelector(selector);
const KEY = 'junaf.prompter.v1';
const PREVIOUS_KEY = 'junaf.prompter.previous.v1';
const sample = 'P1\n欢迎使用 JUNAF 提词器。\n点「编辑稿件」粘贴你的内容。\nP2\n按播放键开始自动滚动。\n使用左右箭头或左右滑动翻页。';
const defaults = { text: sample, page: 0, offset: 0, speed: 32, fontSize: 44, prefix: 'P', breakToken: '↵', countdown: 3, keepAwake: true, mirrorX: false, columnWidth: 1100, midiMappings: {}, midiDeviceName: '' };
let state = { ...defaults };
try { state = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* Keep the default draft if saved data is invalid. */ }
state.speed = Math.min(100, Math.max(8, Number(state.speed) || 32));
state.fontSize = Math.min(96, Math.max(28, Number(state.fontSize) || 44));
state.page = Math.max(0, Number(state.page) || 0);
state.offset = Math.max(0, Number(state.offset) || 0);
state.midiMappings = state.midiMappings && typeof state.midiMappings === 'object' ? state.midiMappings : {};

const reading = $('#reading');
const script = $('#script');
const editor = $('#editor');
const settings = $('#settings-dialog');
const midiDialog = $('#midi-dialog');
let pages = [];
let playing = false;
let countdownTimer = null;
let animation = null;
let lastFrame = 0;
let preciseOffset = 0;
let shortElapsed = 0;
let endHold = 0;
let wakeLock = null;
let saveTimer = null;
let toastTimer = null;
let midiAccess = null;
let midiLearnAction = null;
const midiActions = [
  ['play', '播放'], ['pause', '暂停'], ['prev', '上一页'], ['next', '下一页'],
  ['speedUp', '速度＋'], ['speedDown', '速度－'], ['speedSet', '旋钮直接调速（CC）']
];
const midiLast = new Map();

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function saveNow() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { showToast('浏览器本地存储不可用，请导出 TXT 备份稿件'); }
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 350); }

function parsePages(text) {
  const chunks = [];
  let current = [];
  const prefix = String(state.prefix || '').trim();
  for (const line of String(text).split(/\r\n|\n|\r/)) {
    const marker = line.trim();
    const suffix = prefix && marker.toLowerCase().startsWith(prefix.toLowerCase()) ? marker.slice(prefix.length) : '';
    const numbered = Boolean(prefix && /^\d+$/u.test(suffix));
    if (marker === '---' || numbered) {
      if (current.length) chunks.push(current.join('\n').trim());
      current = [];
    } else current.push(line);
  }
  if (current.length) chunks.push(current.join('\n').trim());
  const token = String(state.breakToken || '').trim();
  return (chunks.length ? chunks : ['']).map(chunk => token ? chunk.split(token).join('\n') : chunk);
}

function render(restore = false) {
  const desiredOffset = restore ? state.offset : 0;
  pages = parsePages(state.text);
  state.page = Math.min(state.page, pages.length - 1);
  script.textContent = pages[state.page];
  script.style.fontSize = `${state.fontSize}px`;
  script.style.maxWidth = `${state.columnWidth}px`;
  script.classList.toggle('mirrored', !!state.mirrorX);
  $('#page-counter').textContent = `${String(state.page + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}`;
  $('#prev').disabled = state.page === 0;
  $('#next').disabled = state.page === pages.length - 1;
  $('#speed').value = state.speed;
  $('#font-size').value = state.fontSize;
  $('#speed-value').textContent = String(state.speed);
  $('#font-value').textContent = String(state.fontSize);
  requestAnimationFrame(() => {
    reading.scrollTop = Math.min(desiredOffset, Math.max(0, reading.scrollHeight - reading.clientHeight));
    preciseOffset = reading.scrollTop;
  });
}

function updatePlaybackUI() {
  $('#play').textContent = '▶';
  $('#play').disabled = !!(playing || countdownTimer);
  $('#pause').disabled = !(playing || countdownTimer);
  $('#status').textContent = countdownTimer ? '准备开始' : playing ? '播放中' : '已暂停';
}
async function acquireWakeLock() {
  if (!state.keepAwake || !('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* Browser may deny wake lock. */ }
}
function stopPlayback() {
  playing = false;
  clearInterval(countdownTimer);
  countdownTimer = null;
  $('#countdown').hidden = true;
  cancelAnimationFrame(animation);
  animation = null;
  lastFrame = 0;
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  state.offset = reading.scrollTop;
  scheduleSave();
  updatePlaybackUI();
}
function finishPage() {
  if (state.page < pages.length - 1) changePage(1);
  else stopPlayback();
}
function tick(timestamp) {
  if (!playing) return;
  if (!lastFrame) { lastFrame = timestamp; animation = requestAnimationFrame(tick); return; }
  const delta = Math.min(.1, Math.max(0, (timestamp - lastFrame) / 1000));
  lastFrame = timestamp;
  const limit = Math.max(0, reading.scrollHeight - reading.clientHeight);
  if (limit <= 4) {
    shortElapsed += delta;
    if (shortElapsed >= Math.max(4, Array.from(pages[state.page]).length / 4)) { finishPage(); return; }
  } else {
    if (Math.abs(reading.scrollTop - preciseOffset) > 2) preciseOffset = reading.scrollTop;
    preciseOffset = Math.min(limit, preciseOffset + state.speed * delta);
    reading.scrollTop = preciseOffset;
    if (Math.abs(state.offset - preciseOffset) >= 1) { state.offset = preciseOffset; scheduleSave(); }
    if (preciseOffset >= limit - .5) {
      endHold += delta;
      if (endHold >= 1.3) { finishPage(); return; }
    } else endHold = 0;
  }
  animation = requestAnimationFrame(tick);
}
function beginPlayback() {
  playing = true;
  shortElapsed = 0;
  endHold = 0;
  lastFrame = 0;
  preciseOffset = reading.scrollTop;
  acquireWakeLock();
  updatePlaybackUI();
  animation = requestAnimationFrame(tick);
}
function togglePlayback() {
  if (playing || countdownTimer) { stopPlayback(); return; }
  const seconds = Math.max(0, Number(state.countdown) || 0);
  if (!seconds) { beginPlayback(); return; }
  let remaining = seconds;
  $('#countdown').textContent = String(remaining);
  $('#countdown').hidden = false;
  countdownTimer = setInterval(() => {
    remaining--;
    if (remaining > 0) $('#countdown').textContent = String(remaining);
    else { clearInterval(countdownTimer); countdownTimer = null; $('#countdown').hidden = true; beginPlayback(); }
  }, 1000);
  updatePlaybackUI();
}
function startPlayback() { if (!playing && !countdownTimer) togglePlayback(); }
function adjustSpeed(delta) { setSpeed(state.speed + delta); }
function setSpeed(value) {
  state.speed = Math.min(100, Math.max(8, Math.round(value)));
  $('#speed').value = state.speed;
  $('#speed-value').textContent = String(state.speed);
  scheduleSave();
}
function changePage(direction) {
  const next = Math.min(Math.max(state.page + direction, 0), pages.length - 1);
  if (next === state.page) return;
  state.page = next;
  state.offset = 0;
  preciseOffset = 0;
  shortElapsed = 0;
  endHold = 0;
  lastFrame = 0;
  render();
  saveNow();
}

$('#play').addEventListener('click', startPlayback);
$('#pause').addEventListener('click', stopPlayback);
$('#prev').addEventListener('click', () => changePage(-1));
$('#next').addEventListener('click', () => changePage(1));
$('#speed').addEventListener('input', event => setSpeed(Number(event.target.value)));
$('#speed-up').addEventListener('click', () => adjustSpeed(1));
$('#speed-down').addEventListener('click', () => adjustSpeed(-1));
$('#font-size').addEventListener('input', event => {
  state.fontSize = Number(event.target.value);
  $('#font-value').textContent = String(state.fontSize);
  script.style.fontSize = `${state.fontSize}px`;
  state.offset = reading.scrollTop;
  scheduleSave();
});
reading.addEventListener('scroll', () => { state.offset = reading.scrollTop; scheduleSave(); }, { passive: true });
reading.addEventListener('click', () => document.body.classList.toggle('controls-hidden'));
let touchX = null, touchY = null;
reading.addEventListener('touchstart', event => { touchX = event.touches[0].clientX; touchY = event.touches[0].clientY; }, { passive: true });
reading.addEventListener('touchend', event => {
  if (touchX === null) return;
  const dx = event.changedTouches[0].clientX - touchX;
  const dy = event.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) changePage(dx < 0 ? 1 : -1);
  touchX = touchY = null;
}, { passive: true });

$('#edit').addEventListener('click', () => { stopPlayback(); $('#script-input').value = state.text; $('#restore').hidden = !localStorage.getItem(PREVIOUS_KEY); editor.showModal(); });
$('#save').addEventListener('click', () => {
  state.text = $('#script-input').value;
  state.page = 0;
  state.offset = 0;
  render();
  saveNow();
  editor.close();
  showToast('稿件已保存在当前浏览器');
});
$('#import').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    if (!confirm('导入会替换当前稿件。要保存旧稿件并继续吗？')) return;
    localStorage.setItem(PREVIOUS_KEY, JSON.stringify({ text: state.text, page: state.page, offset: state.offset }));
    $('#script-input').value = text.replace(/^\uFEFF/, '');
    $('#restore').hidden = false;
    showToast('已导入，请点击「保存并返回」');
  } catch { showToast('导入失败，请选择 UTF-8 编码的 TXT 文件'); }
  finally { event.target.value = ''; }
});
$('#export').addEventListener('click', () => {
  const blob = new Blob([$('#script-input').value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'JUNAF-Prompter.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#restore').addEventListener('click', () => {
  try { $('#script-input').value = JSON.parse(localStorage.getItem(PREVIOUS_KEY)).text; showToast('旧稿件已恢复到编辑区，请点击保存'); }
  catch { showToast('没有可恢复的稿件'); }
});
$('#settings').addEventListener('click', () => {
  $('#countdown-select').value = String(state.countdown);
  $('#prefix').value = state.prefix;
  $('#break-token').value = state.breakToken;
  $('#wake-lock').checked = state.keepAwake;
  $('#mirror-x').checked = !!state.mirrorX;
  $('#column-width').value = String(state.columnWidth);
  settings.showModal();
});
$('#save-settings').addEventListener('click', () => {
  state.countdown = Number($('#countdown-select').value);
  state.prefix = $('#prefix').value.trim();
  state.breakToken = $('#break-token').value.trim();
  state.keepAwake = $('#wake-lock').checked;
  state.mirrorX = $('#mirror-x').checked;
  state.columnWidth = Number($('#column-width').value);
  render(true); saveNow(); settings.close(); showToast('设置已保存');
});
$('#fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { showToast('当前浏览器不支持全屏，请使用浏览器自身的全屏功能'); }
});
document.addEventListener('keydown', event => {
  if (editor.open || settings.open || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
  else if (event.code === 'ArrowLeft') { event.preventDefault(); changePage(-1); }
  else if (event.code === 'ArrowRight') { event.preventDefault(); changePage(1); }
  else if (event.code === 'ArrowUp' || event.key === '+') { event.preventDefault(); adjustSpeed(1); }
  else if (event.code === 'ArrowDown' || event.key === '-' || event.key === '−') { event.preventDefault(); adjustSpeed(-1); }
});
function midiLabel(binding) {
  if (!binding) return '未映射';
  return `${binding.type === 'cc' ? 'CC' : '音符'} ${binding.number} · 通道 ${binding.channel + 1}`;
}
function renderMidiMappings() {
  const list = $('#midi-mappings'); list.replaceChildren();
  for (const [action, title] of midiActions) {
    const row = document.createElement('div'); row.className = 'midi-map-row';
    const name = document.createElement('span'); name.textContent = title;
    const current = document.createElement('small'); current.textContent = midiLabel(state.midiMappings[action]);
    const learn = document.createElement('button'); learn.type = 'button';
    learn.textContent = midiLearnAction === action ? '等待按下…' : '学习';
    learn.disabled = !midiAccess;
    learn.addEventListener('click', () => {
      midiLearnAction = midiLearnAction === action ? null : action;
      $('#midi-status').textContent = midiLearnAction ? `请在所选设备上操作「${title}」的控制键` : '已取消学习';
      renderMidiMappings();
    });
    const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = '清除';
    clear.disabled = !state.midiMappings[action];
    clear.addEventListener('click', () => { delete state.midiMappings[action]; saveNow(); renderMidiMappings(); });
    row.append(name, current, learn, clear); list.append(row);
  }
}
function selectedMidiInput() {
  return midiAccess?.inputs.get($('#midi-input').value) || null;
}
function refreshMidiInputs() {
  const select = $('#midi-input');
  const previous = select.value;
  select.replaceChildren();
  for (const input of midiAccess.inputs.values()) {
    if (input.state !== 'connected') continue;
    const option = document.createElement('option'); option.value = input.id; option.textContent = input.name || '未命名 MIDI 输入';
    select.append(option);
    input.onmidimessage = handleMidiMessage;
  }
  const inputs = [...midiAccess.inputs.values()].filter(input => input.state === 'connected');
  const match = inputs.find(input => input.id === previous) || inputs.find(input => input.name === state.midiDeviceName) || inputs[0];
  if (match) select.value = match.id;
  else { const option = document.createElement('option'); option.value = ''; option.textContent = '未发现输入设备'; select.append(option); }
  $('#midi-status').textContent = match ? `已连接：${match.name || 'MIDI 输入'}` : '已获授权，请插入 MIDI 输入设备';
}
function executeMidiAction(action, value) {
  if (action === 'play') startPlayback();
  else if (action === 'pause') stopPlayback();
  else if (action === 'prev') changePage(-1);
  else if (action === 'next') changePage(1);
  else if (action === 'speedUp') adjustSpeed(1);
  else if (action === 'speedDown') adjustSpeed(-1);
  else if (action === 'speedSet') setSpeed(8 + value / 127 * 92);
}
function handleMidiMessage(event) {
  if (event.currentTarget !== selectedMidiInput()) return;
  const [status, number, value] = event.data || [];
  const kind = status & 0xf0;
  const type = kind === 0x90 && value > 0 ? 'note' : kind === 0xb0 ? 'cc' : null;
  if (!type || !Number.isInteger(number)) return;
  const channel = status & 0x0f;
  if (midiLearnAction) {
    if (type === 'cc' && value === 0) return;
    if (midiLearnAction === 'speedSet' && type !== 'cc') {
      $('#midi-status').textContent = '直接调速需要转动 MIDI CC 旋钮或推子'; return;
    }
    for (const [other, binding] of Object.entries(state.midiMappings)) {
      if (binding?.type === type && binding.number === number && binding.channel === channel) delete state.midiMappings[other];
    }
    const action = midiLearnAction;
    state.midiMappings[action] = {type, number, channel};
    midiLearnAction = null; saveNow(); renderMidiMappings();
    $('#midi-status').textContent = `已将 ${midiLabel(state.midiMappings[action])} 映射到「${midiActions.find(item => item[0] === action)[1]}」`;
    return;
  }
  for (const [action, binding] of Object.entries(state.midiMappings)) {
    if (!binding || binding.type !== type || binding.number !== number || binding.channel !== channel) continue;
    const key = `${type}:${channel}:${number}`;
    if (action === 'speedSet') { executeMidiAction(action, value); return; }
    if (type === 'cc' && value === 0) { midiLast.delete(key); return; }
    const now = performance.now();
    if (now - (midiLast.get(key) || -1000) < 180) return;
    midiLast.set(key, now);
    executeMidiAction(action, value); return;
  }
}
$('#midi-settings').addEventListener('click', () => { renderMidiMappings(); midiDialog.showModal(); });
$('#midi-close').addEventListener('click', () => { midiLearnAction = null; midiDialog.close(); });
midiDialog.addEventListener('close', () => { midiLearnAction = null; });
$('#midi-connect').addEventListener('click', async () => {
  if (!navigator.requestMIDIAccess) { $('#midi-status').textContent = '此浏览器不支持 Web MIDI；可使用 Chrome 或 Edge 的桌面版本。'; return; }
  try {
    midiAccess = await navigator.requestMIDIAccess({sysex: false});
    midiAccess.onstatechange = refreshMidiInputs;
    refreshMidiInputs(); renderMidiMappings();
  } catch { $('#midi-status').textContent = '无法访问 MIDI。请检查浏览器权限和设备连接。'; }
});
$('#midi-input').addEventListener('change', () => {
  state.midiDeviceName = selectedMidiInput()?.name || '';
  midiLearnAction = null; midiLast.clear(); saveNow(); renderMidiMappings();
  $('#midi-status').textContent = `当前输入：${state.midiDeviceName || '无'}`;
});
$('#midi-clear').addEventListener('click', () => {
  if (!confirm('清除全部 MIDI 控制映射？')) return;
  state.midiMappings = {}; midiLearnAction = null; saveNow(); renderMidiMappings();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopPlayback(); saveNow(); } });
window.addEventListener('beforeunload', saveNow);
render(true);
updatePlaybackUI();
renderMidiMappings();
