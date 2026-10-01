(()=>{'use strict';
const BASE=['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:3100/api':'https://api.junaf.com/api';
const $=id=>document.getElementById(id);
let busy=false, refreshing=false, jobs=[], workerOnline=false, canSubmit=false;

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
function updateButton(){const button=$('submit');button.disabled=busy||!canSubmit||!workerOnline;button.textContent=busy?'正在提交…':'生成音乐 ↗'}
function render(){
  const list=$('job-list');list.replaceChildren();
  if(!jobs.length){const empty=document.createElement('p');empty.textContent='还没有作品。写下一个方向，开始第一首。';list.append(empty);return}
  for(const job of jobs){
    const article=document.createElement('article');article.className='yue2-job';
    const head=document.createElement('div');head.className='yue2-job-head';
    const title=document.createElement('strong');title.textContent=job.style.length>46?job.style.slice(0,46)+'…':job.style;
    const badge=document.createElement('span');badge.textContent={queued:'等待中',running:'生成中',completed:'已完成',failed:'失败'}[job.status]||job.status;
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
      if(!canSubmit)status(data.adminOnly?'音乐生成正在内部测试':'音乐生成暂未开放');
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
  busy=true;updateButton();status('正在提交…');
  try{
    const style=$('style').value.trim(),lyrics=$('lyrics').value.trim();
    await api('/tools/yue2/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({style,lyrics})});
    status('任务已提交，正在等待生成');
  }catch(error){status(error.message)}
  finally{busy=false;updateButton();await refresh()}
};
refresh();setInterval(()=>{if(document.visibilityState==='visible')refresh()},5000);
})();
