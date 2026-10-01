(()=>{'use strict';
const button=document.getElementById('enter');
const status=document.getElementById('status');
const base=['localhost','127.0.0.1'].includes(location.hostname)
  ?'http://127.0.0.1:3100/api':'https://api.junaf.com/api';
button.addEventListener('click',async()=>{
  button.disabled=true;status.textContent='正在验证 JUNAF 登录…';
  try{
    const response=await fetch(base+'/tools/rvc-access/ticket',{
      method:'POST',credentials:'include',cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.message||'暂时无法进入工作台');
    if(!/^https:\/\/rvc\.junaf\.com\/_junaf_login\?ticket=[A-Za-z0-9_-]{43}$/.test(data.url))
      throw Error('工作台地址无效');
    location.assign(data.url);
  }catch(error){
    status.textContent=error.message;
    if(error.message.includes('登录')){
      const link=document.createElement('a');link.href='/account/?next=%2Ftools%2Frvc%2F';
      link.textContent=' 前往登录 ↗';status.append(link);
    }
    button.disabled=false;
  }
});
})();
