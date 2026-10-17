(()=>{'use strict';
const BASE=['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:3100/api':'https://api.junaf.com/api';
const $=id=>document.getElementById(id);
let busy=false,refreshing=false,enabled=false,workerOnline=false,loopOnline=false,volumeOnline=false,h3Online=false,h3StageOnline=false;
let jobs=[],previewUrl=null,notice='',continueFrom=null;
let lastRenderKey='';

async function api(path,options={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetch(BASE+path,{credentials:'include',cache:'no-store',signal:controller.signal,...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=Error(data.message||`请求失败 (${response.status})`);error.status=response.status;throw error}
    return data;
  }catch(error){if(error.name==='AbortError')throw Error('连接超时，请稍后重试');if(error instanceof TypeError)throw Error('无法连接JUNAF服务，请检查网络后重试');throw error}
  finally{clearTimeout(timeout)}
}
function status(message){$('status').textContent=message}
async function copyPrompt(text,button,fallback){
  const original=button.textContent;
  try{
    if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
    button.textContent='已复制提示词';
    setTimeout(()=>{button.textContent=original},2000);
  }catch{
    fallback.hidden=false;fallback.focus();fallback.select();
    button.textContent='请复制已选中的提示词';
    setTimeout(()=>{button.textContent=original},4000);
  }
}
$('copy-current-prompt').onclick=()=>{
  const text=$('prompt').value.trim();
  if(!text){status('请先填写动态描述，或选择一条视频续接');return}
  copyPrompt(text,$('copy-current-prompt'),$('prompt'));
};
function currentMode(){return continueFrom?'video':$('mode').value}
function activeWorker(){return ['h3','h3-loop'].includes(currentMode())?($('size').value==='3000x1000'?h3StageOnline:h3Online):currentMode()==='volume-loop'?volumeOnline:currentMode()==='loop'?loopOnline:workerOnline}
function button(){
  const blocked=jobs.some(job=>['queued','running'].includes(job.status));
  $('submit').disabled=busy||!enabled||!activeWorker()||blocked;
  $('submit').textContent=busy?'正在提交…':continueFrom?'按原画面续接 ↗':'生成视频 ↗';
}
function applyMode(){
  const h3=currentMode()==='h3',stage=$('size').querySelector('[value="3000x1000"]');
  stage.disabled=!h3;stage.hidden=!h3;
  if(!h3&&$('size').value==='3000x1000')$('size').value='480p';
  const hd=h3&&!['480p','3000x1000'].includes($('size').value);
  $('reference-field').hidden=false;$('image').required=!continueFrom;$('image').disabled=!!continueFrom;
  $('prompt-field').hidden=false;$('prompt').required=true;
  $('duration').querySelector('[value="2s"]').disabled=h3;
  $('duration').querySelector('[value="10s"]').disabled=hd;
  $('duration').querySelector('[value="10s"]').textContent=h3?'约 10 秒':'约 10 秒 · 两段续接';
  if(h3&&($('duration').value==='2s'||hd&&$('duration').value==='10s'))$('duration').value='5s';
  $('size').querySelector('[value="480p"]').textContent='832 × 480 · 快速预览';
  $('size').querySelector('[value="720p"]').textContent=h3?'1344 × 768 · 原生高清':'1280 × 704 · 原生高清';
  $('size').querySelector('[value="1080p"]').textContent=h3?'1920 × 1080 · 从 768p 放大':'1920 × 1080 · 从 1088 高画面裁切';
  $('mode').disabled=!!continueFrom;
  $('model-hint').textContent=h3?'MiniMax H3 FL2VA · 参考图＋提示词。原生图像转视频，支持约 5 秒或 10 秒；当前未开放尾帧续接。':'Wan 2.2 TI2V 5B · 参考图＋提示词。支持约 2 秒、5 秒或两段续接约 10 秒；已有作品可继续使用尾帧续接。';
  $('form-note').textContent=h3?'高清与1080p当前开放约5秒。1080p为放大输出；参考图按比例留边。提示词原样传给模型，生成效果请预览后自行判断。':'参考图与提示词共同控制画面。续接会沿用原提示词和尺寸；一致性检查不能代替视觉验收。';
  if(h3&&$('size').value==='3000x1000')$('form-note').textContent='3:1 舞台宽屏：原生1248×416，放大交付3000×1000，支持约5秒或10秒。建议上传3:1参考图；其他比例会等比留边。';
  button();
}
function selectContinuation(job){
  continueFrom=job.id;$('mode').value='video';$('image').required=false;$('image').disabled=true;
  $('size').value=job.size;$('size').disabled=true;$('prompt').value=job.prompt;$('prompt').readOnly=true;
  $('continuation').hidden=false;$('image-preview').textContent='起始画面：上一段视频的最后一帧';
  $('duration').value='5s';applyMode();$('generate-form').scrollIntoView({behavior:'smooth',block:'start'});
}
$('cancel-continuation').onclick=()=>{
  continueFrom=null;$('image').required=true;$('image').disabled=false;$('size').disabled=false;
  $('prompt').readOnly=false;$('continuation').hidden=true;
  $('image-preview').textContent='选择一张图，作为视频的起始画面';applyMode();
};
$('mode').onchange=applyMode;
$('size').onchange=applyMode;

function clock(seconds){
  if(!Number.isFinite(seconds))return '0:00';
  return Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
}
function player(url,loop=false){
  const box=document.createElement('div');box.className='comfy-player';
  const video=document.createElement('video');video.playsInline=true;video.preload='metadata';
  video.crossOrigin='use-credentials';video.src=url;video.loop=loop;video.setAttribute('controlsList','nodownload noremoteplayback');
  video.disablePictureInPicture=true;
  video.oncontextmenu=event=>event.preventDefault();
  const controls=document.createElement('div');controls.className='comfy-player-controls';
  const toggle=document.createElement('button');toggle.type='button';toggle.textContent='播放';toggle.setAttribute('aria-label','播放或暂停');
  const progress=document.createElement('input');progress.type='range';progress.min='0';progress.max='1000';progress.value='0';progress.setAttribute('aria-label','播放进度');
  const time=document.createElement('span');time.textContent='0:00 / 0:00';
  toggle.onclick=()=>video.paused?video.play().catch(()=>{}):video.pause();
  video.onclick=toggle.onclick;
  video.onplay=()=>{toggle.textContent='暂停'};video.onpause=()=>{toggle.textContent='播放'};
  const sync=()=>{progress.value=video.duration?String(Math.round(video.currentTime/video.duration*1000)):'0';time.textContent=clock(video.currentTime)+' / '+clock(video.duration)};
  video.ontimeupdate=sync;video.onloadedmetadata=sync;video.onended=sync;
  progress.oninput=()=>{if(video.duration)video.currentTime=Number(progress.value)/1000*video.duration};
  controls.append(toggle,progress,time);box.append(video,controls);return box;
}
function render(){
  const list=$('job-list');list.replaceChildren();
  if(!jobs.length){const p=document.createElement('p');p.textContent='还没有视频。选择一张图，开始第一次实验。';list.append(p);return}
  for(const job of jobs){
    const article=document.createElement('article');article.className='comfy-job';
    const head=document.createElement('div'),title=document.createElement('strong'),badge=document.createElement('span');
    head.className='comfy-job-head';title.textContent=job.prompt.length>45?job.prompt.slice(0,45)+'…':job.prompt;
    badge.textContent={queued:'等待中',running:'生成中',completed:'已完成',failed:'失败'}[job.status]||job.status;
    head.append(title,badge);article.append(head);
    const time=document.createElement('time');time.textContent=new Date(job.createdAt).toLocaleString('zh-CN')+' · '+(job.size||'480p')+' · '+(job.duration||'2s')+(['loop','volume-loop'].includes(job.mode)?' · 视觉循环':'');article.append(time);
    if(['h3','h3-loop'].includes(job.mode)){const p=document.createElement('p');p.textContent=(job.mode==='h3-loop'?'H3 循环候选 · 尚需预览确认接缝':'H3 参考图视频')+(job.generation?' · 种子 '+job.generation.seed+' · '+job.generation.steps+' 步':'');article.append(p)}
    if(['strict','advisory'].includes(job.continuity)){
      const p=document.createElement('p'),reports=job.quality||[],warnings=reports.filter(item=>item.accepted===false);
      p.textContent=job.status==='completed'?(warnings.length?'续接视频已生成 · 检测到画面或明暗变化，请预览判断':'续接视频已生成 · 请预览确认衔接与风格'):'尾帧续接 · 自动沿用原提示词与画面尺寸';article.append(p);
      if(warnings.length){const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');summary.textContent='查看参考指标提示';text.textContent=[...new Set(warnings.flatMap(item=>item.reasons||[]))].join('；')+'。这些是画面差异指标，不代表视觉效果合格或不合格。';details.append(summary,text);article.append(details)}
    }else if(['loop','volume-loop'].includes(job.mode)){
      const p=document.createElement('p');p.textContent='历史周期算法作品 · 请预览确认效果';article.append(p);
    }
    if(job.error){const p=document.createElement('p');p.textContent=job.error;article.append(p)}
    if(job.status==='failed'&&job.error?.startsWith('连续生成未通过视觉一致性检查')){const p=document.createElement('p');p.textContent='此为旧检查策略产生的失败记录。请从原视频重新提交续接；系统不会自动重跑。';article.append(p)}
    if(job.status==='queued'&&!(['h3','h3-loop'].includes(job.mode)?(job.size==='3000x1000'?h3StageOnline:h3Online):job.mode==='volume-loop'?volumeOnline:job.mode==='loop'?loopOnline:workerOnline)){
      const p=document.createElement('p');p.textContent=['h3','h3-loop'].includes(job.mode)?'H3 工作进程未连接，请启动已部署 H3 的 5090 实例（实例1或实例3）。':job.mode==='loop'?'Loop 渲染器未连接，实例开机后会继续处理。':'GPU 未连接，开机并启动工作进程后会继续处理。';article.append(p);
    }
    if(job.videoAvailable){
      const url=BASE+'/tools/comfy/jobs/'+job.id+'/video';article.append(player(url,['loop','volume-loop','h3-loop'].includes(job.mode)));
      const actions=document.createElement('div');actions.className='comfy-actions';
      const download=document.createElement('a');download.className='comfy-download';download.href=BASE+'/tools/comfy/jobs/'+job.id+'/download';download.textContent='下载 MP4 ↧';actions.append(download);
      if(!['loop','volume-loop'].includes(job.mode)){
        const promptDetails=document.createElement('details');promptDetails.className='comfy-prompt-details';
        const summary=document.createElement('summary');summary.textContent='查看完整提示词';
        const promptText=document.createElement('textarea');promptText.readOnly=true;promptText.rows=4;promptText.value=job.prompt;
        promptText.setAttribute('aria-label','本视频的完整提示词');
        promptDetails.append(summary,promptText);article.append(promptDetails);
        const copy=document.createElement('button');copy.type='button';copy.textContent='复制提示词';
        copy.onclick=()=>copyPrompt(job.prompt,copy,{set hidden(value){promptDetails.open=!value},focus:()=>promptText.focus(),select:()=>promptText.select()});
        actions.append(copy);
        const next=document.createElement('button');next.type='button';next.className='comfy-download';next.textContent='按原画面续接 ↗';next.onclick=()=>selectContinuation(job);if(!['h3','h3-loop'].includes(job.mode))actions.append(next);
      }
      article.append(actions);
    }
    list.append(article);
  }
}
async function refresh(){
  if(refreshing)return;refreshing=true;
  try{
    const data=await api('/tools/comfy/jobs');$('workspace').hidden=false;$('login').hidden=true;$('restricted').hidden=true;
    enabled=!!data.enabled;workerOnline=!!data.workerOnline;loopOnline=!!data.loopOnline;volumeOnline=!!data.volumeOnline;h3Online=!!data.h3Online;h3StageOnline=!!data.h3StageOnline;
    jobs=Array.isArray(data.jobs)?data.jobs:[];
    const renderKey=JSON.stringify(jobs.map(job=>[job.id,job.status,job.error,job.videoAvailable,job.quality]));
    if(renderKey!==lastRenderKey){render();lastRenderKey=renderKey}
    if(!busy)status(notice||(!enabled?'视觉实验正在接入服务，暂不能提交':!activeWorker()?
      (['h3','h3-loop'].includes(currentMode())?'H3 工作进程未连接；请启动已部署 H3 的 5090 实例（实例1或实例3），工作进程连接后自动恢复。':currentMode()==='loop'?'Loop 渲染器未连接，实例开机后页面会自动恢复。':'GPU 当前未连接，开机后此页面会自动恢复。'):
      jobs.some(job=>['queued','running'].includes(job.status))?'视频正在生成，页面会自动更新。':'准备就绪'));
  }catch(error){
    if(error.status===401){$('workspace').hidden=true;$('login').hidden=false;$('restricted').hidden=true}
    else if(error.status===403){$('workspace').hidden=true;$('login').hidden=true;$('restricted').hidden=false}
    else status(error.message);
  }finally{refreshing=false;button()}
}
$('image').addEventListener('change',()=>{
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  const file=$('image').files[0],box=$('image-preview');box.replaceChildren();
  if(file){previewUrl=URL.createObjectURL(file);const img=document.createElement('img');img.src=previewUrl;img.alt='待生成的参考图像';box.append(img)}
  else box.textContent='选择一张图，作为视频的起始画面';
});
$('generate-form').onsubmit=async event=>{
  event.preventDefault();if(busy||!enabled||!activeWorker())return;
  const file=$('image').files[0],prompt=$('prompt').value.trim(),mode=currentMode();
  if(!continueFrom&&(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)){
    notice='请选择10 MB以下的PNG、JPG或WebP参考图';status(notice);return;
  }
  if(prompt.length<8){notice='提示词至少填写8个字符';status(notice);return}
  busy=true;notice='';button();status('正在提交…');
  try{
    if(continueFrom){
      await api('/tools/comfy/jobs/'+continueFrom+'/continue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({duration:$('duration').value})});
      $('cancel-continuation').click();
    }else{
      await api('/tools/comfy/jobs',{method:'POST',headers:{'Content-Type':file.type,
        'X-Comfy-Prompt':encodeURIComponent(prompt),'X-Comfy-Mode':mode,
        'X-Comfy-Size':$('size').value,'X-Comfy-Duration':$('duration').value},body:file});
    }
    notice='任务已提交，正在等待生成';status(notice);
  }catch(error){notice=error.message;status(notice)}
  finally{busy=false;await refresh()}
};
applyMode();refresh();setInterval(()=>{if(document.visibilityState==='visible')refresh()},5000);
})();
