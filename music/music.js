(() => {
  'use strict';
  const apiOrigin = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://127.0.0.1:3100' : 'https://api.junaf.com';
  const packsNode = document.querySelector('#music-packs');
  const statusNode = document.querySelector('#library-status');
  const player = document.querySelector('#preview-player');
  const titleNode = document.querySelector('#player-title');
  let activeUrl = null;
  let requestId = 0;

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function stop() {
    requestId += 1;
    player.pause();
    player.removeAttribute('src');
    player.load();
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    activeUrl = null;
    titleNode.textContent = '选择一个阶段开始试听';
  }
  async function play(pack, track) {
    stop();
    const current = requestId;
    titleNode.textContent = `正在加载 · ${pack.name} / 阶段 ${track.stage}`;
    try {
      const response = await fetch(`${apiOrigin}${track.previewUrl}`, {signal: AbortSignal.timeout(25000)});
      if (!response.ok) throw new Error('试听暂不可用');
      const blob = await response.blob();
      if (current !== requestId) return;
      activeUrl = URL.createObjectURL(blob);
      player.src = activeUrl;
      titleNode.textContent = `${pack.name} / 阶段 ${track.stage} · ${track.title}`;
      await player.play();
    } catch (error) {
      if (current === requestId) titleNode.textContent = error.message || '试听暂不可用';
    }
  }
  function render(packs) {
    packsNode.replaceChildren();
    if (!packs.length) {
      packsNode.append(el('p', '声音方案正在准备中。发布后将在这里出现。', 'music-empty'));
      return;
    }
    packs.forEach((pack, index) => {
      const card = el('article', '', 'music-pack');
      card.append(el('span', String(index + 1).padStart(2, '0'), 'music-pack-number'));
      const summary = el('div');
      summary.append(el('span', `${pack.industry || 'JUNAF'} / VERSION ${pack.version}`, 'pack-meta'));
      summary.append(el('h3', pack.name));
      if (pack.notes) summary.append(el('p', pack.notes));
      card.append(summary);
      const stages = el('div', '', 'music-stages');
      pack.tracks.forEach(track => {
        const button = el('button', '', 'music-stage');
        button.type = 'button';
        button.setAttribute('aria-label', `试听${pack.name}，阶段${track.stage}，${track.title}`);
        button.append(el('span', String(track.stage).padStart(2, '0')));
        button.append(el('strong', track.title));
        button.append(el('span', '试听 ↗'));
        button.addEventListener('click', () => play(pack, track));
        stages.append(button);
      });
      card.append(stages);
      packsNode.append(card);
    });
  }
  document.querySelector('#stop-preview').addEventListener('click', stop);
  window.addEventListener('pagehide', stop);
  fetch(`${apiOrigin}/api/music/catalog`, {signal: AbortSignal.timeout(10000)})
    .then(async response => {
      if (!response.ok) throw new Error('JUNAF 曲库暂未连接');
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.packs)) throw new Error('曲库数据暂不可用');
      render(data.packs);
      statusNode.textContent = `${data.packs.length} 个已发布声音方案`;
    })
    .catch(error => {
      statusNode.textContent = error.message || 'JUNAF 曲库暂未连接';
      render([]);
    });
})();
