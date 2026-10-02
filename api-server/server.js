'use strict';
const express = require('express');
const {MongoClient} = require('mongodb');
const {publicPack, validatePack, downloadPreview} = require('./music');
const createAuthRouter = require('./auth');
const {currentAccount} = require('./auth');
const createCommerceIdentity = require('./commerce-identity');
const createMusicCommerce = require('./core/local-basic-commerce');
const createAdminRouter = require('./admin');
const createMetronomeRouter = require('./metronome');
const createJianpuRouter = require('./jianpu');
const createBookingRouter = require('./booking');
const createChatRouter = require('./chat');
const createYue2Routers = require('./yue2');
const createRvcAccessRouter = require('./rvc-access');
const createMusicPublishingRouter = require('./music-publishing');
const createVideoPublishingRouter = require('./video-publishing');
const createThinkingRouter = require('./thinking');

const uri = process.env.MONGO_URI;
if (!uri) throw Error('MONGO_URI 必须配置');
const port = Number(process.env.PORT || 3100);
const client = new MongoClient(uri, {serverSelectionTimeoutMS: 5000});
const db = client.db(process.env.DB_NAME || 'junaf');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use((req, res, next) => {
  const origin = req.get('Origin');
  const allowed = new Set(['https://junaf.com', 'https://www.junaf.com']);
  if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
  }
  if (origin && allowed.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  }
  res.set('Vary', 'Origin');
  res.set('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && !allowed.has(origin))
    return res.status(403).json({ok: false, message: '请求来源未获准'});
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Device-Id, X-Music-Title, X-Music-Genre, X-Music-Description, X-Video-Title, X-Video-Category, X-Video-Description');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(origin && !allowed.has(origin) ? 403 : 204).end();
  next();
});

app.use('/api/auth', createAuthRouter(db));
app.use('/api/tools/metronome', createMetronomeRouter(db));
app.use('/api/tools/jianpu', createJianpuRouter(db));
app.use('/api/tools/booking', createBookingRouter(db));
app.use('/api/tools/chat', createChatRouter(db));
const yue2 = createYue2Routers(db);
app.use('/api/tools/yue2', yue2.user);
app.use('/api/internal/yue2', yue2.worker);
app.use('/api/tools/rvc-access', createRvcAccessRouter(db));
app.use('/api/music', createMusicPublishingRouter(db));
app.use('/api/video', createVideoPublishingRouter(db));
app.use('/api/thinking', createThinkingRouter(db));

// Reuse the production order, provisional grant, device and audit rules.
// Only cookie-authenticated web endpoints are mounted. MusicAMC Token routes
// and admin routes remain unreachable until JUNAF-specific adapters are ready.
async function requireAdminAuth(req, res, next) {
    try {
      const email = String(process.env.JUNAF_ADMIN_EMAIL || '').trim().toLowerCase();
      const account = await currentAccount(db, req);
      if (!email || !account || account.emailLower !== email)
        return res.status(403).json({ok: false, message: '没有管理员权限'});
      req.admin = {username: account.emailLower, accountId: account._id};
      next();
    } catch (error) {
      console.error('JUNAF admin auth:', error.message);
      res.status(503).json({ok: false, message: '管理员验证暂不可用'});
    }
}
const commerce = createMusicCommerce({
  getDb: () => db,
  identity: createCommerceIdentity(db),
  requireAdminAuth
});
app.use('/api/admin', createAdminRouter(db, requireAdminAuth));
app.get('/api/music/shop/catalog', async (_req, res) => {
  try {
    const [settings, products] = await Promise.all([
      db.collection('local_basic_purchase_settings').findOne({_id: 'manual'}),
      db.collection('local_basic_purchase_products').find({enabled: true}).limit(100).toArray()
    ]);
    const salesEnabled = process.env.JUNAF_SALES_ENABLED === 'true' && settings?.enabled === true;
    res.set('Cache-Control', 'no-store');
    res.json({ok: true, salesEnabled, payment: salesEnabled ? {
        qrUrl: settings.qrUrl, payee: settings.payee || '', instructions: settings.instructions || ''
      } : null,
      products: products.map(({_id, ...product}) => product)});
  } catch (error) {
    console.error('JUNAF shop catalog:', error.message);
    res.status(503).json({ok: false, message: '商品目录暂不可用'});
  }
});
app.use('/api/music/shop', express.json({limit: '32kb'}), (req, res, next) => {
  if (req.method === 'GET' && /^\/web\/(state|orders)$/.test(req.path)) return next();
  if (process.env.JUNAF_SALES_ENABLED === 'true' && req.method === 'POST'
    && /^\/web\/orders(?:\/[^/]+\/payment)?$/.test(req.path)) return next();
  res.status(404).json({ok: false, message: '接口不存在'});
}, commerce.player);
app.use('/api/admin/music/shop', express.json({limit: '32kb'}), (req, res, next) => {
  if (req.method === 'GET' && (
    req.path === '/workbench' || req.path === '/orders'
    || /^\/orders\/[^/]+\/audit$/.test(req.path))) return next();
  if (req.method === 'POST' && /^\/orders\/[^/]+\/review$/.test(req.path)) return next();
  res.status(404).json({ok: false, message: '接口不存在'});
}, commerce.admin);

