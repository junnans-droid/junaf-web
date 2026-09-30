(() => {
  'use strict';
  const origin = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://127.0.0.1:3100' : 'https://api.junaf.com';
  const $ = selector => document.querySelector(selector);
  const message = text => { $('#admin-message').textContent = text; };
  const statusText = {awaiting_payment: '待付款', submitted: '待核款', provisional: '临时权益中',
    approving: '核款处理中', approved: '已核款', rejected: '已拒绝', needs_info: '需补充信息'};
  async function request(path, method = 'GET', body) {
    const response = await fetch(`${origin}/api/admin/music/shop${path}`, {
      method, credentials: 'include', cache: 'no-store',
      headers: body ? {'Content-Type': 'application/json'} : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw Object.assign(Error(data.message || '请求失败'), {status: response.status});
    return data;
  }
  function node(tag, content, className) {
    const result = document.createElement(tag);
    result.textContent = content || '';
    if (className) result.className = className;
    return result;
  }
  function field(form, labelText, name, type = 'text') {
    const label = node('label', labelText);
    const input = document.createElement('input');
    input.name = name;
    input.type = type;
    label.append(input);
    form.append(label);
    return input;
  }
  function renderOrder(order) {
    const card = node('article', '', 'order-card');
    const info = node('div');
    info.append(node('h3', order.product?.name || order.id));
    info.append(node('p', `${order.accountEmail || order.storeName || order.storeId || '用户'} · ${statusText[order.status] || order.status}`));
    info.append(node('p', `订单 ${order.id} · 应收 ¥${((order.product?.priceFen || 0) / 100).toFixed(2)}`));
    info.append(node('p', `用户提交的付款时间：${order.paidAt || '未提交'} · 交易尾号：${order.paymentRef || '未提交'}`));
    if (order.collisionFlag) info.append(node('p', '交易尾号与同日其他订单重复，需要核对完整交易单号。'));
    card.append(info);
    const form = node('form');
    const actionLabel = node('label', '处理方式');
    const action = document.createElement('select');
    action.name = 'action';
    for (const [value, label] of [['approve', '确认到账，发放正式权益'],
      ['needs_info', '要求补充信息'], ['reject', '审核不通过']]) {
      const option = node('option', label);
      option.value = value;
      action.append(option);
    }
    actionLabel.append(action);
    form.append(actionLabel);
    const amount = field(form, '确认到账金额（元）', 'amount', 'number');
    amount.min = '0.01'; amount.step = '0.01';
    const fullId = field(form, '完整微信交易单号（撞号时填写）', 'fullTransactionId');
    const noteLabel = node('label', '审核说明');
    const note = document.createElement('textarea');
    note.name = 'note';
    noteLabel.append(note);
    form.append(noteLabel);
    const updateFields = () => {
      amount.required = action.value === 'approve';
      fullId.required = action.value === 'approve' && order.collisionFlag === true;
      note.required = action.value !== 'approve';
    };
    action.addEventListener('change', updateFields);
    updateFields();
    const submit = node('button', '提交审核 →');
    submit.type = 'submit';
    form.append(submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const selectedAction = action.value;
      const confirmedFen = Math.round(Number(amount.value) * 100);
      if (selectedAction === 'approve') {
        if (confirmedFen !== order.product.priceFen) {
          message('确认金额必须与订单金额一致'); return;
        }
        if (!window.confirm('请确认你已在实际收款记录中核对到账、金额和交易信息。确认后将发放正式权益。')) return;
      }
      submit.disabled = true;
      try {
        await request(`/orders/${encodeURIComponent(order.id)}/review`, 'POST', {
          action: selectedAction, confirmedFen, fullTransactionId: fullId.value.trim(), note: note.value.trim()
        });
        await refresh();
        message('订单审核已保存');
      } catch (error) { message(error.message); }
      finally { submit.disabled = false; }
    });
    card.append(form);
    return card;
  }
  async function refresh() {
    message('正在读取待核款订单…');
    try {
      const data = await request('/workbench');
      $('#admin-login').hidden = true;
      $('#admin-content').hidden = false;
      const metrics = $('#metrics');
      metrics.replaceChildren();
      for (const [key, label] of [['unpaid', '待付款'], ['awaitingReview', '待核款'],
        ['overdue', '超过两小时'], ['collision', '交易尾号重复'], ['expiring', '临时权益即将到期']]) {
        const card = node('div', '', 'metric');
        card.append(node('strong', String(data.counts?.[key] || 0)));
        card.append(node('span', label));
        metrics.append(card);
      }
      const orders = $('#orders');
      orders.replaceChildren();
      for (const order of data.orders || []) orders.append(renderOrder(order));
      if (!data.orders?.length) orders.append(node('p', '目前没有待核款订单。'));
      message('工作台已更新');
    } catch (error) {
      $('#admin-content').hidden = true;
      $('#admin-login').hidden = false;
      message(error.status === 403 ? '当前账号没有管理员权限' : error.message);
    }
  }
  $('#refresh-orders').addEventListener('click', refresh);
  refresh();
})();
