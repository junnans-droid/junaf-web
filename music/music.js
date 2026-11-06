(() => {'use strict';
const origin=['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:3100':'https://api.junaf.com';
const $=s=>document.querySelector(s), works=$('#music-works');
let all=[],forSale=new Map();
const node=(tag,value='',className='')=>{const e=document.createElement(tag);e.textContent=value;e.className=className;return e;};
function render(){const q=$('#music-search').value.trim().toLocaleLowerCase(),genre=$('#music-genre').value;const list=all.filter(x=>(!genre||x.genre===genre)&&(!q||[x.title,x.artistName,x.genre].some(y=>String(y||'').toLocaleLowerCase().includes(q))));works.replaceChildren();
if(!list.length){works.append(node('p',all.length?'没有符合条件的作品。':'正式作品发布后将在这里显示。','music-empty'));return;}
const selected=new URLSearchParams(location.search).get('work');
list.forEach((track,i)=>{const card=node('article','','music-work');card.id='work-'+track.id;const number=node('span',String(i+1).padStart(2,'0'),'music-work-number'),info=node('div','','music-work-info');info.append(node('span',`${track.genre} / ${track.creatorRole==='admin'?'JUNAF 官方':track.artistLevel||'艺术家'}`,'pack-meta'),node('h3',track.title),node('p',`${track.artistName}${track.description?' · '+track.description:''}`));card.append(number,info);
if(track.playerUrl&&track.listenStatus==='published'){const listen=node('a','进入聆听 ↗','music-play');listen.href=track.playerUrl;card.append(listen);}else card.append(node('span','暂未开放在线聆听','music-text-link'));
if(forSale.has(track.id)){const product=forSale.get(track.id),buy=node('a',`购买下载 ¥${(product.priceFen/100).toFixed(2)} ↗`,'music-text-link');buy.href=`/account/?work=${encodeURIComponent(track.id)}#music-purchases`;card.append(buy);}else card.append(node('span','暂未开放购买','music-text-link'));
works.append(card);if(selected===track.id){card.tabIndex=-1;card.style.outline='1px solid #df4b2d';queueMicrotask(()=>{card.scrollIntoView({block:'center'});});}});}
$('#music-search').addEventListener('input',render);$('#music-genre').addEventListener('change',render);
Promise.all([fetch(`${origin}/api/music/works`,{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(r=>r.json()),fetch(`${origin}/api/music/purchases/catalog`,{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(r=>r.json())]).then(([d,c])=>{if(!d.ok)throw Error(d.message||'作品目录暂不可用');all=d.works||[];forSale=new Map((c.products||[]).map(x=>[x.workId,x]));const genres=[...new Set(all.map(x=>x.genre).filter(Boolean))].sort();for(const genre of genres){const opt=node('option',genre);opt.value=genre;$('#music-genre').append(opt);}$('#library-status').textContent=`${all.length} 首作品 · 与 JUNAF Player 共用作品库`;render();}).catch(e=>{$('#library-status').textContent=e.message;render();});
})();
