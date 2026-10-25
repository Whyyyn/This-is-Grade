const STORAGE_KEY = 'grade-onboarding-v1';
let activeOnboarding;

const steps = [
  {
    eyebrow: '01 / 连接账号',
    title: '连接 WebTESS',
    description: '在首页填写 WebTESS 邮箱和密码，点击“抓取并更新”，就能把课程和作业成绩放在一起查看。',
    tip: '准备好账号即可开始；也可以稍后在设置里重新查看这份引导。',
    preview: `<div class="onboarding-preview-label">连接账号</div>
      <div class="onboarding-preview-heading"><span class="onboarding-app-mark">G</span><span>WebTESS<small>连接你的学习记录</small></span></div>
      <div class="onboarding-mock-field"><span>邮箱</span><i></i></div>
      <div class="onboarding-mock-field"><span>密码</span><i class="onboarding-mock-password"></i></div>
      <div class="onboarding-mock-connect">抓取并更新 <span>↗</span></div>`
  },
  {
    eyebrow: '02 / 看清变化',
    title: '查看与预测成绩',
    description: '选择你关注的四门课程，自动计算均分。向下查看作业明细和历史走势，再用成绩预测试算下一次得分的影响。',
    tip: '选好课程后可复制布局链接，下次打开直接回到熟悉的四门课。',
    preview: `<div class="onboarding-preview-label">成绩概览 <span>示意</span></div>
      <div class="onboarding-preview-score">4 <span>/ 4 门课程</span></div>
      <div class="onboarding-mock-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="onboarding-preview-metrics"><span>课程明细</span><span>历史走势</span><span>成绩预测</span></div>`
  },
  {
    eyebrow: '03 / 按你的习惯',
    title: '外观与通知设置',
    description: '在设置中切换主题。sterile 主题将账号连接、课程总览、走势与预测、作业明细分区显示。',
    tip: '即时通知是可选的邀请 Beta：先填写邀请码和登录资料，满足设备要求后，再自行开启。',
    preview: `<div class="onboarding-preview-label">外观设置</div>
      <div class="onboarding-theme-preview"><div class="onboarding-theme-sidebar"><i></i><i></i><i></i></div><div class="onboarding-theme-content"><span></span><div><i></i><i></i></div><b></b></div></div>
      <div class="onboarding-preview-heading onboarding-theme-caption"><span>sterile</span><span class="onboarding-color-dots"><i></i><i></i><i></i></span></div>`
  }
];

