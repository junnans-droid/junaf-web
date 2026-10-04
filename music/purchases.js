(() => {'use strict';
const origin=['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:3100':'https://api.junaf.com';
const $=s=>document.querySelector(s),base=`${origin}/api/music/purchases`;
const note=text=>{$('#purchase-message').textContent=text;};
const node=(tag,text='')=>{const element=document.createElement(tag);element.textContent=text;return element;};
const money=value=>`¥${(value/100).toFixed(2)}`;
const statuses={awaiting_payment:'待付款',submitted:'等待人工核款',approved:'已核款，可下载',rejected:'未通过'};
let catalog=null,selected=null;
async function api(path,method='GET',body){const r=await fetch(base+path,{method,credentials:'include',cache:'no-store',
  headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const data=await r.json();if(!r.ok||!data.ok)throw Error(data.message||'音乐订单暂不可用');return data;}
function checkout(order){selected=order;const config=catalog?.payment;
  if(!config||order.status!=='awaiting_payment')return;
  $('#purchase-checkout-title').textContent=`${order.title} · ${money(order.priceFen)}`;
  $('#purchase-payee').textContent=`收款方：${config.payee}`;
  $('#purchase-instructions').textContent=config.instructions||'请核对收款方与金额，付款后提交交易信息。';
  $('#purchase-qr').src=config.qrUrl;$('#purchase-checkout').hidden=false;
  $('#purchase-checkout').scrollIntoView({behavior:'smooth'});
}
async function render(){if($('#signed-in').hidden)return;
  const [c,o]=await Promise.all([api('/catalog'),api('/orders')]);catalog=c;
  const products=$('#purchase-products'),orders=$('#purchase-orders');products.replaceChildren();orders.replaceChildren();
  if(!c.salesEnabled||!c.products.length)products.append(node('p','当前没有开放购买的作品；已发布音乐仍可在 Music 页面聆听。'));
  for(const product of c.products){const card=node('article'),title=node('strong',`${product.title} / ${product.artistName}`),price=node('span',money(product.priceFen)),button=node('button','购买作品 →');
    card.className='product-card';button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{
      const result=await api('/orders','POST',{workId:product.workId});
      if(result.order.status==='approved'){note('这首作品已购买，请到订单中下载。');await render();}
      else if(result.order.status==='submitted'){note('订单已提交付款信息，等待人工核款。');await render();}
      else{await render();checkout(result.order);note('订单已创建，请确认收款方和金额。');}
    }catch(e){note(e.message);}finally{button.disabled=false;}});card.append(title,price,button);products.append(card);}
  function renderOrders(){orders.replaceChildren();if(!o.orders.length){orders.append(node('p','暂无作品订单。'));return;}
    for(const order of o.orders){const card=node('article'),title=node('strong',`${order.title} / ${order.artistName}`),detail=node('span',`${money(order.priceFen)} · ${statuses[order.status]||order.status} · ${order.id}`);
      card.className='product-card';card.append(title,detail);
      if(order.status==='approved'){const link=node('a','下载原始音频 ↗');link.href=`${base}/orders/${encodeURIComponent(order.id)}/download`;card.append(link);}
      if(order.status==='awaiting_payment'&&c.salesEnabled){const button=node('button','继续付款 →');button.type='button';button.addEventListener('click',()=>checkout(order));card.append(button);}
      if(order.note)card.append(node('p',order.note));orders.append(card);}}
  renderOrders();
  const target=new URLSearchParams(location.search).get('work');
  if(target&&/^[a-f0-9]{32}$/.test(target)){const item=c.products.find(x=>x.workId===target);if(item){note(`已定位作品：${item.title}`);$('#music-purchases').scrollIntoView();}}
}
$('#purchase-form').addEventListener('submit',async event=>{event.preventDefault();if(!selected)return;
  const button=event.submitter;button.disabled=true;try{const form=new FormData(event.currentTarget);
    await api(`/orders/${encodeURIComponent(selected.id)}/payment`,'POST',{paymentRef:String(form.get('paymentRef')).trim(),paidAt:new Date(form.get('paidAt')).toISOString()});
    $('#purchase-checkout').hidden=true;event.currentTarget.reset();await render();note('付款信息已提交，等待人工核款。');
  }catch(e){note(e.message);}finally{button.disabled=false;}});
window.addEventListener('junaf:account-ready',()=>render().catch(e=>note(e.message)));
})();
