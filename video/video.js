(() => {
  'use strict';
  const origin = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://127.0.0.1:3100' : 'https://api.junaf.com';
  const $ = selector => document.querySelector(selector);
  const list = $('#video-works');
  const node = (tag, text = '', className = '') => {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
  };
  const time = value => Number.isFinite(value)
    ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00';
  let all = [];
  let activeVideo = null;

  function player(item) {
    const frame = node('div', '', 'video-player');
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;
    video.controls = false;
    video.controlsList = 'nodownload noremoteplayback';
    video.disablePictureInPicture = true;
    video.src = origin + item.videoUrl;
    video.setAttribute('aria-label', item.title);

    const controls = node('div', '', 'video-player-controls');
    const play = node('button', '▶');
    play.type = 'button';
    play.setAttribute('aria-label', `播放 ${item.title}`);
    const elapsed = node('span', '0:00');
    const seek = document.createElement('input');
    seek.type = 'range';
    seek.min = '0';
    seek.max = '1000';
    seek.value = '0';
    seek.disabled = true;
    seek.setAttribute('aria-label', `${item.title} 播放进度`);
    const duration = node('span', '0:00');
    const update = () => {
      play.textContent = video.paused ? '▶' : 'Ⅱ';
      play.setAttribute('aria-label', `${video.paused ? '播放' : '暂停'} ${item.title}`);
      elapsed.textContent = time(video.currentTime || 0);
      duration.textContent = time(video.duration);
      seek.disabled = !Number.isFinite(video.duration) || video.duration <= 0;
      seek.value = seek.disabled ? '0' : String(Math.round((video.currentTime || 0) / video.duration * 1000));
    };
    play.addEventListener('click', () => {
      if (!video.paused) {video.pause(); return;}
      if (activeVideo && activeVideo !== video) activeVideo.pause();
      activeVideo = video;
      video.play().catch(() => {$('#video-status').textContent = '视频播放失败，请重试';});
    });
    video.addEventListener('click', () => play.click());
    seek.addEventListener('input', () => {
      if (Number.isFinite(video.duration) && video.duration > 0)
        video.currentTime = Number(seek.value) / 1000 * video.duration;
    });
    for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended'])
      video.addEventListener(event, update);
    controls.append(play, elapsed, seek, duration);
    frame.append(video, controls);
    return frame;
  }

  function render() {
    const q = $('#video-search').value.trim().toLocaleLowerCase();
    const category = $('#video-category').value;
    const rows = all.filter(item => (!category || item.category === category) &&
      (!q || [item.title, item.artistName, item.category].some(value => String(value || '').toLocaleLowerCase().includes(q))));
    if (activeVideo) {activeVideo.pause(); activeVideo = null;}
    list.replaceChildren();
    if (!rows.length) {
      list.append(node('p', all.length ? '没有符合条件的影像。' : '首批影像作品正在准备中。', 'video-empty'));
      return;
    }
    for (const item of rows) {
      const card = node('article', '', 'video-card');
      card.append(player(item), node('small', `${item.category} / ${item.creatorRole === 'admin' ? 'JUNAF 官方' : item.artistLevel || '艺术家'}`),
        node('h3', item.title), node('p', `${item.artistName}${item.description ? ' · ' + item.description : ''}`));
      list.append(card);
    }
  }

  $('#video-search').addEventListener('input', render);
  $('#video-category').addEventListener('change', render);
  fetch(origin + '/api/video/works', {signal: AbortSignal.timeout(12000)})
    .then(async response => {
      const data = await response.json();
      if (!response.ok || !data.ok) throw Error(data.message || '视频目录暂不可用');
      all = data.works || [];
      for (const category of [...new Set(all.map(item => item.category).filter(Boolean))].sort()) {
        const option = node('option', category);
        option.value = category;
        $('#video-category').append(option);
      }
      $('#video-status').textContent = `${all.length} 部已发布作品`;
      render();
    })
    .catch(error => {$('#video-status').textContent = error.message; render();});
})();
