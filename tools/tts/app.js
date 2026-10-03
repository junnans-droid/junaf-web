(() => {
  const $ = id => document.getElementById(id);
  const input = $('tts-text'), count = $('tts-count'), voice = $('tts-voice'), speed = $('tts-speed');
  const button = $('tts-generate'), status = $('tts-status'), result = $('tts-result');
  let audioUrl = '';
  input.addEventListener('input', () => { count.value = `${[...input.value].length} / 300`; });
  speed.addEventListener('input', () => { $('tts-speed-value').value = `${Number(speed.value).toFixed(1)}×`; });
  button.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) { status.textContent = '请先输入要朗读的文字。'; input.focus(); return; }
    if ([...text].length > 300) { status.textContent = '单次最多 300 字，请缩短文字。'; return; }
    button.disabled = true; status.textContent = '正在生成声音，稍等片刻……';
    try {
      const response = await fetch('https://api.junaf.com/api/tools/tts/synthesize', {
        method: 'POST', credentials: 'include', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({text, voice: voice.value, speed: Number(speed.value)})
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `生成失败（${response.status}）`);
      }
      const blob = await response.blob();
      if (blob.size < 44) throw new Error('没有收到有效音频，请重试');
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(blob);
      $('tts-audio').src = audioUrl;
      $('tts-download').href = audioUrl;
      result.hidden = false;
      status.textContent = '音频已生成，可以试听或下载。';
    } catch (error) {
      status.textContent = error.message === 'Failed to fetch' ? '连接语音服务失败，请检查网络后重试。' : error.message;
    } finally { button.disabled = false; }
  });
  window.addEventListener('pagehide', () => { if (audioUrl) URL.revokeObjectURL(audioUrl); });
})();
