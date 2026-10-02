'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const createRouter=require('../video-publishing');
const token='v'.repeat(43),hash=crypto.createHash('sha256').update(token).digest('hex');
const video=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftyp'),Buffer.alloc(120)]);
test('video upload requires approved artist, enforces separate daily quota and exempts admin',async()=>{
  const previous={...process.env},folder=fs.mkdtempSync(path.join(os.tmpdir(),'junaf-video-test-'));process.env.JUNAF_VIDEO_UPLOAD_DIR=folder;process.env.JUNAF_ADMIN_EMAIL='admin@example.com';
  let current={_id:'person',emailLower:'person@example.com',status:'active'},artist=null,count=0;const rows=[];
  const db={collection(name){if(name==='junaf_sessions')return{findOne:async q=>q._id===hash?{accountId:current._id}:null};if(name==='customer_accounts')return{findOne:async()=>current};if(name==='junaf_artists')return{findOne:async()=>artist};if(name==='junaf_video_works')return{insertOne:async x=>rows.push(x),findOne:async q=>rows.find(x=>x._id===q._id)};if(name==='junaf_artist_daily_video_uploads')return{updateOne:async(q,u)=>{if(u.$setOnInsert)return{matchedCount:1};if(q.count?.$lt!==undefined){if(count>=q.count.$lt)return{matchedCount:0};count++;return{matchedCount:1};}count+=u.$inc.count;return{matchedCount:1};}};throw Error(name);}};
  const app=express();app.use('/api/video',createRouter(db));const server=app.listen(0,'127.0.0.1');
  try{await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/video`;const upload=()=>fetch(base+'/works',{method:'PUT',headers:{Cookie:`junaf_session=${token}`,'Content-Type':'video/mp4','X-Video-Title':'Test','X-Video-Category':'Short','Content-Length':String(video.length)},body:video});
    assert.equal((await upload()).status,403);artist={name:'Artist',level:'A1',status:'approved',dailyVideoLimit:3};for(let i=0;i<3;i++)assert.equal((await upload()).status,201);assert.equal((await upload()).status,429);assert.equal(count,3);assert.equal(rows.length,3);
    current={_id:'admin',emailLower:'admin@example.com',status:'active'};artist=null;assert.equal((await upload()).status,201);assert.equal(count,3);
    const stream=await fetch(base+'/works/'+rows[0]._id+'/file',{headers:{Cookie:`junaf_session=${token}`,Range:'bytes=0-11'}});assert.equal(stream.status,206);assert.equal((await stream.arrayBuffer()).byteLength,12);
  }finally{await new Promise(r=>server.close(r));fs.rmSync(folder,{recursive:true,force:true});process.env=previous;}
});
