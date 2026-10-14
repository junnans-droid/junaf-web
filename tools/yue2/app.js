(()=>{'use strict';
const BASE=['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:3100/api':'https://api.junaf.com/api';
const $=id=>document.getElementById(id);
let busy=false, refreshing=false, jobs=[], workerOnline=false, canSubmit=false, notice='';

async function api(path,options={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(BASE+path,{credentials:'include',cache:'no-store',signal:controller.signal,...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=Error(data.message||`请求失败 (${response.status})`);error.status=response.status;throw error}
    return data;
  }catch(error){if(error.name==='AbortError')throw Error('连接超时，请检查网络后重试');throw error}
  finally{clearTimeout(timeout)}
}
function status(message){$('status').textContent=message}
function selectedMode(){return document.querySelector('input[name="mode"]:checked')?.value||'song'}
function updateMode(){
  const workflow=window.JunafYueCreation?.path()||'standard';
  if(['short','arrange'].includes(workflow))document.querySelector('input[name=mode][value=instrumental]').checked=true;
  document.querySelector('input[name=mode][value=song]').disabled=['short','arrange'].includes(workflow);
  const instrumental=selectedMode()==='instrumental';
  $('lyrics-field').hidden=instrumental;
  $('abc-field').hidden=!instrumental||workflow!=='standard';
  $('lyrics').required=!instrumental;
  $('lyrics').disabled=instrumental;
  $('style').placeholder=instrumental
    ? '例如：纯音乐，温暖钢琴与弦乐，缓慢起伏，无人声，适合夜间阅读'
    : '例如：中文独立流行，温暖女声，钢琴、贝斯与轻鼓，88 BPM，克制而明亮';
  if(notice){notice='';status('准备就绪')}
}
function updateButton(){const button=$('submit');button.disabled=busy||!canSubmit||!workerOnline;button.textContent=busy?'正在提交…':'生成音乐 ↗'}
function render(){
  const list=$('job-list');list.replaceChildren();
  if(!jobs.length){const empty=document.createElement('p');empty.textContent='还没有作品。写下一个方向，开始第一首。';list.append(empty);return}
  for(const job of jobs){
    const article=document.createElement('article');article.className='yue2-job';
    const head=document.createElement('div');head.className='yue2-job-head';
    const title=document.createElement('strong');title.textContent=job.style.length>46?job.style.slice(0,46)+'…':job.style;
    const badge=document.createElement('span');badge.textContent=(job.mode==='instrumental'?(job.scoreImported?'曲谱纯音乐 · ':'纯音乐 · '):'歌曲 · ')+({queued:'等待中',running:'生成中',completed:'已完成',failed:'失败'}[job.status]||job.status);
    if(job.workflow&&job.workflow!=='standard')badge.textContent=({short:'短旋律 · ',arrange:'旋律编曲 · ',cover:'Cover · '}[job.workflow]||'')+badge.textContent;
    if(job.renderIntent==='accompaniment')badge.textContent='AI 伴奏实验 · 不保证同步 · '+badge.textContent;
    head.append(title,badge);if(job.styleProfileName){const p=document.createElement('p');p.textContent='参考风格档案：'+job.styleProfileName;article.append(p);}const time=document.createElement('time');time.textContent=new Date(job.createdAt).toLocaleString('zh-CN');article.append(head,time);
    if((!job.workflow||job.workflow==='standard')&&!job.scoreImported){const again=document.createElement('button');again.type='button';again.textContent='以此方向再创作 ↗';again.onclick=()=>{$('creation-path').value='standard';$('creation-path').dispatchEvent(new Event('change'));document.querySelector('input[name=mode][value="'+(job.mode==='instrumental'?'instrumental':'song')+'"]').checked=true;updateMode();$('style').value=job.style;$('lyrics').value=job.lyrics||'';$('abc-file').value='';window.JunafAppliedStyleProfile=job.styleProfileName?{name:job.styleProfileName,prompt:job.style}:null;status('已载入这一版声音方向；可修改后提交新的创作。');$('generate-form').scrollIntoView({behavior:'smooth'});};article.append(again);}
    if(job.error){const p=document.createElement('p');p.textContent=job.error;article.append(p)}
    if(job.status==='queued'&&!workerOnline){const p=document.createElement('p');p.textContent='GPU 生成节点尚未就绪，恢复后继续处理。';article.append(p)}
    if(job.audioAvailable){const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.crossOrigin='use-credentials';audio.src=BASE+'/tools/yue2/jobs/'+job.id+'/audio';article.append(audio);const download=document.createElement('button');download.type='button';download.textContent='下载 FLAC';download.onclick=async()=>{download.disabled=true;try{const response=await fetch(audio.src,{credentials:'include'});if(!response.ok)throw Error('下载失败');const u=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=u;a.download='JUNAF-'+job.id+'.flac';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}catch(e){status(e.message);}finally{download.disabled=false;}};article.append(download);if(job.durationSeconds){const p=document.createElement('p');p.textContent='实际时长 '+job.durationSeconds.toFixed(1)+' 秒';article.append(p);if(job.nominalSeconds){const timing=document.createElement('p');timing.textContent='谱面参考 '+job.nominalSeconds.toFixed(1)+' 秒';if(Math.abs(job.durationSeconds-job.nominalSeconds)>Math.max(2,job.nominalSeconds*.25)){timing.className='yue2-timing-warning';timing.textContent+=' · 模型未严格遵守谱面长度，请试听核对；不作为严格短段成品。';}article.append(timing)}}}
    if(job.score){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='查看旋律与和弦计划';const pre=document.createElement('pre');pre.textContent=job.score;details.append(summary,pre);article.append(details)}
    list.append(article)
  }
}
async function refresh(){
  if(refreshing)return;
  refreshing=true;
  try{
    const data=await api('/tools/yue2/jobs');
    jobs=Array.isArray(data.jobs)?data.jobs:[];workerOnline=!!data.workerOnline;canSubmit=!!data.canSubmit;
    $('workspace').hidden=false;$('login').hidden=true;render();
    if(!busy){
      if(notice)status(notice);
      else if(!canSubmit)status(data.adminOnly?'当前仅管理员账号可用，请到用户中心切换账号。':'音乐生成暂未开放');
      else if(!workerOnline)status('GPU 生成节点尚未就绪（可能无卡开机、加载中或未连接）。可先准备旋律，节点就绪后恢复提交。');
      else if(jobs.some(job=>['queued','running'].includes(job.status)))status('任务正在处理中，页面会自动更新。');
      else status('准备就绪');
    }
  }catch(error){
    if(error.status===401){$('workspace').hidden=true;$('login').hidden=false;$('login').querySelector('p').textContent='请先登录 JUNAF 账号。'}
    else status(error.message);
  }finally{refreshing=false;updateButton()}
}
$('generate-form').onsubmit=async event=>{
  event.preventDefault();if(busy||!canSubmit||!workerOnline)return;
  notice='';
  const mode=selectedMode(),style=$('style').value.trim(),lyrics=mode==='song'?$('lyrics').value.trim():'';
  if(style.length<8||(mode==='song'&&lyrics.length<8)){notice=mode==='song'?'声音方向和原创歌词都需要至少 8 个字。':'声音方向至少填写 8 个字。';status(notice);return}
  const workflow=window.JunafYueCreation?.path()||'standard';
  const gpuPlan=window.JunafAccompaniment?.gpuInput();
  if(gpuPlan?.error){notice=gpuPlan.error;status(notice);return;}
  let abc=workflow==='standard'?'':window.JunafYueCreation.abc();
  if(gpuPlan)abc=gpuPlan.abc;
  if(workflow!=='standard'&&(!abc||!window.JunafYueCreation.reviewed())){notice='请先准备并校对旋律，勾选确认后再生成。';status(notice);return;}
  if(abc&&(!/^X:\s*\d+/m.test(abc)||!/^K:\s*\S+/m.test(abc))){status('旋律需要有效的 ABC（X: 与 K: 行）');return;}
  const file=mode==='instrumental'&&workflow==='standard' ? $('abc-file').files[0] : null;
  if(file){
    if(!/\.(abc|txt)$/i.test(file.name)||file.size>32768){notice='请选择 32 KB 以下的 .abc 或 .txt 曲谱。';status(notice);return}
    try{abc=(await file.text()).replace(/^\uFEFF/,'').trim()}catch{notice='无法读取曲谱文件，请重新选择。';status(notice);return}
    if(!/^X:\s*\d+/m.test(abc)||!/^K:\s*\S+/m.test(abc)){notice='ABC 曲谱需要包含 X: 编号和 K: 调号。';status(notice);return}
  }
  busy=true;updateButton();status('正在提交…');
  try{
    await api('/tools/yue2/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,style,lyrics,abc,workflow,...(window.JunafAppliedStyleProfile?.prompt===style&&workflow==='standard'?{styleProfileName:window.JunafAppliedStyleProfile.name}:{}),renderIntent:gpuPlan?.renderIntent||'melody',sourceConfirmed:workflow==='standard'||window.JunafYueCreation.reviewed()})});
    status('任务已提交，正在等待生成');
  }catch(error){notice=error.message;status(notice)}
  finally{busy=false;updateButton();await refresh()}
};
$('generate-form').addEventListener('invalid',event=>{
  notice=event.target.id==='style'?'声音方向至少填写 8 个字。':'原创歌词至少填写 8 个字。';
  status(notice);
},true);
for(const field of [$('style'),$('lyrics')])field.addEventListener('input',()=>{if(notice){notice='';status('准备就绪')}});
document.querySelectorAll('input[name="mode"]').forEach(field=>field.addEventListener('change',updateMode));
document.addEventListener('junaf-creation-change',updateMode);
updateMode();
refresh();setInterval(()=>{if(document.visibilityState==='visible')refresh()},5000);
})();