/** Add a one-time welcome tour and listen for [data-open-onboarding] replay buttons. */
export function initializeOnboarding({ openSettings, closeSettings, applyTheme } = {}) {
  if (activeOnboarding) return activeOnboarding;

  const dialog = document.createElement('dialog');
  dialog.id = 'onboardingDialog';
  dialog.className = 'onboarding-dialog';
  dialog.setAttribute('aria-labelledby', 'onboardingTitle');
  dialog.setAttribute('aria-describedby', 'onboardingDescription');
  dialog.innerHTML = `
    <div class="onboarding-header">
      <span class="onboarding-brand"><span class="onboarding-app-mark" aria-hidden="true">G</span> THIS IS GRADE</span>
      <button class="onboarding-skip" type="button" data-onboarding-skip>跳过引导 <span aria-hidden="true">×</span></button>
    </div>
    <div class="onboarding-progress" aria-label="引导进度"><span></span><span></span><span></span></div>
    <div class="onboarding-body">
      <div class="onboarding-preview" aria-hidden="true"></div>
      <div class="onboarding-copy">
        <p class="onboarding-eyebrow"></p>
        <h2 id="onboardingTitle" tabindex="-1"></h2>
        <p id="onboardingDescription" class="onboarding-description"></p>
        <button class="onboarding-theme-button" type="button" data-onboarding-theme hidden>试用 sterile 主题 <span aria-hidden="true">↗</span></button>
        <p class="onboarding-tip"></p>
        <p class="onboarding-feedback" role="status" aria-live="polite"></p>
      </div>
    </div>
    <div class="onboarding-footer">
      <span class="onboarding-step-count" aria-live="polite"></span>
      <div class="onboarding-actions">
        <button class="onboarding-back" type="button" data-onboarding-back>上一步</button>
        <button class="onboarding-next" type="button" data-onboarding-next>下一步 <span aria-hidden="true">→</span></button>
      </div>
    </div>`;
  document.body.append(dialog);

  const title = dialog.querySelector('#onboardingTitle');
  const themeButton = dialog.querySelector('[data-onboarding-theme]');
  const nextButton = dialog.querySelector('[data-onboarding-next]');
  const backButton = dialog.querySelector('[data-onboarding-back]');
  const feedback = dialog.querySelector('.onboarding-feedback');
  let currentStep = 0;
  let previousFocus = null;
  let returnToSettings = false;
  let previousOverflow = '';

  function renderStep() {
    const step = steps[currentStep];
    dialog.querySelector('.onboarding-preview').innerHTML = step.preview;
    dialog.querySelector('.onboarding-eyebrow').textContent = step.eyebrow;
    title.textContent = step.title;
    dialog.querySelector('#onboardingDescription').textContent = step.description;
    dialog.querySelector('.onboarding-tip').textContent = step.tip;
    dialog.querySelector('.onboarding-step-count').textContent = `${currentStep + 1} / ${steps.length}`;
    for (const [index, segment] of [...dialog.querySelectorAll('.onboarding-progress > span')].entries()) {
      segment.classList.toggle('is-complete', index <= currentStep);
    }
    backButton.hidden = currentStep === 0;
    themeButton.hidden = currentStep !== steps.length - 1 || typeof applyTheme !== 'function';
    const usingSterile = document.documentElement.dataset.themeChoice === 'sterile';
    themeButton.disabled = usingSterile;
    themeButton.textContent = usingSterile ? '正在使用 sterile 主题 ✓' : '试用 sterile 主题 ↗';
    nextButton.textContent = currentStep === steps.length - 1 ? '开始使用 →' : '下一步 →';
    feedback.textContent = '';
    dialog.scrollTop = 0;
    if (dialog.open) title.focus({ preventScroll: true });
  }

  function open() {
    if (dialog.open) return;
    previousFocus = document.activeElement;
    const settings = document.querySelector('#settingsModal');
    returnToSettings = !!settings && !settings.hidden;
    if (returnToSettings) {
      if (typeof closeSettings === 'function') closeSettings();
      else settings.hidden = true;
    }
    currentStep = 0;
    renderStep();
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    title.focus({ preventScroll: true });
  }

  function finish(outcome = 'skipped') {
    if (!dialog.open) return;
    try {
      localStorage.setItem(STORAGE_KEY, outcome);
    } catch {
      // The tour remains usable when storage is blocked or full.
    }
    dialog.close();
    document.body.style.overflow = previousOverflow;
    if (outcome === 'completed') {
      document.querySelector('#email')?.focus();
      return;
    }
    if (returnToSettings) {
      if (typeof openSettings === 'function') openSettings();
      else {
        const settings = document.querySelector('#settingsModal');
        if (settings) settings.hidden = false;
      }
    }
    if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus({ preventScroll: true });
    else document.querySelector('#email')?.focus({ preventScroll: true });
  }

  function handleReplay(event) {
    if (event.target.closest?.('[data-open-onboarding]')) open();
  }

  dialog.querySelector('[data-onboarding-skip]').addEventListener('click', () => finish());
  nextButton.addEventListener('click', () => {
    if (currentStep === steps.length - 1) finish('completed');
    else {
      currentStep += 1;
      renderStep();
    }
  });
  backButton.addEventListener('click', () => {
    currentStep = Math.max(0, currentStep - 1);
    renderStep();
  });
  themeButton.addEventListener('click', () => {
    applyTheme?.('sterile');
    themeButton.disabled = true;
    themeButton.textContent = '正在使用 sterile 主题 ✓';
    feedback.textContent = '主题已应用。以后也可以在设置中更换。';
    nextButton.focus({ preventScroll: true });
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    finish();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]):not([hidden])')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === title)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  document.addEventListener('click', handleReplay);

  activeOnboarding = { open, close: finish };
  let hasSeen = false;
  try {
    hasSeen = !!localStorage.getItem(STORAGE_KEY);
  } catch {
    // Only the welcome preference is stored; no account fields are accessed.
  }
  if (!hasSeen) open();
  return activeOnboarding;
}
