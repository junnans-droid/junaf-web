(()=>{'use strict';const origin=['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:3100':'https://api.junaf.com';const $=s=>document.querySelector(s);const status=t=>{$('#studio-status').textContent=t;};
async function api(path,method='GET',body){const r=await fetch(origin+'/api/music'+path,{method,credentials:'include',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.message||'请求失败');return d;}
async function load(){
  try{
    const data=await api('/studio');
    for(const id of ['studio-login','studio-apply','studio-pending','studio-rejected','studio-upload','studio-works'])$('#'+id).hidden=true;
    const a=data.artist;
    if(data.isAdmin||a?.status==='approved'){
      $('#studio-upload').hidden=false;
      $('#artist-quota').textContent=data.isAdmin?'管理员上传不限数量':`${a.name} · ${a.level} 艺术家 · 今日已上传 ${data.usedToday} / ${a.dailyLimit} 首`;
    }else if(a?.status==='pending')$('#studio-pending').hidden=false;
    else if(a?.status==='rejected'){
      $('#studio-rejected').hidden=false;$('#reject-note').textContent=a.reviewNote||'请修改资料后重新申请。';
      $('#artist-form').elements.name.value=a.name;$('#artist-form').elements.bio.value=a.bio;
    }else $('#studio-apply').hidden=false;
    if(data.isAdmin||a?.status==='approved'||data.works?.length){$('#studio-works').hidden=false;renderWorks(data.works||[]);}
    status('已连接 JUNAF 艺术家工作室');
  }catch(e){if(e.message.includes('登录')){$('#studio-login').hidden=false;status('请先登录');}else status(e.message);}
}
let activeAudio=null;
const formatTime=value=>Number.isFinite(value)?`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`:'0:00';
function createPlayer(track){
  const wrap=document.createElement('div');wrap.className='studio-audio';
  const audio=document.createElement('audio');audio.preload='none';audio.src=origin+track.audioUrl;
  const play=document.createElement('button');play.type='button';play.textContent='▶';play.setAttribute('aria-label',`播放 ${track.title}`);
  const elapsed=document.createElement('span');elapsed.textContent='0:00';
  const progress=document.createElement('input');progress.type='range';progress.min='0';progress.max='1000';progress.value='0';progress.disabled=true;progress.setAttribute('aria-label',`${track.title} 播放进度`);
  const duration=document.createElement('span');duration.textContent='0:00';
  const update=()=>{const length=audio.duration;play.textContent=audio.paused?'▶':'Ⅱ';play.setAttribute('aria-label',`${audio.paused?'播放':'暂停'} ${track.title}`);
    elapsed.textContent=formatTime(audio.currentTime||0);duration.textContent=formatTime(length);
    progress.disabled=!Number.isFinite(length)||length<=0;progress.value=progress.disabled?'0':String(Math.round((audio.currentTime||0)/length*1000));};
  play.addEventListener('click',()=>{if(audio.paused){if(activeAudio&&activeAudio!==audio)activeAudio.pause();activeAudio=audio;audio.play().catch(()=>status('播放失败，请重试'));}else audio.pause();});
  progress.addEventListener('input',()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=Number(progress.value)/1000*audio.duration;});
  for(const event of ['loadedmetadata','durationchange','timeupdate','play','pause','ended'])audio.addEventListener(event,update);
  wrap.append(audio,play,elapsed,progress,duration);return wrap;
}
function renderWorks(rows){const list=$('#work-list');if(activeAudio){activeAudio.pause();activeAudio=null;}list.replaceChildren();if(!rows.length){list.textContent='尚无作品。';return;}
  for(const t of rows){const card=document.createElement('article');card.className='studio-work';const label=document.createElement('small');label.textContent={published:'已发布',pending:'待审核',rejected:'未通过'}[t.status]||t.status;
    const title=document.createElement('h3');title.textContent=t.title;const desc=document.createElement('p');desc.textContent=`${t.genre} · ${t.description||'无介绍'}`;
    const audio=createPlayer(t);const actions=document.createElement('div');actions.className='studio-work-actions';
    const download=document.createElement('a');download.textContent='下载我的原文件 ↘';download.href=origin+t.audioUrl+'?download=1';
    const edit=document.createElement('button');edit.type='button';edit.textContent='编辑作品 ↗';
    const form=document.createElement('form');form.className='studio-edit';form.hidden=true;
    const field=(text,name,value,textarea=false)=>{const wrapper=document.createElement('label');wrapper.textContent=text;
      const input=document.createElement(textarea?'textarea':'input');input.name=name;input.value=value;input.required=name!=='description';
      input.maxLength=name==='title'?160:name==='genre'?60:500;wrapper.append(input);form.append(wrapper);return input;};
    const titleInput=field('曲名','title',t.title),genreInput=field('音乐风格','genre',t.genre),descriptionInput=field('作品介绍','description',t.description||'',true);
    const save=document.createElement('button');save.type='submit';save.textContent='保存修改 →';form.append(save);
    edit.addEventListener('click',()=>{form.hidden=!form.hidden;if(!form.hidden)titleInput.focus();});
    form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{
      await api('/works/'+encodeURIComponent(t.id),'PATCH',{title:titleInput.value.trim(),genre:genreInput.value.trim(),description:descriptionInput.value.trim()});
      await load();status('作品资料已保存；已发布作品将重新进入审核。');
    }catch(error){status(error.message);}finally{save.disabled=false;}});
    actions.append(download,edit);
    if(t.onSale){const request=document.createElement('button');request.type='button';request.textContent=t.delistStatus==='pending'?'停售申请审核中':t.delistStatus==='rejected'?'重新申请停售 ↗':'申请下架停售 ↗';
      request.disabled=t.delistStatus==='pending';request.addEventListener('click',async()=>{const reason=prompt('请填写申请停售的原因（可留空）','');if(reason===null)return;
        request.disabled=true;try{await api('/works/'+encodeURIComponent(t.id)+'/delist','POST',{reason:reason.trim()});await load();status('停售申请已提交，等待后台审核。');}
        catch(error){status(error.message);request.disabled=false;}});actions.append(request);}
    else {const remove=document.createElement('button');remove.type='button';remove.textContent='删除作品';remove.className='studio-delete';remove.disabled=t.hasActiveOrders===true;
      remove.addEventListener('click',async()=>{if(!window.confirm(`确定永久删除《${t.title}》？服务器音频文件和数据库作品记录会一并删除，无法恢复。`))return;
        remove.disabled=true;try{await api('/works/'+encodeURIComponent(t.id),'DELETE');await load();status('作品及服务器原文件已删除。');}
        catch(error){status(error.message);remove.disabled=false;}});actions.append(remove);}
    card.append(label,title,desc,audio,actions,form);
    if(t.hasActiveOrders&&!t.onSale){const notice=document.createElement('p');notice.className='studio-work-note';notice.textContent='作品有已出售或待处理订单，不能删除。';card.append(notice);}
    if(t.delistStatus==='rejected'&&t.delistReviewNote){const note=document.createElement('p');note.className='studio-work-note';note.textContent=`停售申请未通过：${t.delistReviewNote}`;card.append(note);}
    list.append(card);}}
$('#artist-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const b=f.querySelector('button');b.disabled=true;try{await api('/artist/apply','POST',{name:f.elements.name.value,bio:f.elements.bio.value});await load();}catch(err){status(err.message);}finally{b.disabled=false;}});$('#reapply').addEventListener('click',()=>{$('#studio-rejected').hidden=true;$('#studio-apply').hidden=false;});
$('#upload-form').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget,file=f.elements.audio.files[0];if(!file)return;const b=f.querySelector('button'),progress=$('#upload-progress');b.disabled=true;progress.hidden=false;progress.value=0;status('正在上传作品…');const req=new XMLHttpRequest();req.open('PUT',origin+'/api/music/works');req.withCredentials=true;const type=file.name.toLowerCase().endsWith('.mp3')?'audio/mpeg':file.name.toLowerCase().endsWith('.wav')?'audio/wav':file.name.toLowerCase().endsWith('.flac')?'audio/flac':file.name.toLowerCase().endsWith('.m4a')?'audio/mp4':file.type;req.setRequestHeader('Content-Type',type);for(const [key,value]of [['Title',f.elements.title.value],['Genre',f.elements.genre.value],['Description',f.elements.description.value]])req.setRequestHeader('X-Music-'+key,encodeURIComponent(value));req.upload.onprogress=x=>{if(x.lengthComputable)progress.value=Math.round(x.loaded/x.total*100);};req.onload=async()=>{b.disabled=false;try{const d=JSON.parse(req.responseText);if(req.status!==201||!d.ok)throw Error(d.message||'上传失败');f.reset();status('作品已上传，等待发布审核。');await load();}catch(err){status(err.message);}};req.onerror=()=>{b.disabled=false;status('网络错误，上传失败');};req.send(file);});load();setInterval(()=>{if(!document.hidden&&!$('#studio-pending').hidden)load();},20000);})();
