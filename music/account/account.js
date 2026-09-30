(() => {
  'use strict';
  const origin = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://127.0.0.1:3100' : 'https://api.junaf.com';
  const $ = selector => document.querySelector(selector);
  const message = value => { $('#account-message').textContent = value; };
  const orderStatus = {awaiting_payment: '待付款', submitted: '已提交付款信息', provisional: '临时权益中',
    approving: '核款处理中', approved: '已核款', rejected: '审核未通过', needs_info: '需补充信息'};
  let selectedStore = null;
  let selectedOrder = null;
  let saleCatalog = null;
  let deviceId = localStorage.getItem('junaf_music_device');
  if (!/^[a-f0-9]{32}$/.test(deviceId || '')) {
    deviceId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte =>
      byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('junaf_music_device', deviceId);
  }
  async function request(path, method = 'GET', body) {
    const response = await fetch(`${origin}/api/auth${path}`, {
      method, credentials: 'include', cache: 'no-store',
      headers: body ? {'Content-Type': 'application/json'} : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw Error(data.message || '请求失败');
    return data;
  }
  async function shop(path, storeId, method = 'GET', body) {
    const response = await fetch(`${origin}/api/music/shop/web${path}?storeId=${encodeURIComponent(storeId)}`, {
      method, credentials: 'include', cache: 'no-store',
      headers: {'X-Device-Id': deviceId, ...(body ? {'Content-Type': 'application/json'} : {})},
      body: body ? JSON.stringify({...body, storeId}) : undefined,
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw Error(data.message || '门店数据暂不可用');
    return data;
  }
  function showCheckout(order) {
    selectedOrder = order;
    const payment = saleCatalog?.payment;
    $('#checkout').hidden = !payment || !['awaiting_payment', 'needs_info'].includes(order.status);
    if ($('#checkout').hidden) return;
    $('#checkout-title').textContent = `${order.product.name} · ¥${(order.product.priceFen / 100).toFixed(2)}`;
    $('#payment-instructions').textContent = `${payment.payee} · ${payment.instructions}。请确认金额与收款方后付款，再提交交易单号后6位。`;
    $('#payment-qr').src = payment.qrUrl;
    $('#payment-qr').hidden = false;
    $('#checkout').scrollIntoView({behavior: 'smooth'});
  }
  function renderProducts(products) {
    const list = $('#product-list');
    list.replaceChildren();
    if (!saleCatalog?.salesEnabled) { list.textContent = '购买入口暂未开放'; return; }
    if (!products.length) { list.textContent = '音乐方案正在准备中'; return; }
    for (const product of products) {
      const card = document.createElement('article');
      card.className = 'product-card';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = product.name;
      const detail = document.createElement('span');
      detail.textContent = `¥${(product.priceFen / 100).toFixed(2)} · ${product.days}天 · ${product.maxDevices}台设备`;
      copy.append(title, detail);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '选择方案 →';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const response = await shop('/orders', selectedStore.id, 'POST', {packId: product.packId});
          showCheckout(response.order);
          message('订单已创建，请核对收款方和金额');
        } catch (error) { message(error.message); }
        finally { button.disabled = false; }
      });
      card.append(copy, button);
      list.append(card);
    }
  }
  function renderRows(selector, rows, title, description, empty) {
    const list = $(selector);
    list.replaceChildren();
    if (!rows.length) { list.textContent = empty; return; }
    for (const row of rows) {
      const article = document.createElement('article');
      const heading = document.createElement('strong');
      heading.textContent = title(row);
      const detail = document.createElement('span');
      detail.textContent = description(row);
      article.append(heading, detail);
      list.append(article);
    }
  }
  async function showStore(store) {
    selectedStore = store;
    selectedOrder = null;
    $('#store-detail').hidden = false;
    $('#checkout').hidden = true;
    $('#detail-name').textContent = store.name;
    message('正在读取门店音乐数据…');
    try {
      const [state, orderData, catalogResponse] = await Promise.all([
        shop('/state', store.id), shop('/orders', store.id),
        fetch(`${origin}/api/music/shop/catalog`, {cache: 'no-store', signal: AbortSignal.timeout(10000)})
          .then(response => response.json())
      ]);
      saleCatalog = catalogResponse;
      renderRows('#grant-list', state.grants, row => row.packId,
        row => `${row.active ? '有效' : '已失效'} · ${row.devices.length}/${row.maxDevices} 设备`, '暂无音乐权益');
      renderRows('#order-list', orderData.orders, row => row.product?.name || row.id,
        row => `${orderStatus[row.status] || '处理中'} · ${row.id}`, '暂无订单');
      orderData.orders.forEach((order, index) => {
        if (!saleCatalog.salesEnabled || !['awaiting_payment', 'needs_info'].includes(order.status)) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '继续付款 →';
        button.addEventListener('click', () => showCheckout(order));
        $('#order-list').children[index].append(button);
      });
      renderRows('#device-list', state.devices, row => row.platform || row.channel || '设备',
        row => `${row.online ? '最近在线' : '离线'} · ${row.deviceId}`, '暂无连接设备');
      renderProducts(catalogResponse.products || []);
      message('门店音乐数据已更新');
    } catch (error) { message(error.message); }
  }
  function renderAccount(data) {
    $('#signed-out').hidden = true;
    $('#registration').hidden = true;
    $('#signed-in').hidden = false;
    $('#account-name').textContent = data.account.displayName || data.account.email;
    $('#admin-entry').hidden = data.isAdmin !== true;
    const list = $('#store-list');
    list.replaceChildren();
    for (const [index, store] of data.stores.entries()) {
      const card = document.createElement('article');
      card.className = 'store-card';
      const number = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('strong');
      name.textContent = store.name;
      const role = document.createElement('span');
      role.textContent = store.role === 'owner' ? '门店负责人' : '门店成员';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '查看音乐 →';
      button.addEventListener('click', () => showStore(store));
      card.append(number, name, role, button);
      list.append(card);
    }
    if (!data.stores.length) list.textContent = '暂未关联门店';
    message('已登录 JUNAF');
  }
  async function showSignedOut() {
    $('#signed-in').hidden = true;
    $('#store-detail').hidden = true;
    $('#signed-out').hidden = false;
    try {
      const config = await request('/config');
      $('#registration').hidden = !config.registrationEnabled;
    } catch { $('#registration').hidden = true; }
  }
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      const form = new FormData(event.currentTarget);
      renderAccount(await request('/login', 'POST', Object.fromEntries(form)));
      event.currentTarget.reset();
    } catch (error) { message(error.message); }
    finally { button.disabled = false; }
  });
  $('#register-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      const form = new FormData(event.currentTarget);
      renderAccount(await request('/register', 'POST', Object.fromEntries(form)));
      event.currentTarget.reset();
    } catch (error) { message(error.message); }
    finally { button.disabled = false; }
  });
  $('#logout').addEventListener('click', async () => {
    try { await request('/logout', 'POST'); await showSignedOut(); message('已退出登录'); }
    catch (error) { message(error.message); }
  });
  $('#payment-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!selectedStore || !selectedOrder) return;
    const button = event.submitter;
    button.disabled = true;
    try {
      const form = new FormData(event.currentTarget);
      const paymentRef = String(form.get('paymentRef') || '').trim();
      if (!/^[0-9]{6}$/.test(paymentRef)) throw Error('请输入交易单号后6位数字');
      const result = await shop(`/orders/${encodeURIComponent(selectedOrder.id)}/payment`,
        selectedStore.id, 'POST', {paymentRef, paidAt: form.get('paidAt'), confirmPayment: true});
      $('#checkout').hidden = true;
      event.currentTarget.reset();
      await showStore(selectedStore);
      message(result.trialExpiresAt ? '付款信息已提交，临时权益已生效；等待人工核款' :
        result.collisionFlag ? '交易尾号重复，临时权益暂缓；等待人工核对' : '付款信息已提交，等待人工核款');
    } catch (error) { message(error.message); }
    finally { button.disabled = false; }
  });
  request('/me').then(renderAccount).catch(async () => {
    await showSignedOut();
    message('请使用 JUNAF 账号登录');
  });
})();
