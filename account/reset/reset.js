(() => {
  'use strict';
  const api = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://127.0.0.1:3100' : 'https://api.junaf.com';
  const form = document.querySelector('#reset-form');
  const status = document.querySelector('#reset-message');
  const sendButton = document.querySelector('#send-reset-code');
  const submitButton = document.querySelector('#submit-reset');
  const field = name => form.elements.namedItem(name);
  const say = value => { status.textContent = value; };
  async function request(path, body) {
    const response = await fetch(`${api}/api/auth/password-reset/${path}`, {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw Error(result.message || '请求失败，请稍后重试');
    return result;
  }
  sendButton.addEventListener('click', async () => {
    const email = field('email');
    if (!email.checkValidity()) { say('请先填写有效的注册邮箱'); email.focus(); return; }
    sendButton.disabled = true;
    say('正在发送验证码…');
    try {
      const result = await request('request', {email: email.value.trim()});
      say(result.message || '如果该邮箱已注册，验证码将发送到邮箱');
      let seconds = result.resendAfterSeconds || 60;
      sendButton.textContent = `${seconds} 秒后重发`;
      const timer = setInterval(() => {
        seconds--;
        if (seconds <= 0) { clearInterval(timer); sendButton.disabled = false; sendButton.textContent = '重新发送验证码'; }
        else sendButton.textContent = `${seconds} 秒后重发`;
      }, 1000);
    } catch (error) { sendButton.disabled = false; say(error.message); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const invalid = [...form.querySelectorAll('input[required]')].find(input => !input.checkValidity());
    if (invalid) { say('请填写有效的邮箱、6 位验证码和至少 12 位的新密码'); invalid.focus(); return; }
    if (field('password').value !== field('passwordConfirm').value) {
      say('两次输入的新密码不一致'); field('passwordConfirm').focus(); return;
    }
    submitButton.disabled = true;
    say('正在重设密码…');
    try {
      const result = await request('confirm', {email: field('email').value.trim(),
        code: field('code').value.trim(), password: field('password').value});
      form.reset();
      say(result.message || '密码已更新，请返回登录');
    } catch (error) { say(error.message); }
    finally { submitButton.disabled = false; }
  });
})();
