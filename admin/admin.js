(() => {
  'use strict';
  const origin = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://127.0.0.1:3100' : 'https://api.junaf.com';
  const $ = selector => document.querySelector(selector);
  const views = {
    overview: ['01 / OVERVIEW', '整体概览', '音乐、视频、思考与工具，共享 JUNAF 的设计语言。'],
    music: ['02 / MUSIC', '作品与艺术家', '审核艺术家申请、管理投稿与每日上传额度。'],
    purchases: ['03 / MUSIC SALES', '作品购买与订单', '设置单曲价格、收款信息，并核对 JUNAF 作品订单。'],
    accounts: ['05 / USERS', '用户', '查看 JUNAF 用户及艺术家资格，不包含密码或会话信息。'],
    video: ['07 / VIDEO', '影像作品', '审核视频投稿，调整艺术家每日视频上传额度。'],
    thinking: ['08 / THINKING', '思考文章', '审核文章投稿，调整艺术家每日投稿额度。'],
    tools: ['09 / TOOLS', '工具', '将自主开发的工具组织在统一入口。'],
    system: ['10 / SYSTEM', '系统与注册', '检查后台连接，并管理新用户注册。']
  };
  const statusText = {awaiting_payment: '待付款', submitted: '待核款', provisional: '临时权益中',
    approving: '核款处理中', approved: '已核款', rejected: '已拒绝', cancelled:'已停售关闭', needs_info: '需补充信息'};
  const message = text => {$('#admin-message').textContent = text;};
  const node = (tag, text = '', className = '') => {
    const item = document.createElement(tag);
    item.textContent = String(text);
    if (className) item.className = className;
    return item;
  };
  const date = value => value ? new Date(value).toLocaleString('zh-CN') : '—';
  const money = fen => `¥${(Number(fen || 0) / 100).toFixed(2)}`;
  async function api(path, method = 'GET', body) {
    const response = await fetch(`${origin}/api/admin${path}`, {
      method, credentials: 'include', cache: 'no-store',
      headers: body ? {'Content-Type': 'application/json'} : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok || !data.ok)
      throw Object.assign(Error(data.message || '管理数据暂不可用'), {status: response.status});
    return data;
  }
  function section(title, description = '') {
    const item = node('section', '', 'admin-section');
    item.append(node('h2', title));
    if (description) item.append(node('p', description));
    $('#admin-content').append(item);
    return item;
  }
  function metric(parent, value, label) {
    const card = node('div', '', 'admin-metric');
    card.append(node('strong', value), node('span', label));
    parent.append(card);
  }
  function table(parent, columns, rows, empty) {
    if (!rows.length) {parent.append(node('p', empty, 'admin-empty')); return;}
    const wrap = node('div', '', 'admin-table-wrap');
    const table = node('table', '', 'admin-table');
    const head = node('thead');
    const headerRow = node('tr');
    for (const [label] of columns) headerRow.append(node('th', label));
    head.append(headerRow);
    const body = node('tbody');
    for (const row of rows) {
      const tr = node('tr');
      for (const [, render] of columns) tr.append(node('td', render(row)));
      body.append(tr);
    }
    table.append(head, body);
    wrap.append(table);
    parent.append(wrap);
  }
  function direction(parent, code, title, state, view) {
    const card = document.createElement(view ? 'a' : 'div');
    card.className = 'admin-direction';
    if (view) card.href = `#${view}`;
    card.append(node('small', code), node('strong', title), node('span', state));
    parent.append(card);
  }
  function renderOverview(data) {
    const counts = data.counts || {};
    const area = section('运营总览', '当前数字直接来自 JUNAF 独立数据库。');
    const grid = node('div', '', 'admin-metrics');
    for (const [key, label] of [['accounts', '有效用户'],
      ['publishedPacks', '已发布音乐作品'], ['publishedVideos', '已发布视频作品'], ['enabledProducts', '可购买作品'],
      ['orders', '音乐订单'], ['pendingOrders', '待处理核款']])
      metric(grid, String(counts[key] ?? 0), label);
    area.append(grid);
    const directions = section('应用方向');
    const cards = node('div', '', 'admin-directions');
    direction(cards, '01 / MUSIC', '音乐', '查看作品与艺术家 →', 'music');
    direction(cards, '02 / VIDEO', '视频', '查看作品与额度 →', 'video');
    direction(cards, '03 / THINKING', '思考', '查看文章与额度 →', 'thinking');
    direction(cards, '04 / TOOLS', '工具', '查看工具方向 →', 'tools');
    directions.append(cards);
    const switches = section('开放状态');
    const state = node('p');
    state.append(node('span', `公开注册：${data.switches?.registration ? '已开启' : '已关闭'}`, 'admin-state'),
      document.createTextNode('  '),
      node('span', `音乐购买：${data.switches?.sales ? '已开启' : '已关闭'}`, 'admin-state'));
    switches.append(state);
    const manage=node('a','管理注册开关 ↗','admin-link');manage.href='#system';switches.append(manage);
    const sales=node('a','管理作品购买 ↗','admin-link');sales.href='#purchases';switches.append(sales);
  }
  async function musicApi(path, method = 'GET', body) {
    const response = await fetch(`${origin}/api/music/admin${path}`, {method, credentials:'include',cache:'no-store',
      headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    const data=await response.json();if(!response.ok||!data.ok)throw Error(data.message||'音乐管理暂不可用');return data;
  }
  async function purchaseApi(path,method='GET',body){
    const response=await fetch(`${origin}/api/music/purchases${path}`,{method,credentials:'include',cache:'no-store',
      headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!response.ok||!data.ok)throw Error(data.message||'作品订单暂不可用');return data;
  }
  async function renderPurchases(){
    const data=await purchaseApi('/admin');
    const config=section('作品购买设置','配置收款码和收款方后再开放购买；关闭时现有订单仍可核款。');
    const form=node('form','','admin-order');const fields=node('div'),actions=node('div');
    const payee=formField(fields,'收款方名称','payee');payee.value=data.settings.payee;
    const qr=formField(fields,'收款二维码 HTTPS 图片地址','qrUrl','url');qr.value=data.settings.qrUrl;
    const instructions=formField(fields,'付款说明','instructions','textarea');instructions.value=data.settings.instructions;
    const enabled=formField(actions,'开放作品购买','enabled','select');
    for(const [value,label] of [['false','关闭'],['true','开放']]){const option=node('option',label);option.value=value;enabled.append(option);}
    enabled.value=String(data.settings.enabled);
    const save=node('button','保存收款设置 →');save.type='submit';actions.append(save);form.append(fields,actions);config.append(form);
    form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{
      await purchaseApi('/admin/settings','PUT',{payee:payee.value.trim(),qrUrl:qr.value.trim(),
        instructions:instructions.value.trim(),enabled:enabled.value==='true'});
      await loadView();message('收款设置已保存');
    }catch(e){message(e.message);}finally{save.disabled=false;}});
    const prices=section('单曲价格','只有已发布且启用购买的作品才会显示购买按钮；作品原本的在线播放保持开放。');
    for(const work of data.works){const card=node('article','','admin-order'),info=node('div');
      info.append(node('h3',work.title),node('p',`${work.artistName} · ${work.id}`));
      const editor=node('form'),amount=formField(editor,'售价（元）','price','number');amount.min='.01';amount.max='1000000';amount.step='.01';amount.value=work.priceFen?(work.priceFen/100).toFixed(2):'';
      const live=formField(editor,'上架状态','enabled','select');for(const [value,label]of[['false','不出售'],['true','开放购买']]){const option=node('option',label);option.value=value;live.append(option);}live.value=String(work.enabled);
      const button=node('button','保存售价 →');button.type='submit';editor.append(button);card.append(info,editor);prices.append(card);
      editor.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;try{
        const priceFen=Math.round(Number(amount.value)*100);if(!Number.isSafeInteger(priceFen)||priceFen<1)throw Error('请填写有效售价');
        await purchaseApi(`/admin/works/${encodeURIComponent(work.id)}`,'PUT',{priceFen,enabled:live.value==='true'});
        message(`${work.title} 的售价已保存`);
      }catch(e){message(e.message);}finally{button.disabled=false;}});
    }
    if(!data.works.length)prices.append(node('p','暂无已发布的音乐作品。','admin-empty'));
    const area=section('JUNAF 作品订单','确认实际到账及金额后再核款；核款后用户可从用户中心下载原始音频。');
    for(const order of data.orders){const card=node('article','','admin-order'),info=node('div');
      info.append(node('h3',order.title),node('p',`${order.accountEmail} · ${money(order.priceFen)} · ${statusText[order.status]||order.status}`),
        node('p',`${order.id} · 交易信息：${order.paymentRef||'未提交'} · 付款时间：${date(order.paidAt)}`));
      card.append(info);
      if(order.status==='submitted'){const editor=node('form'),action=formField(editor,'核款结果','action','select');
        for(const [value,label]of[['approve','确认到账'],['reject','拒绝']]){const option=node('option',label);option.value=value;action.append(option);}
        const amount=formField(editor,'实际到账金额（元）','amount','number');amount.min='.01';amount.step='.01';
        const note=formField(editor,'审核说明','note','textarea');const button=node('button','保存核款结果 →');button.type='submit';editor.append(button);card.append(editor);
        editor.addEventListener('submit',async event=>{event.preventDefault();const confirmedFen=Math.round(Number(amount.value)*100);
          if(action.value==='approve'&&confirmedFen!==order.priceFen){message('实际到账金额必须与订单金额相同');return;}
          if(action.value==='approve'&&!window.confirm('请确认已在收款记录中核实到账。确认后用户可下载原始音频。'))return;
          button.disabled=true;try{await purchaseApi(`/admin/orders/${encodeURIComponent(order.id)}/review`,'POST',
            {action:action.value,confirmedFen,note:note.value.trim()});await loadView();message('核款结果已保存');}
          catch(e){message(e.message);}finally{button.disabled=false;}});
      }area.append(card);
    }
    if(!data.orders.length)area.append(node('p','暂无作品订单。','admin-empty'));
  }
  let reviewAudio=null;
  const reviewTime=value=>Number.isFinite(value)?`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`:'0:00';
  function reviewPlayer(item){
    const wrap=node('div','','admin-audio');
    const audio=document.createElement('audio');audio.preload='none';audio.src=`${origin}${item.audioUrl}`;
    const play=node('button','▶');play.type='button';play.setAttribute('aria-label',`播放 ${item.title}`);
    const elapsed=node('span','0:00'),duration=node('span','0:00');
    const seek=document.createElement('input');seek.type='range';seek.min='0';seek.max='1000';seek.value='0';seek.disabled=true;seek.setAttribute('aria-label',`${item.title} 播放进度`);
    const update=()=>{const length=audio.duration;play.textContent=audio.paused?'▶':'Ⅱ';elapsed.textContent=reviewTime(audio.currentTime||0);duration.textContent=reviewTime(length);seek.disabled=!Number.isFinite(length)||length<=0;seek.value=seek.disabled?'0':String(Math.round((audio.currentTime||0)/length*1000));};
    play.addEventListener('click',()=>{if(audio.paused){if(reviewAudio&&reviewAudio!==audio)reviewAudio.pause();reviewAudio=audio;audio.play().catch(()=>message('试听失败，请重试'));}else audio.pause();});
    seek.addEventListener('input',()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=Number(seek.value)/1000*audio.duration;});
    for(const event of ['loadedmetadata','durationchange','timeupdate','play','pause','ended'])audio.addEventListener(event,update);
    wrap.append(audio,play,elapsed,seek,duration);return wrap;
  }
  const workReviewLabel=item=>item.status==='published'?(item.reviewStatus==='post_pending'?'绿色通道已发布 · 待后置审核':'审核通过 · 已发布'):item.status==='pending'?'待发布审核':'审核未通过';
  function reviewForm(form,item,apiCall){
    const status=formField(form,'审核决定','status','select');
    for(const [value,label]of[['published','审核通过并发布'],['rejected','驳回并停止展示'],['pending','转为待审核']]){const option=node('option',label);option.value=value;status.append(option);}status.value=item.status;
    const note=formField(form,'驳回原因','reviewNote','textarea');note.value=item.reviewNote||'';
    const button=node('button',item.reviewStatus==='post_pending'?'完成后置审核 →':'保存审核结果 →');button.type='submit';form.append(button);
    form.addEventListener('submit',async event=>{event.preventDefault();if(status.value==='rejected'&&!note.value.trim()){message('驳回时请填写原因');return;}
      button.disabled=true;try{await apiCall(item.id,{status:status.value,reviewNote:note.value.trim()});message(status.value==='rejected'?'作品已驳回并停止公开展示':'审核结果已保存');await loadView();}catch(error){message(error.message);}finally{button.disabled=false;}});
  }
  async function renderMusic() {
    const [artistData, workData, delistData, eventData] = await Promise.all([
      musicApi('/artists'), musicApi('/works'), musicApi('/delist-requests'), musicApi('/work-events')]);
    const artists=section('JUNAF 艺术家', 'A1–A5 是艺术家身份层级。新获批艺术家默认每天可上传 3 首；可逐人调整。');
    for(const item of artistData.artists||[]) {
      const card=node('article','','admin-order');const info=node('div');
      info.append(node('h3',item.name),node('p',`${item.id} · ${{pending:'待审核',approved:'已批准',rejected:'未通过'}[item.status]||item.status} · ${item.level||'A1'}`),node('p',item.bio||''));
      const form=node('form');const status=formField(form,'审核状态','status','select');
      for(const [value,label] of [['pending','待审核'],['approved','已批准'],['rejected','未通过']]){const o=node('option',label);o.value=value;status.append(o);}status.value=item.status;
      const level=formField(form,'艺术家等级','level','select');for(const value of ['A1','A2','A3','A4','A5']){const o=node('option',value);o.value=value;level.append(o);}level.value=item.level||'A1';
      const quota=formField(form,'每日上传数量','dailyLimit','number');quota.min='0';quota.max='1000';quota.step='1';quota.value=String(item.dailyLimit??3);
      const note=formField(form,'审核说明','reviewNote');note.value=item.reviewNote||'';
      const button=node('button','保存艺术家设置 →');button.type='submit';form.append(button);
      form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;try{await musicApi(`/artists/${encodeURIComponent(item.id)}`,'PATCH',{status:status.value,level:level.value,dailyLimit:Number(quota.value),reviewNote:note.value});message('艺术家设置已保存');await loadView();}catch(error){message(error.message);}finally{button.disabled=false;}});
      if (item.status === 'pending') {
        const approve=node('button','批准艺术家资格 →','admin-refresh');approve.type='button';
        approve.addEventListener('click',async()=>{approve.disabled=true;try{await musicApi(`/artists/${encodeURIComponent(item.id)}`,'PATCH',{status:'approved'});await loadView();message(`${item.name} 的艺术家资格已批准并生效`);}catch(error){message(error.message);}finally{approve.disabled=false;}});
        form.append(approve);
      }
      card.append(info,form);artists.append(card);
    }
    if(!artistData.artists?.length)artists.append(node('p','尚无艺术家申请。','admin-empty'));
    const works=section('音乐作品', 'A1、A2 上传后先审核；A3–A5 与管理员通过绿色通道直接发布，随后在此完成后置审核。');
    const studio=node('a','进入艺术家工作室上传作品 ↗','admin-link');studio.href='/music/studio/';works.append(studio);
    for(const item of workData.works||[]){
      const card=node('article','','admin-order'),info=node('div');
      info.append(node('h3',item.title),node('p',`${item.artistName} · ${item.creatorRole==='admin'?'JUNAF 官方':item.artistLevel||'艺术家'} · ${item.genre} · ${workReviewLabel(item)}`),reviewPlayer(item));
      if(item.reviewNote)info.append(node('p',`审核说明：${item.reviewNote}`));
      const form=node('form');reviewForm(form,item,(id,body)=>musicApi(`/works/${encodeURIComponent(id)}`,'PATCH',body));
      card.append(info,form);works.append(card);
    }
    if(!workData.works?.length)works.append(node('p','尚无上传作品。','admin-empty'));
    const delists=section('作品停售申请','批准后关闭购买并取消尚未付款的订单。已核款或待核款的作品仍不能由作者删除。');
    for(const request of delistData.requests||[]){
      const card=node('article','','admin-order'),info=node('div');
      info.append(node('h3',request.title),node('p',`作品 ${request.workId} · 作者账号 ${request.accountId}`),
        node('p',`申请时间：${date(request.requestedAt)}`),node('p',request.reason||'作者未填写说明'));
      const form=node('form'),action=formField(form,'处理结果','action','select');
      for(const [value,label]of[['approve','同意停售'],['reject','拒绝申请']]){const option=node('option',label);option.value=value;action.append(option);}
      const note=formField(form,'审核说明','note','textarea');const button=node('button','保存审核结果 →');button.type='submit';form.append(button);
      form.addEventListener('submit',async event=>{event.preventDefault();if(action.value==='reject'&&!note.value.trim()){message('拒绝申请时请填写原因');return;}
        button.disabled=true;try{await musicApi(`/delist-requests/${encodeURIComponent(request.workId)}/review`,'POST',
          {action:action.value,note:note.value.trim()});await loadView();message(action.value==='approve'?'停售已批准并生效':'申请已拒绝');}
        catch(error){message(error.message);}finally{button.disabled=false;}});
      card.append(info,form);delists.append(card);
    }
    if(!delistData.requests?.length)delists.append(node('p','当前没有待审核的停售申请。','admin-empty'));
    const history=section('作品操作记录','仅保留作品编号、操作者、动作、涉及字段与时间；不保存已删除作品的音频或正文。最近显示 200 条。');
    table(history,[['时间',row=>date(row.completedAt||row.createdAt)],['动作',row=>({upload:'上传',edit:'修改',delete:'删除'})[row.action]||row.action],
      ['作品编号',row=>row.workId],['操作者账号 ID',row=>row.actorAccountId],['状态',row=>row.state==='completed'?'完成':'处理中'],
      ['修改字段',row=>(row.changedFields||[]).join('、')||'—']],eventData.events||[],'暂无操作记录。');
  }
  async function videoApi(path, method='GET', body) {
    const response=await fetch(`${origin}/api/video/admin${path}`,{method,credentials:'include',cache:'no-store',
      headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    const data=await response.json();if(!response.ok||!data.ok)throw Error(data.message||'视频管理暂不可用');return data;
  }
  async function renderVideo() {
    const [artists,works]=await Promise.all([videoApi('/artists'),videoApi('/works')]);
    const area=section('视频上传额度','沿用已批准的 JUNAF 艺术家身份；视频每日额度与音乐分开计算，默认 3 部。');
    for(const item of artists.artists||[]){
      const card=node('article','','admin-order'),info=node('div');info.append(node('h3',item.name),node('p',`${item.status} · ${item.level} · ${item.id}`));
      const form=node('form'),limit=formField(form,'每日视频上传数量','limit','number');limit.min='0';limit.max='1000';limit.step='1';limit.value=String(item.dailyVideoLimit);const button=node('button','保存额度 →');button.type='submit';form.append(button);
      form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;try{await videoApi(`/artists/${encodeURIComponent(item.id)}`,'PATCH',{dailyVideoLimit:Number(limit.value)});message('视频额度已保存');await loadView();}catch(error){message(error.message);}finally{button.disabled=false;}});
      card.append(info,form);area.append(card);
    }
    if(!artists.artists?.length)area.append(node('p','尚无艺术家。请在音乐管理中审批艺术家申请。','admin-empty'));
    const videos=section('视频作品','A1、A2 上传后先审核；A3–A5 与管理员直接发布，随后在此完成后置审核。');
    const studio=node('a','进入视频工作室 ↗','admin-link');studio.href='/video/studio/';videos.append(studio);
    for(const item of works.works||[]){
      const card=node('article','','admin-order'),info=node('div');
      info.append(node('h3',item.title),node('p',`${item.artistName} · ${item.creatorRole==='admin'?'JUNAF 官方':item.artistLevel||'艺术家'} · ${item.category} · ${workReviewLabel(item)}`));
      const video=document.createElement('video');video.controls=true;video.preload='metadata';video.style.maxWidth='320px';video.src=`${origin}${item.videoUrl}`;info.append(video);
      if(item.reviewNote)info.append(node('p',`审核说明：${item.reviewNote}`));
      const form=node('form');reviewForm(form,item,(id,body)=>videoApi(`/works/${encodeURIComponent(id)}`,'PATCH',body));
      card.append(info,form);videos.append(card);
    }
    if(!works.works?.length)videos.append(node('p','尚无视频投稿。','admin-empty'));
  }
  async function thinkingApi(path,method='GET',body){
    const response=await fetch(`${origin}/api/thinking/admin${path}`,{method,credentials:'include',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    const data=await response.json();if(!response.ok||!data.ok)throw Error(data.message||'思考管理暂不可用');return data;
  }
  async function renderThinking(){
    const [artists,posts]=await Promise.all([thinkingApi('/artists'),thinkingApi('/posts')]);
    const area=section('思考投稿额度','艺术家身份与音乐、视频共用；思考每日投稿额度独立计算，默认 3 篇。');
    for(const item of artists.artists||[]){const card=node('article','','admin-order'),info=node('div');info.append(node('h3',item.name),node('p',`${item.status} · ${item.level} · ${item.id}`));const form=node('form'),limit=formField(form,'每日思考投稿数量','limit','number');limit.min='0';limit.max='1000';limit.step='1';limit.value=String(item.dailyThinkingLimit);const button=node('button','保存额度 →');button.type='submit';form.append(button);form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;try{await thinkingApi(`/artists/${encodeURIComponent(item.id)}`,'PATCH',{dailyThinkingLimit:Number(limit.value)});message('思考额度已保存');await loadView();}catch(error){message(error.message);}finally{button.disabled=false;}});card.append(info,form);area.append(card);}
    if(!artists.artists?.length)area.append(node('p','尚无艺术家。请在音乐管理中审批申请。','admin-empty'));
    const articles=section('文章审核','草稿仅作者可见；投稿审核通过后公开。管理员可在写作工作室直接创作。');const studio=node('a','进入写作工作室 ↗','admin-link');studio.href='/thinking/studio/';articles.append(studio);
    for(const item of posts.posts||[]){const card=node('article','','admin-order'),info=node('div');info.append(node('h3',item.title),node('p',`${item.authorName} · ${item.category} · ${item.status}`),node('p',item.body));const form=node('form'),state=formField(form,'发布状态','status','select');for(const [value,label]of[['pending','待审核'],['published','发布'],['rejected','退回']]){const o=node('option',label);o.value=value;state.append(o);}state.value=item.status==='draft'?'pending':item.status;const button=node('button','保存文章状态 →');button.type='submit';form.append(button);form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;try{await thinkingApi(`/posts/${encodeURIComponent(item.id)}`,'PATCH',{status:state.value});message('文章状态已保存');await loadView();}catch(error){message(error.message);}finally{button.disabled=false;}});card.append(info,form);articles.append(card);}
    if(!posts.posts?.length)articles.append(node('p','尚无文章。','admin-empty'));
  }
  function formField(form, labelText, name, type = 'text') {
    const label = node('label', labelText);
    const input = document.createElement(['textarea', 'select'].includes(type) ? type : 'input');
    input.name = name;
    if (!['textarea', 'select'].includes(type)) input.type = type;
    label.append(input);
    form.append(label);
    return input;
  }
  function reviewCard(order) {
    const card = node('article', '', 'admin-order');
    const info = node('div');
    info.append(node('h3', order.product?.name || order.id),
      node('p', `${order.accountEmail || order.storeName || order.storeId || '用户'} · ${statusText[order.status] || order.status}`),
      node('p', `订单 ${order.id} · 应收 ${money(order.product?.priceFen)}`),
      node('p', `付款时间：${date(order.paidAt)} · 交易尾号：${order.paymentRef || '未提交'}`));
    if (order.collisionFlag) info.append(node('p', '交易尾号重复，确认到账时须填写完整交易单号。'));
    const form = node('form');
    const actionLabel = node('label', '处理方式');
    const action = node('select');
    for (const [value, label] of [['approve', '确认到账'], ['needs_info', '要求补充信息'], ['reject', '审核不通过']]) {
      const option = node('option', label); option.value = value; action.append(option);
    }
    actionLabel.append(action); form.append(actionLabel);
    const amount = formField(form, '确认到账金额（元）', 'amount', 'number');
    amount.min = '0.01'; amount.step = '0.01';
    const fullId = formField(form, '完整微信交易单号（撞号时填写）', 'fullTransactionId');
    const note = formField(form, '审核说明', 'note', 'textarea');
    const update = () => {
      amount.required = action.value === 'approve';
      fullId.required = action.value === 'approve' && order.collisionFlag === true;
      note.required = action.value !== 'approve';
    };
    action.addEventListener('change', update); update();
    const submit = node('button', '保存审核 →'); submit.type = 'submit'; form.append(submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const confirmedFen = Math.round(Number(amount.value) * 100);
      if (action.value === 'approve') {
        if (confirmedFen !== order.product?.priceFen) {message('确认金额必须与订单金额一致'); return;}
        if (!window.confirm('请确认已在实际收款记录中核对到账、金额和交易信息。确认后将发放正式权益。')) return;
      }
      submit.disabled = true;
      try {
        await api(`/music/shop/orders/${encodeURIComponent(order.id)}/review`, 'POST', {
          action: action.value, confirmedFen, fullTransactionId: fullId.value.trim(), note: note.value.trim()
        });
        await loadView();
        message('订单审核已保存');
      } catch (error) {message(error.message);}
      finally {submit.disabled = false;}
    });
    card.append(info, form);
    return card;
  }
  async function renderReview() {
    const data = await api('/music/shop/workbench');
    const area = section('待核款队列', '正式权益只能在人工确认到账后生效。');
    const grid = node('div', '', 'admin-metrics');
    for (const [key, label] of [['unpaid', '待付款'], ['awaitingReview', '待核款'],
      ['overdue', '超过两小时'], ['collision', '交易尾号重复'], ['expiring', '临时权益即将到期']])
      metric(grid, String(data.counts?.[key] ?? 0), label);
    area.append(grid);
    const refresh = node('button', '刷新队列 ↻', 'admin-refresh');
    refresh.type = 'button'; refresh.addEventListener('click', loadView); area.append(refresh);
    const queue = node('div');
    for (const order of data.orders || []) queue.append(reviewCard(order));
    if (!data.orders?.length) queue.append(node('p', '当前没有待核款订单。', 'admin-empty'));
    area.append(queue);
  }
  async function renderOrders() {
    const area = section('音乐订单', '最多显示每页 30 笔。订单号与交易尾号可精确缩小结果。');
    const form = node('form', '', 'admin-filters');
    const status = formField(form, '状态', 'status', 'select');
    for (const [value, label] of [['', '全部'], ...Object.entries(statusText)]) {
      const option = node('option', label); option.value = value; status.append(option);
    }
    const orderId = formField(form, '订单号', 'orderId');
    const suffix = formField(form, '交易号后 6 位', 'paymentSuffix');
    suffix.inputMode = 'numeric'; suffix.maxLength = 6;
    const submit = node('button', '查询 →'); submit.type = 'submit'; form.append(submit);
    area.append(form);
    const results = node('div'); area.append(results);
    const query = async () => {
      const params = new URLSearchParams();
      if (status.value) params.set('status', status.value);
      if (orderId.value.trim()) params.set('orderId', orderId.value.trim());
      if (suffix.value.trim()) params.set('paymentSuffix', suffix.value.trim());
      const data = await api(`/music/shop/orders?${params}`);
      results.replaceChildren();
      results.append(node('p', `共 ${data.total} 笔订单；当前第 ${data.page} 页。`));
      table(results, [['订单', row => row.id], ['用户', row => row.accountEmail || row.storeName || row.storeId || '—'],
        ['商品', row => row.product?.name || '—'], ['金额', row => money(row.product?.priceFen)],
        ['状态', row => statusText[row.status] || row.status], ['创建', row => date(row.createdAt)]],
      data.orders || [], '没有符合条件的订单。');
    };
    form.addEventListener('submit', event => {event.preventDefault(); query().catch(error => message(error.message));});
    await query();
  }
  async function renderAccounts() {
    const data = await api('/accounts');
    const area = section('JUNAF 用户', '艺术家身份以审核通过为准；级别与作品、视频、思考共用。密码与会话不会出现在后台列表。');
    table(area, [['邮箱', row => row.email], ['称呼', row => row.name || '—'],
      ['账号状态', row => row.status],
      ['是否艺术家', row => ({approved:'是',pending:'待审核',rejected:'否（未通过）'})[row.artistStatus] || '否'],
      ['级别', row => row.isArtist ? row.artistLevel : '—'],
      ['创建', row => date(row.createdAt)]],
    data.accounts || [], '当前没有用户。');
  }
  async function renderSystem() {
    const data = await api('/system');
    const area = section('服务状态');
    const grid = node('div', '', 'admin-metrics');
    for (const [value, label] of [[data.database === 'connected' ? '正常' : '异常', 'MongoDB'],
      [data.registrationEnabled ? '开启' : '关闭', '公开注册'],
      [data.salesEnabled ? '开启' : '关闭', '音乐购买'],
      [data.mediaConfigured ? '已配置' : '未配置', '本地媒体']]) metric(grid, value, label);
    area.append(grid);
    const control=node('div','','admin-setting');
    const details=node('div');
    details.append(node('h3','新用户注册'),node('p','关闭后停止发送注册验证码并拒绝新账号提交；现有账号仍可登录。'));
    const toggle=node('button',data.registrationEnabled?'已开放 · 点击关闭':'已关闭 · 点击开放','admin-switch');
    toggle.type='button';toggle.setAttribute('role','switch');
    toggle.setAttribute('aria-label','开放新用户注册');
    toggle.setAttribute('aria-checked',String(data.registrationEnabled));
    toggle.addEventListener('click',async()=>{
      toggle.disabled=true;
      try{
        const result=await api('/settings/registration','PATCH',{enabled:!data.registrationEnabled});
        await loadView();
        message(result.registrationEnabled?'新用户注册已开放':'新用户注册已关闭');
      }catch(error){message(error.message);toggle.disabled=false;}
    });
    control.append(details,toggle);area.append(control);
  }
  function renderPlanned(view) {
    const labels = {tools: '工具目录和用户使用管理将作为独立模块接入。'};
    const area = section(`${views[view][1]}方向`, labels[view]);
    if (view === 'tools') {
      const link = node('a', '查看现有 JUNAF Tools ↗', 'admin-link');
      link.href = '/tools/'; area.append(link);
    }
  }
  async function loadView() {
    const view = Object.hasOwn(views, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
    const [index, title, description] = views[view];
    $('#view-index').textContent = index;
    $('#view-title').textContent = title;
    $('#view-description').textContent = description;
    for (const link of document.querySelectorAll('#admin-nav a'))
      link.getAttribute('data-view') === view ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current');
    $('#admin-content').replaceChildren();
    message('正在读取管理数据…');
    try {
      const overview = await api('/overview');
      $('#admin-login').hidden = true;
      if (view === 'overview') renderOverview(overview);
      else if (view === 'purchases') await renderPurchases();
      else if (view === 'music') await renderMusic();
      else if (view === 'video') await renderVideo();
      else if (view === 'thinking') await renderThinking();
      else if (view === 'review') await renderReview();
      else if (view === 'orders') await renderOrders();
      else if (view === 'accounts') await renderAccounts();
      else if (view === 'system') await renderSystem();
      else renderPlanned(view);
      message('已更新');
    } catch (error) {
      $('#admin-content').replaceChildren();
      $('#admin-login').hidden = error.status !== 403 && error.status !== 401;
      message(error.status === 403 || error.status === 401 ? '请使用 JUNAF 管理员账号登录。' : error.message);
    }
  }
  async function loadIdentity() {
    try {
      const response = await fetch(`${origin}/api/auth/me`, {credentials: 'include', cache: 'no-store'});
      const data = await response.json();
      $('#admin-identity').textContent = data.ok ? data.account.email : '未登录';
    } catch {$('#admin-identity').textContent = '身份暂不可用';}
  }
  window.addEventListener('hashchange', loadView);
  loadIdentity();
  loadView();
})();
