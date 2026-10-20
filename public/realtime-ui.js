// Registration can resolve before the worker is active; PushManager needs ready.
export async function registerPushWorker(serviceWorker, timeoutMs = 15000) {
  let timer;
  try {
    return await Promise.race([
      (async () => {
        await serviceWorker.register('/sw.js');
        return serviceWorker.ready;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('浏览器后台通知初始化超时，请重新启用。')), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// This controller only reads status until the user explicitly enables notifications.
export function realtimeRequirements(state, inputs) {
  const missing = [];
  if (!inputs.supported) missing.push('使用支持推送的浏览器，并通过 HTTPS 访问');
  if (state.loading) missing.push('等待通知服务状态检查完成');
  else if (!state.known) missing.push('重新检查通知服务状态');
  else if (!state.configured) missing.push('等待管理员完成通知服务配置');
  if (inputs.permission === 'denied') missing.push('在浏览器设置中允许此网站发送通知');
  const email = String(inputs.email || '').trim();
  const password = String(inputs.password || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) missing.push('在首页填写有效的 WebTESS 邮箱');
  if (!password || password.length > 512) missing.push('在首页填写 WebTESS 密码');
  if (!state.enrolled && !String(inputs.inviteCode || '').trim()) missing.push('填写 Beta 邀请码');
  if (state.cleanupRequired) missing.push('先清理上次未完成的通知设置');
  return missing;
}

export function createRealtimeController({ readStatus, enable, disable, getInputs, render, hasSavedDevice = () => false }) {
  const state = {
    known: false, loading: true, configured: false, enrolled: false, enabled: false,
    busy: '', slot: null, cleanupRequired: false, notice: '', tone: '', loadError: ''
  };
  let revision = 0;

  function update() {
    const inputs = getInputs();
    const requirements = realtimeRequirements(state, inputs);
    let message = state.notice || state.loadError;
    let tone = state.tone;
    if (!message) {
      if (state.loading) message = '正在检查通知服务状态…';
      else if (state.enabled) {
        if (!inputs.supported || inputs.permission !== 'granted') {
          message = '后台检查已启用，但此浏览器目前无法接收通知。请允许网站通知，或关闭并删除资料后重新启用。';
          tone = 'bad';
        } else {
          message = `已启用 · Beta ${state.slot}/5 · 每天 06:00–24:00，每 5 分钟检查`;
          tone = 'ok';
        }
      } else if (state.enrolled) message = '后台检查已暂停。填写 WebTESS 邮箱和密码后可重新勾选恢复，无需再次输入邀请码；也可以关闭并删除资料。';
      else message = requirements.length ? '尚未启用，请先完成下列准备。' : '准备就绪，可以勾选启用。';
    }
    const snapshot = {
      ...state, requirements, message, tone,
      canEnable: !state.busy && requirements.length === 0,
      toggleDisabled: Boolean(state.busy) || (!state.enabled && requirements.length > 0),
      canCleanup: !state.busy && !state.loading && (state.enrolled || state.cleanupRequired || hasSavedDevice())
    };
    render(snapshot);
    return snapshot;
  }

  function applyStatus(result) {
    state.known = true;
    state.configured = result.configured === true;
    state.enrolled = result.enrolled === true;
    state.enabled = result.enabled === true;
    state.slot = result.slot || null;
    state.loadError = '';
  }

  async function load() {
    if (state.busy) return;
    const current = ++revision;
    state.loading = true;
    state.notice = '';
    state.tone = '';
    state.loadError = '';
    update();
    try {
      const result = await readStatus();
      if (current !== revision) return;
      applyStatus(result);
    } catch (error) {
      if (current !== revision) return;
      state.known = false;
      state.loadError = error.message || '无法读取通知状态，请重新检查。';
      state.tone = 'bad';
    } finally {
      if (current === revision) {
        state.loading = false;
        update();
      }
    }
  }

  async function setEnabled(enabled) {
    const before = update();
    if (state.busy || (enabled && !before.canEnable)) return;
    if (!enabled && !before.canCleanup && !state.enabled) return;
    ++revision; // A late initial/status response must never replace an explicit action.
    state.loading = false;
    state.busy = enabled ? 'enable' : 'disable';
    state.notice = enabled ? '正在启用即时通知…' : '正在关闭并删除后台登录资料…';
    state.tone = '';
    update();
    try {
      if (enabled) {
        const result = await enable({ ...getInputs(), enrolled: state.enrolled }, (message) => {
          state.notice = message;
          update();
        });
        state.known = true;
        state.enrolled = true;
        state.enabled = true;
        state.slot = result.slot;
        state.notice = `已启用 · Beta ${result.slot}/5 · 每天 06:00–24:00，每 5 分钟检查`;
        state.tone = 'ok';
      } else {
        await disable();
        state.enrolled = false;
        state.enabled = false;
        state.notice = '即时通知已关闭，服务器端登录资料已删除。';
        state.tone = 'ok';
      }
      state.cleanupRequired = false;
    } catch (error) {
      if (enabled) state.enabled = false;
      if (error.serverRemoved) {
        state.enrolled = false;
        state.enabled = false;
      }
      state.cleanupRequired = Boolean(state.cleanupRequired || error.cleanupRequired || error.serverRemoved);
      state.notice = error.message || (enabled ? '即时通知启用失败，请重试。' : '关闭即时通知失败，请重试。');
      state.tone = 'bad';
    } finally {
      state.busy = '';
      update();
    }
  }

  return {
    load,
    setEnabled,
    updatePrerequisites() {
      if (!state.busy) { state.notice = ''; state.tone = state.loadError ? 'bad' : ''; }
      return update();
    },
    refresh: update
  };
}
