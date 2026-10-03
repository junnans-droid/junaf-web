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
  const instrumental=selectedMode()==='instrumental';
  $('lyrics-field').hidden=instrumental;
  $('abc-field').hidden=!instrumental;
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
    head.append(title,badge);const time=document.createElement('time');time.textContent=new Date(job.createdAt).toLocaleString('zh-CN');article.append(head,time);
    if(job.error){const p=document.createElement('p');p.textContent=job.error;article.append(p)}
    if(job.status==='queued'&&!workerOnline){const p=document.createElement('p');p.textContent='生成服务器未开机，开机后会继续处理。';article.append(p)}
    if(job.audioAvailable){const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.crossOrigin='use-credentials';audio.src=BASE+'/tools/yue2/jobs/'+job.id+'/audio';article.append(audio);if(job.durationSeconds){const p=document.createElement('p');p.textContent='时长 '+Math.round(job.durationSeconds)+' 秒';article.append(p)}}
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
      else if(!workerOnline)status('生成服务器当前未开机。开机后此页面会自动恢复。');
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
  let abc='';
  const file=mode==='instrumental' ? $('abc-file').files[0] : null;
  if(file){
    if(!/\.(abc|txt)$/i.test(file.name)||file.size>32768){notice='请选择 32 KB 以下的 .abc 或 .txt 曲谱。';status(notice);return}
    try{abc=(await file.text()).replace(/^\uFEFF/,'').trim()}catch{notice='无法读取曲谱文件，请重新选择。';status(notice);return}
    if(!/^X:\s*\d+/m.test(abc)||!/^K:\s*\S+/m.test(abc)){notice='ABC 曲谱需要包含 X: 编号和 K: 调号。';status(notice);return}
  }
  busy=true;updateButton();status('正在提交…');
  try{
    await api('/tools/yue2/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,style,lyrics,abc})});
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
updateMode();
refresh();setInterval(()=>{if(document.visibilityState==='visible')refresh()},5000);
})();
