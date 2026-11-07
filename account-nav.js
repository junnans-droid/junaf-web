(()=>{'use strict';if(window.JunafAccountNav)return;
 const host=document.querySelector('[data-junaf-account]');if(!host)return;
 let user=null,csrf='',busy=false,version=0;
 const profile=value=>{if(!value)return null;const {unread,...rest}=value;return rest};
 const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el};
 const next=location.pathname+location.search+location.hash;
 const loginURL='/account/?next='+encodeURIComponent(next);
 const login=make('a','登录','junaf-account-trigger');login.href=loginURL;login.setAttribute('aria-label','登录 JUNAF');
 const trigger=make('button',null,'junaf-account-trigger');trigger.type='button';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','junaf-account-panel');
 const panel=make('div',null,'junaf-account-panel');panel.id='junaf-account-panel';panel.hidden=true;
 const notice=make('p','','junaf-account-message');notice.setAttribute('role','status');
 function close(focus=false){panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus()}
 function updateNotices(){
  if(!user)return;
  const unread=user.unread?.count||0,latest=user.unread?.latestId,count=unread>99?'99+':String(unread);
  badge.hidden=!unread;badge.textContent=count;
  trigger.setAttribute('aria-label','账号：'+(user.displayName||'我的账号')+(unread?'，'+count+' 条未读通知':''));
  inbox.href='/account/notices'+(latest?'?notice='+encodeURIComponent(latest):'');
  inbox.textContent=unread?'新消息 · '+count+' 条未读':'站内通知';
 }
 const badge=make('mark',null,'junaf-unread');badge.setAttribute('aria-hidden','true');
 const inbox=make('a','站内通知');
 function render(){close();host.replaceChildren();if(!user){host.append(login);return}trigger.replaceChildren(make('i',null,'junaf-account-dot'),make('span',user.displayName||'我的账号'),badge,make('b','⌄'));trigger.setAttribute('aria-label','账号：'+(user.displayName||'我的账号'));panel.replaceChildren(make('strong',user.displayName),make('small',user.email),inbox);updateNotices();for(const [label,href] of [['个人中心','/account/'],['我的音乐库','/account/library'],['订单与已购作品','/account/orders'],['账户与安全','/account/#security'],...(user.artistAccess?[[user.role==='admin'&&!user.artist?.hasArtistProfile?'艺术家管理':'艺术家中心'+(user.artist?.level?' · '+user.artist.level:''),'/artist/']]:[]),...(user.role==='admin'?[['作品管理','/player/admin']]:[])]){const a=make('a',label);a.href=href;panel.append(a)}const logout=make('button','退出登录');logout.type='button';logout.addEventListener('click',()=>signOut(logout));panel.append(logout,notice);host.append(trigger,panel)}
 async function refresh(){if(busy||document.hidden)return;busy=true;const request=++version;try{const response=await fetch('/player/api/auth/me',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const data=await response.json();if(request!==version)return;csrf=data.csrf||'';const changed=JSON.stringify(profile(user))!==JSON.stringify(profile(data.user));user=data.user||null;if(changed||!host.childElementCount)render();else updateNotices();notice.textContent='';}catch{host.dataset.connection='unavailable';}finally{busy=false}}
 async function signOut(button){if(button.getAttribute('aria-disabled')==='true')return;button.setAttribute('aria-disabled','true');notice.textContent='';try{const me=await fetch('/player/api/auth/me',{credentials:'same-origin',cache:'no-store'});if(!me.ok)throw Error();const state=await me.json();const response=await fetch('/player/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':state.csrf||''},body:'{}'});if(!response.ok)throw Error();version++;user=null;csrf='';render();try{localStorage.setItem('junaf-account-signal',String(Date.now()))}catch{}window.dispatchEvent(new Event('junaf:account-changed'));}catch{notice.textContent='退出未完成，请重试。';button.setAttribute('aria-disabled','false')}}
 trigger.addEventListener('click',()=>{const open=panel.hidden;panel.hidden=!open;trigger.setAttribute('aria-expanded',String(open));});
 document.addEventListener('click',e=>{if(!host.contains(e.target))close()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)close(true)});host.addEventListener('focusout',()=>setTimeout(()=>{if(!host.contains(document.activeElement))close()},0));
 window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);window.addEventListener('storage',e=>{if(e.key==='junaf-account-signal')refresh()});document.addEventListener('visibilitychange',refresh);window.addEventListener('junaf:account-changed',refresh);setInterval(refresh,60000);window.JunafAccountNav={refresh};render();void refresh();
})();
