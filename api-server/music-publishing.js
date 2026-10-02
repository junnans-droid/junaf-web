'use strict';
const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {pipeline} = require('node:stream/promises');
const {currentAccount} = require('./auth');
const MAX_AUDIO = 100 * 1024 * 1024;
const TYPES = {'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a'};
const clean = (x, max = 120) => String(x || '').trim().slice(0, max);
const admin = account => account?.emailLower === String(process.env.JUNAF_ADMIN_EMAIL || '').trim().toLowerCase() && !!process.env.JUNAF_ADMIN_EMAIL;
const owner = (a, b) => String(a) === String(b);
const publicTrack = t => ({id: t._id, title: t.title, artistName: t.artistName, artistLevel: t.artistLevel,
  genre: t.genre, description: t.description || '', createdAt: t.createdAt, publishedAt: t.publishedAt,
  status: t.status, audioUrl: `/api/music/works/${t._id}/audio`});
function validAudio(header, type) {
  if (type === 'audio/mpeg') return header.toString('ascii', 0, 3) === 'ID3' || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
  if (['audio/wav', 'audio/x-wav'].includes(type)) return header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE';
  if (type === 'audio/flac') return header.toString('ascii', 0, 4) === 'fLaC';
  if (['audio/mp4', 'audio/x-m4a'].includes(type)) return header.toString('ascii', 4, 8) === 'ftyp';
  return false;
}
module.exports = function createMusicPublishingRouter(db) {
  const router = express.Router();
  const artists = db.collection('junaf_artists');
  const works = db.collection('junaf_music_works');
  const usage = db.collection('junaf_artist_daily_uploads');
  const mediaRoot = process.env.JUNAF_MUSIC_UPLOAD_DIR || '/var/lib/junaf/music';
  async function identity(req, res, next) {
    try {req.account = await currentAccount(db, req); req.isAdmin = admin(req.account); next();}
    catch (e) {console.error('music auth:', e); res.status(503).json({ok:false,message:'账号验证暂不可用'});}
  }
  function login(req, res) {if (!req.account) {res.status(401).json({ok:false,message:'请先登录 JUNAF'}); return false;} return true;}
  function onlyAdmin(req, res) {if (!req.isAdmin) {res.status(403).json({ok:false,message:'需要管理员身份'}); return false;} return true;}
  router.get('/works', async (req, res) => {
    try {
      const query = {status:'published'};
      if (clean(req.query.genre, 40)) query.genre = clean(req.query.genre, 40);
      const q = clean(req.query.q, 80);
      if (q) query.$or = ['title','artistName','genre'].map(key => ({[key]: {$regex:q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),$options:'i'}}));
      const rows = await works.find(query).sort({publishedAt:-1}).limit(100).toArray();
      res.set('Cache-Control','public, max-age=30'); res.json({ok:true,works:rows.map(publicTrack)});
    } catch(e) {console.error('music works:',e); res.status(503).json({ok:false,message:'作品目录暂不可用'});}
  });
  router.get('/works/:id/audio', identity, async (req, res) => {
    try {
      if (!/^[a-f0-9]{32}$/.test(req.params.id)) return res.sendStatus(404);
      const track = await works.findOne({_id:req.params.id});
      if (!track || (track.status !== 'published' && !req.isAdmin && !owner(track.accountId,req.account?._id))) return res.sendStatus(404);
      const file = path.resolve(mediaRoot, track.fileName || '');
      if (!file.startsWith(path.resolve(mediaRoot)+path.sep)) return res.sendStatus(404);
      const stat = await fs.promises.stat(file);
      const range = req.get('range');
      let start = 0, end = stat.size - 1;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) return res.status(416).end();
        start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end;
        if (start > end || start >= stat.size) return res.status(416).end();
      }
      res.set({'Content-Type':track.mime,'Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Cache-Control':track.status==='published'?'public, max-age=3600':'private, no-store'});
      if (range) res.status(206).set('Content-Range',`bytes ${start}-${end}/${stat.size}`);
      fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
    } catch(e) {res.sendStatus(404);}
  });
  router.use(identity);
  router.get('/studio', async (req,res) => {
    if (!login(req,res)) return;
    try {
      const artist = await artists.findOne({_id:req.account._id});
      const tracks = await works.find({accountId:req.account._id}).sort({createdAt:-1}).limit(100).toArray();
      const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const used = await usage.findOne({_id:`${req.account._id}:${day}`});
      res.json({ok:true,isAdmin:req.isAdmin,artist:artist?{name:artist.name,bio:artist.bio,status:artist.status,level:artist.level||'A1',dailyLimit:artist.dailyLimit??3,reviewNote:artist.reviewNote||''}:null,usedToday:used?.count||0,works:tracks.map(publicTrack)});
    } catch(e) {res.status(503).json({ok:false,message:'工作室暂不可用'});}
  });
  router.post('/artist/apply',express.json({limit:'8kb'}),async(req,res)=>{
    if (!login(req,res)) return;
    const name=clean(req.body?.name,80),bio=clean(req.body?.bio,1000);
    if (name.length<2||bio.length<10) return res.status(400).json({ok:false,message:'请填写艺术家名称和至少10字简介'});
    try {
      const old=await artists.findOne({_id:req.account._id});
      if (old && ['pending','approved'].includes(old.status)) return res.status(409).json({ok:false,message:'已有申请或艺术家资格'});
      await artists.updateOne({_id:req.account._id},{$set:{name,bio,status:'pending',reviewNote:'',updatedAt:new Date()},$setOnInsert:{createdAt:new Date(),dailyLimit:3,level:'A1'}},{upsert:true});
      res.json({ok:true,message:'申请已提交'});
    } catch(e) {res.status(503).json({ok:false,message:'申请暂不可用'});}
  });
  router.put('/works',async(req,res)=>{
    if (!login(req,res)) return;
    const artist=await artists.findOne({_id:req.account._id});
    if (!req.isAdmin && artist?.status!=='approved') return res.status(403).json({ok:false,message:'请先申请并获得 JUNAF 艺术家资格'});
    const decoded = key => {try{return decodeURIComponent(req.get(key)||'');}catch{return '';}};
    const title=clean(decoded('X-Music-Title'),160),genre=clean(decoded('X-Music-Genre'),60),description=clean(decoded('X-Music-Description'),500);
    const mime=clean(req.get('Content-Type'),60).split(';')[0].toLowerCase();
    const length=Number(req.get('Content-Length'));
    if (!title||!genre||!TYPES[mime]||!Number.isSafeInteger(length)||length<128||length>MAX_AUDIO)
      return res.status(400).json({ok:false,message:'需要曲名、风格和 100MB 以内的 MP3/WAV/FLAC/M4A 文件'});
    const id=crypto.randomBytes(16).toString('hex'),fileName=`${id}.${TYPES[mime]}`;
    let reserved=false,day='',file='';
    try {
      if (!req.isAdmin) {
        day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        const key=`${req.account._id}:${day}`,limit=Math.max(0,Math.min(1000,Number(artist.dailyLimit??3)));
        await usage.updateOne({_id:key},{$setOnInsert:{count:0,accountId:req.account._id,day}},{upsert:true});
        const result=await usage.updateOne({_id:key,count:{$lt:limit}},{$inc:{count:1}});
        if (!result.matchedCount) return res.status(429).json({ok:false,message:`今天上传已达 ${limit} 首上限`});
        reserved=true;
      }
      await fs.promises.mkdir(mediaRoot,{recursive:true,mode:0o750});
      file=path.join(mediaRoot,fileName);
      let size=0,header=Buffer.alloc(0);
      const sink=fs.createWriteStream(file,{flags:'wx',mode:0o640});
      req.on('data',chunk=>{size+=chunk.length;if(header.length<12)header=Buffer.concat([header,chunk]).subarray(0,12);if(size>MAX_AUDIO)req.destroy();});
      await pipeline(req,sink);
      if (size!==length||!validAudio(header,mime)) throw Error('音频内容或大小无效');
      await works.insertOne({_id:id,accountId:req.account._id,title,genre,description,artistName:artist?.name||req.account.displayName||'JUNAF',artistLevel:artist?.level||'A1',status:'pending',fileName,mime,bytes:size,createdAt:new Date(),updatedAt:new Date()});
      res.status(201).json({ok:true,id,message:'作品已上传，等待发布审核'});
    } catch(e) {
      if (file) await fs.promises.unlink(file).catch(()=>{});
      if (reserved) await usage.updateOne({_id:`${req.account._id}:${day}`},{$inc:{count:-1}}).catch(()=>{});
      if (!res.headersSent) res.status(400).json({ok:false,message:e.message==='音频内容或大小无效'?e.message:'上传失败，请重试'});
    }
  });
  router.patch('/works/:id',express.json({limit:'8kb'}),async(req,res)=>{
    if (!login(req,res)) return;
    const track=await works.findOne({_id:req.params.id});
    if (!track||(!req.isAdmin&&!owner(track.accountId,req.account._id))) return res.sendStatus(404);
    const set={updatedAt:new Date()};
    for (const [key,max] of [['title',160],['genre',60],['description',500]]) if (req.body?.[key]!==undefined) set[key]=clean(req.body[key],max);
    if (!set.title && req.body?.title!==undefined || !set.genre && req.body?.genre!==undefined) return res.status(400).json({ok:false,message:'曲名与风格不能为空'});
    if (!req.isAdmin && track.status==='published') set.status='pending';
    await works.updateOne({_id:track._id},{$set:set}); res.json({ok:true});
  });
  router.get('/admin/artists',async(req,res)=>{if(!onlyAdmin(req,res))return;const rows=await artists.find({}).sort({updatedAt:-1}).limit(200).toArray();res.json({ok:true,artists:rows.map(a=>({id:String(a._id),name:a.name,bio:a.bio,status:a.status,level:a.level,dailyLimit:a.dailyLimit??3,reviewNote:a.reviewNote||''}))});});
  router.patch('/admin/artists/:id',express.json({limit:'8kb'}),async(req,res)=>{
    if(!onlyAdmin(req,res))return;
    const {ObjectId}=require('mongodb');let id;try{id=new ObjectId(req.params.id);}catch{return res.sendStatus(400);}
    const set={updatedAt:new Date()};
    if(req.body?.status!==undefined){if(!['approved','rejected','pending'].includes(req.body.status))return res.sendStatus(400);set.status=req.body.status;}
    if(req.body?.level!==undefined){if(!/^A[1-5]$/.test(req.body.level))return res.sendStatus(400);set.level=req.body.level;}
    if(req.body?.dailyLimit!==undefined){if(!Number.isInteger(req.body.dailyLimit)||req.body.dailyLimit<0||req.body.dailyLimit>1000)return res.sendStatus(400);set.dailyLimit=req.body.dailyLimit;}
    if(req.body?.reviewNote!==undefined)set.reviewNote=clean(req.body.reviewNote,500);
    const result=await artists.updateOne({_id:id},{$set:set});if(!result.matchedCount)return res.sendStatus(404);res.json({ok:true});
  });
  router.get('/admin/works',async(req,res)=>{if(!onlyAdmin(req,res))return;const rows=await works.find({}).sort({createdAt:-1}).limit(200).toArray();res.json({ok:true,works:rows.map(publicTrack)});});
  router.patch('/admin/works/:id',express.json({limit:'8kb'}),async(req,res)=>{
    if(!onlyAdmin(req,res))return;
    if(!['published','rejected','pending'].includes(req.body?.status))return res.sendStatus(400);
    const set={status:req.body.status,updatedAt:new Date()};if(set.status==='published')set.publishedAt=new Date();
    const result=await works.updateOne({_id:req.params.id},{$set:set});if(!result.matchedCount)return res.sendStatus(404);res.json({ok:true});
  });
  return router;
};
module.exports.validAudio=validAudio;
