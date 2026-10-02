'use strict';
const express = require('express');

const id = value => String(value ?? '');
const iso = value => value instanceof Date ? value.toISOString() : value || null;

module.exports = function createAdminRouter(db, requireAdmin) {
  const router = express.Router();
  router.use(requireAdmin);
  router.use((_req, res, next) => {res.set('Cache-Control', 'no-store'); next();});

  const fail = (res, error) => {
    console.error('JUNAF admin read:', error.message);
    res.status(503).json({ok: false, message: '管理数据暂不可用'});
  };

  router.get('/overview', async (_req, res) => {
    try {
      const [accounts, stores, packs, products, orders, pendingOrders, settings, publishedVideos] = await Promise.all([
        db.collection('customer_accounts').countDocuments({status: 'active'}),
        db.collection('stores').countDocuments({status: 'active'}),
        db.collection('local_basic_music_packs').countDocuments({status: 'published'}),
        db.collection('local_basic_purchase_products').countDocuments({enabled: true}),
        db.collection('local_basic_purchase_orders').countDocuments({}),
        db.collection('local_basic_purchase_orders').countDocuments({status: {$in: ['submitted', 'provisional', 'approving']}}),
        db.collection('local_basic_purchase_settings').findOne({_id: 'manual'}),
        db.collection('junaf_video_works').countDocuments({status:'published'})
      ]);
      res.json({ok: true, counts: {accounts, stores, publishedPacks: packs,
        enabledProducts: products, orders, pendingOrders, publishedVideos},
      switches: {registration: process.env.JUNAF_REGISTRATION_ENABLED === 'true',
        sales: process.env.JUNAF_SALES_ENABLED === 'true' && settings?.enabled === true},
      sections: {music: 'active', video: 'active', thinking: 'planned', tools: 'active'}});
    } catch (error) {fail(res, error);}
  });

  router.get('/music/packs', async (_req, res) => {
    try {
      const rows = await db.collection('local_basic_music_packs').find({})
        .sort({updatedAt: -1}).limit(100).toArray();
      res.json({ok: true, packs: rows.map(row => ({id: row.id || id(row._id),
        title: row.pack?.title || row.title || '未命名方案', status: row.status || 'draft',
        version: row.pack?.version || null, stages: Array.isArray(row.pack?.tracks) ? row.pack.tracks.length : 0,
        requiresPurchase: row.pack?.requiresPurchase === true,
        updatedAt: iso(row.updatedAt || row.createdAt)}))});
    } catch (error) {fail(res, error);}
  });

  router.get('/music/products', async (_req, res) => {
    try {
      const rows = await db.collection('local_basic_purchase_products').find({}).limit(100).toArray();
      res.json({ok: true, products: rows.map(row => ({id: id(row._id), packId: row.packId || id(row._id),
        name: row.name || '', priceFen: Number(row.priceFen || 0), days: Number(row.days || 0),
        maxDevices: Number(row.maxDevices || 0), enabled: row.enabled === true}))});
    } catch (error) {fail(res, error);}
  });

  router.get('/stores', async (_req, res) => {
    try {
      const rows = await db.collection('stores').find({}).sort({createdAt: -1}).limit(100).toArray();
      const storeIds = rows.map(row => row._id);
      const members = await db.collection('store_memberships').find({storeId: {$in: storeIds},
        role: 'owner', status: 'active'}).limit(300).toArray();
      const accountIds = members.map(member => member.accountId);
      const accounts = await db.collection('customer_accounts').find({_id: {$in: accountIds}})
        .project({_id: 1, email: 1}).limit(300).toArray();
      const emails = new Map(accounts.map(account => [id(account._id), account.email]));
      res.json({ok: true, stores: rows.map(row => ({id: id(row._id),
        name: row.name || row.storeName || '未命名门店', status: row.status || 'unknown',
        owners: members.filter(member => id(member.storeId) === id(row._id))
          .map(member => emails.get(id(member.accountId))).filter(Boolean),
        createdAt: iso(row.createdAt)}))});
    } catch (error) {fail(res, error);}
  });

  router.get('/accounts', async (_req, res) => {
    try {
      const rows = await db.collection('customer_accounts').find({})
        .project({email: 1, emailLower: 1, displayName: 1, status: 1, createdAt: 1})
        .sort({createdAt: -1}).limit(100).toArray();
      res.json({ok: true, accounts: rows.map(row => ({id: id(row._id),
        email: row.email || row.emailLower || '', name: row.displayName || '',
        status: row.status || 'unknown', createdAt: iso(row.createdAt)}))});
    } catch (error) {fail(res, error);}
  });

  router.get('/system', async (_req, res) => {
    try {
      await db.command({ping: 1});
      res.json({ok: true, database: 'connected',
        registrationEnabled: process.env.JUNAF_REGISTRATION_ENABLED === 'true',
        salesEnabled: process.env.JUNAF_SALES_ENABLED === 'true',
        mediaConfigured: !!(process.env.JUNAF_MEDIA_DIR && process.env.JUNAF_CONTENT_KEY_FILE)});
    } catch (error) {fail(res, error);}
  });
  return router;
};
