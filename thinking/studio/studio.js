(() => {
  'use strict';
  const origin = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://127.0.0.1:3100' : 'https://api.junaf.com';
  const $ = selector => document.querySelector(selector);
  const form = $('#post-form');
  const status = text => { $('#studio-status').textContent = text; };
  let saved = [];
  let editingId = null;

  async function api(path, method = 'GET', body) {
    const response = await fetch(origin + '/api/thinking' + path, {
      method, credentials: 'include', cache: 'no-store',
      headers: body ? {'Content-Type': 'application/json'} : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw Error(data.message || '请求失败');
    return data;
  }

  function resetEditor() {
    editingId = null;
    form.reset();
    $('#editor-heading').textContent = '写一篇思考';
    $('#save-post').textContent = '保存草稿 ↗';
  }

  function editPost(post) {
    editingId = post.id;
    form.elements.title.value = post.title;
    form.elements.category.value = post.category;
    form.elements.body.value = post.body;
    $('#editor-heading').textContent = '编辑思考';
    $('#save-post').textContent = '保存修改 ↗';
    $('#studio-editor').scrollIntoView({behavior: 'smooth'});
    status(post.status === 'published' ? '修改已发布文章后将重新进入审核。' : '正在编辑文章，可以反复保存。');
  }

  function downloadTxt(post) {
    const content = `标题：${post.title}\n主题：${post.category}\n作者：${post.authorName || ''}\n\n${post.body}\n`;
    const blob = new Blob(['\ufeff', content], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${post.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80) || 'JUNAF-草稿'}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('TXT 已下载到本地。');
  }

  function render() {
    const list = $('#post-list');
    list.replaceChildren();
    if (!saved.length) { list.textContent = '尚无文章。'; return; }
    for (const post of saved) {
      const card = document.createElement('article');
      card.className = 'thinking-draft';
      const state = document.createElement('small');
      state.textContent = {draft:'草稿', pending:'待审核', published:'已发布', rejected:'未通过'}[post.status] || post.status;
      const title = document.createElement('h3');
      title.textContent = post.title;
      const excerpt = document.createElement('p');
      excerpt.textContent = `${post.category} · ${post.body.slice(0, 180)}`;
      const actions = document.createElement('div');
      actions.className = 'thinking-draft-actions';
      const edit = document.createElement('button');
      edit.type = 'button'; edit.textContent = '编辑 ↗';
      edit.addEventListener('click', () => editPost(post));
      actions.append(edit);
      const download = document.createElement('button');
      download.type = 'button'; download.textContent = '下载 TXT ↓';
      download.addEventListener('click', () => downloadTxt(post));
      actions.append(download);
      if (['draft', 'rejected'].includes(post.status)) {
        const submit = document.createElement('button');
        submit.type = 'button'; submit.textContent = '提交审核 ↗';
        submit.addEventListener('click', async () => {
          submit.disabled = true;
          try {
            await api('/posts/' + post.id + '/submit', 'POST');
            await load();
            status('文章已提交审核');
          } catch (error) { status(error.message); }
          finally { submit.disabled = false; }
        });
        actions.append(submit);
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'delete-draft';
        remove.textContent = '删除草稿 ×';
        remove.addEventListener('click', async () => {
          if (!window.confirm(`确定永久删除「${post.title}」吗？`)) return;
          remove.disabled = true;
          try {
            await api('/posts/' + post.id, 'DELETE');
            if (editingId === post.id) resetEditor();
            await load();
            status('草稿已删除');
          } catch (error) { status(error.message); }
          finally { remove.disabled = false; }
        });
        actions.append(remove);
      }
      card.append(state, title, excerpt, actions);
      list.append(card);
    }
  }

  async function load() {
    try {
      const data = await api('/studio');
      for (const id of ['studio-login', 'studio-apply', 'studio-pending', 'studio-editor', 'studio-posts'])
        $('#' + id).hidden = true;
      const artist = data.artist;
      if (data.isAdmin || artist?.status === 'approved') {
        $('#studio-editor').hidden = false;
        $('#studio-posts').hidden = false;
        $('#artist-quota').textContent = data.isAdmin ? '管理员投稿不限数量'
          : `${artist.name} · ${artist.level} 艺术家 · 今日已投稿 ${data.usedToday} / ${artist.dailyThinkingLimit} 篇`;
        saved = data.posts || [];
        render();
      } else if (artist?.status === 'pending') $('#studio-pending').hidden = false;
      else $('#studio-apply').hidden = false;
      status('已连接 JUNAF 写作工作室');
    } catch (error) {
      if (error.message.includes('登录')) { $('#studio-login').hidden = false; status('请先登录'); }
      else status(error.message);
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#save-post');
    const body = {title: form.elements.title.value, category: form.elements.category.value, body: form.elements.body.value};
    const id = editingId;
    button.disabled = true;
    try {
      const result = id ? await api('/posts/' + id, 'PATCH', body) : await api('/posts', 'POST', body);
      if (!id) {
        editingId = result.id;
        $('#editor-heading').textContent = '编辑思考';
        button.textContent = '保存修改 ↗';
      }
      await load();
      status(id ? '修改已保存，可继续编辑并再次保存。' : '草稿已保存，可继续编辑或在下方提交审核。');
    } catch (error) { status(error.message); }
    finally { button.disabled = false; }
  });
  $('#editor-clear').addEventListener('click', () => { resetEditor(); status('已开始新文章'); });
  load();
})();
