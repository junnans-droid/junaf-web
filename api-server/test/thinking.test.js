'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express');
const createRouter=require('../thinking');
const token='t'.repeat(43),hash=crypto.createHash('sha256').update(token).digest('hex');
test('thinking drafts stay private; artists submit three per day; admin is unlimited',async()=>{
  const previous={...process.env};process.env.JUNAF_ADMIN_EMAIL='admin@example.com';
  let current={_id:'person',emailLower:'person@example.com',status:'active'},artist=null,count=0;const rows=[];
  const db={collection(name){if(name==='junaf_sessions')return{findOne:async q=>q._id===hash?{accountId:current._id}:null};if(name==='customer_accounts')return{findOne:async()=>current};if(name==='junaf_artists')return{findOne:async()=>artist};if(name==='junaf_thinking_posts')return{insertOne:async p=>{rows.push(p);},findOne:async q=>rows.find(p=>p._id===q._id),updateOne:async(q,u)=>{const p=rows.find(x=>x._id===q._id&&(!q.status||x.status===q.status));if(!p)return{matchedCount:0};Object.assign(p,u.$set);return{matchedCount:1};}};if(name==='junaf_artist_daily_thinking_posts')return{updateOne:async(q,u)=>{if(u.$setOnInsert)return{matchedCount:1};if(q.count?.$lt!==undefined){if(count>=q.count.$lt)return{matchedCount:0};count++;return{matchedCount:1};}count+=u.$inc.count;return{matchedCount:1};}};throw Error(name);}};
  const app=express();app.use('/api/thinking',createRouter(db));const server=app.listen(0,'127.0.0.1');
  try{await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/thinking`,headers={Cookie:`junaf_session=${token}`,'Content-Type':'application/json'};
    const create=()=>fetch(base+'/posts',{method:'POST',headers,body:JSON.stringify({title:'A thought',category:'Observation',body:'A thoughtful paragraph about design and the city.'})});
    assert.equal((await create()).status,403);artist={name:'Artist',level:'A1',status:'approved',dailyThinkingLimit:3};
    for(let i=0;i<4;i++)assert.equal((await create()).status,201);assert.equal(rows.length,4);
    assert.equal((await fetch(base+'/posts/'+rows[0]._id)).status,404);
    for(let i=0;i<3;i++)assert.equal((await fetch(base+'/posts/'+rows[i]._id+'/submit',{method:'POST',headers})).status,200);
    assert.equal((await fetch(base+'/posts/'+rows[3]._id+'/submit',{method:'POST',headers})).status,429);assert.equal(count,3);
    current={_id:'admin',emailLower:'admin@example.com',status:'active'};artist=null;const a=await create();assert.equal(a.status,201);const created=await a.json();assert.equal((await fetch(base+'/posts/'+created.id+'/submit',{method:'POST',headers})).status,200);assert.equal(count,3);
  }finally{await new Promise(r=>server.close(r));process.env=previous;}
});
