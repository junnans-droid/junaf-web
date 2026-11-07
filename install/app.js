(() => {
 if('serviceWorker' in navigator)navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
 const button=document.querySelector('#install-button');
 if(!button)return;
 const status=document.querySelector('#install-status');
 const standalone=matchMedia('(display-mode: standalone)');
 const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const device=ios?'ios':/Android/i.test(navigator.userAgent)?'android':'desktop';
 document.getElementById(device).dataset.current='true';
 let prompt;
 const showInstalled=()=>{
  button.hidden=true;
  status.textContent='你已在 JUNAF 网页应用中。';
 };
 if(standalone.matches||navigator.standalone)showInstalled();
 window.addEventListener('beforeinstallprompt',event=>{
  if(standalone.matches||navigator.standalone)return;
  event.preventDefault();
  prompt=event;
  button.hidden=false;
 });
 button.addEventListener('click',async()=>{
  const current=prompt;
  if(!current)return;
  prompt=null;
  button.hidden=true;
  try{
   await current.prompt();
   const {outcome}=await current.userChoice;
   if(outcome==='accepted')status.textContent='已确认安装，请在设备的应用列表中打开 JUNAF。';
   else status.textContent='可随时通过浏览器菜单再次安装。';
  }catch{
   status.textContent='请通过浏览器菜单安装 JUNAF。';
  }
 });
 window.addEventListener('appinstalled',showInstalled);
 standalone.addEventListener?.('change',event=>{if(event.matches)showInstalled()});
})();
