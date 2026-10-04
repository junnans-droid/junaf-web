(() => {'use strict';
const origin=['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:3100':'https://api.junaf.com';
const $=s=>document.querySelector(s), works=$('#music-works'), player=$('#preview-player');
let all=[],forSale=new Map(),previewOnly=new Set();
const node=(tag,value='',className='')=>{const e=document.createElement(tag);e.textContent=value;e.className=className;return e;};
function render(){const q=$('#music-search').value.trim().toLocaleLowerCase(), genre=$('#music-genre').value;const list=all.filter(x=>(!genre||x.genre===genre)&&(!q||[x.title,x.artistName,x.genre].some(y=>String(y||'').toLocaleLowerCase().includes(q))));works.replaceChildren();
if(!list.length){works.append(node('p',all.length?'没有符合条件的作品。':'首批作品正在准备中。申请艺术家资格后即可投稿。','music-empty'));return;}
list.forEach((track,i)=>{const card=node('article','','music-work');const number=node('span',String(i+1).padStart(2,'0'),'music-work-number');const info=node('div','','music-work-info');info.append(node('span',`${track.genre} / ${track.creatorRole==='admin'?'JUNAF 官方':track.artistLevel||'艺术家'}`,'pack-meta'),node('h3',track.title),node('p',`${track.artistName}${track.description?' · '+track.description:''}`));const button=node('button',previewOnly.has(track.id)?'试听 30 秒 ↗':'播放作品 ↗','music-play');button.type='button';button.addEventListener('click',()=>{player.src=origin+track.audioUrl;$('#player-title').textContent=`${track.title} / ${track.artistName}`;$('#toggle-preview').disabled=false;player.play().catch(()=>{$('#player-title').textContent='播放失败，请重试';});});card.append(number,info,button);if(forSale.has(track.id)){const product=forSale.get(track.id),buy=node('a',`购买下载 ${`¥${(product.priceFen/100).toFixed(2)}`} ↗`,'music-text-link');buy.href=`/account/?work=${encodeURIComponent(track.id)}#music-purchases`;card.append(buy);}works.append(card);});}
const formatTime=value=>Number.isFinite(value)?`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`:'0:00';
function updatePlayer(){const duration=player.duration,current=player.currentTime||0,seek=$('#player-progress');
  $('#toggle-preview').textContent=player.paused?'▶':'Ⅱ';$('#toggle-preview').setAttribute('aria-label',player.paused?'播放':'暂停');
  $('#player-elapsed').textContent=formatTime(current);$('#player-duration').textContent=formatTime(duration);
  seek.disabled=!Number.isFinite(duration)||duration<=0;seek.value=seek.disabled?'0':String(Math.round(current/duration*1000));}
$('#music-search').addEventListener('input',render);$('#music-genre').addEventListener('change',render);
$('#toggle-preview').addEventListener('click',()=>{if(!player.src)return;if(player.paused)player.play().catch(()=>{$('#player-title').textContent='播放失败，请重试';});else player.pause();});
$('#player-progress').addEventListener('input',event=>{if(Number.isFinite(player.duration)&&player.duration>0)player.currentTime=Number(event.target.value)/1000*player.duration;});
$('#stop-preview').addEventListener('click',()=>{player.pause();player.removeAttribute('src');player.load();$('#toggle-preview').disabled=true;$('#player-title').textContent='选择一首作品开始聆听';updatePlayer();});
for(const event of ['loadedmetadata','durationchange','timeupdate','play','pause','ended'])player.addEventListener(event,updatePlayer);
Promise.all([fetch(`${origin}/api/music/works`,{signal:AbortSignal.timeout(12000)}).then(r=>r.json()),fetch(`${origin}/api/music/purchases/catalog`,{signal:AbortSignal.timeout(12000)}).then(r=>r.json())]).then(([d,c])=>{if(!d.ok)throw Error(d.message||'作品目录暂不可用');all=d.works||[];forSale=new Map((c.products||[]).map(x=>[x.workId,x]));previewOnly=new Set(c.previewWorkIds||[]);const genres=[...new Set(all.map(x=>x.genre).filter(Boolean))].sort();for(const genre of genres){const opt=node('option',genre);opt.value=genre;$('#music-genre').append(opt);}$('#library-status').textContent=`${all.length} 首已发布作品`;render();}).catch(e=>{$('#library-status').textContent=e.message;render();});
})();