app.get('/api/health', async (_req, res) => {
  try {
    await db.command({ping: 1});
    res.json({ok: true, service: 'junaf-api'});
  } catch {
    res.status(503).json({ok: false, message: '数据库暂不可用'});
  }
});

app.get('/api/music/catalog', async (_req, res) => {
  try {
    const rows = await db.collection('local_basic_music_packs')
      .find({status: 'published'}).limit(100).toArray();
    const packs = rows.map(row => publicPack(row.pack));
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ok: true, packs});
  } catch (error) {
    console.error('JUNAF catalog:', error);
    res.status(503).json({ok: false, message: '曲库暂不可用'});
  }
});

app.get('/api/music/packs/:id/preview/:stage', async (req, res) => {
  try {
    const {id} = req.params;
    const stage = Number(req.params.stage);
    if (!/^[-a-z0-9]{1,64}$/.test(id) || !Number.isInteger(stage) || stage < 1 || stage > 5)
      return res.status(400).json({ok: false, message: '试听参数无效'});
    const row = await db.collection('local_basic_music_packs').findOne({id, status: 'published'});
    if (!row) return res.status(404).json({ok: false, message: '音乐方案不存在'});
    const pack = validatePack(row.pack);
    const preview = pack.tracks.find(track => track.stage === stage).preview;
    const audio = await downloadPreview(preview);
    res.set({'Content-Type': 'audio/mpeg', 'Content-Length': String(audio.length),
      'Cache-Control': 'private, max-age=300'});
    res.send(audio);
  } catch (error) {
    console.error('JUNAF preview:', error.message);
    res.status(503).json({ok: false, message: '试听暂不可用'});
  }
});

async function start() {
  await client.connect();
  await db.command({ping: 1});
  await Promise.all([
    db.collection('customer_accounts').createIndex({emailLower: 1}, {unique: true}),
    db.collection('junaf_sessions').createIndex({expiresAt: 1}, {expireAfterSeconds: 0}),
    db.collection('junaf_login_security').createIndex({expiresAt: 1}, {expireAfterSeconds: 0}),
    db.collection('junaf_registration_security').createIndex({expiresAt: 1}, {expireAfterSeconds: 0}),
    db.collection('junaf_email_rate_limits').createIndex({expiresAt: 1}, {expireAfterSeconds: 0}),
    db.collection('junaf_email_verifications').createIndex({expiresAt: 1}, {expireAfterSeconds: 0}),
    db.collection('junaf_password_resets').createIndex({expiresAt: 1}, {expireAfterSeconds: 0}),
    db.collection('junaf_metronome_sessions').createIndex({accountId: 1, updatedAt: -1}),
    db.collection('junaf_jianpu_scores').createIndex({accountId:1,updatedAt:-1}),
    db.collection('junaf_jianpu_audio').createIndex({accountId:1,scoreId:1}),
    db.collection('junaf_booking_bookings').createIndex({accountId:1,eventStart:1,status:1}),
    db.collection('junaf_booking_projects').createIndex({accountId:1,bookingId:1},
      {unique:true,partialFilterExpression:{bookingId:{$type:'objectId'}}}),
    db.collection('junaf_booking_schedule').createIndex({accountId:1,startAt:1}),
    db.collection('junaf_booking_payments').createIndex({accountId:1,dueDate:1}),
    db.collection('junaf_booking_contacts').createIndex({accountId:1,name:1}),
    db.collection('junaf_booking_tasks').createIndex({accountId:1,dueAt:1}),
    db.collection('junaf_yue2_jobs').createIndex({accountId:1,createdAt:-1}),
    db.collection('junaf_yue2_jobs').createIndex({status:1,createdAt:1}),
    db.collection('junaf_rvc_tickets').createIndex({expiresAt:1},{expireAfterSeconds:0}),
    db.collection('junaf_rvc_sessions').createIndex({expiresAt:1},{expireAfterSeconds:0}),
    db.collection('junaf_music_works').createIndex({status:1,publishedAt:-1}),
    db.collection('junaf_music_works').createIndex({accountId:1,createdAt:-1}),
    db.collection('junaf_artists').createIndex({status:1,updatedAt:-1}),
    db.collection('junaf_video_works').createIndex({status:1,publishedAt:-1}),
    db.collection('junaf_video_works').createIndex({accountId:1,createdAt:-1}),
    db.collection('junaf_thinking_posts').createIndex({status:1,publishedAt:-1}),
    db.collection('junaf_thinking_posts').createIndex({accountId:1,updatedAt:-1})
  ]);
  const server = app.listen(port, '127.0.0.1', () => console.log(`JUNAF API listening on 127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    server.close(() => client.close().finally(() => process.exit(0)));
  });
}
start().catch(error => {console.error('JUNAF API startup failed:', error.message); process.exit(1);});
