export function normalizeThemeChoice(value) {
  return value === 'shadcn' ? 'sterile' : value;
}

export function updateSterileSummary(grades, demo = false) {
  const courseCount = document.querySelector('#sterileCourseCount');
  const assignmentCount = document.querySelector('#sterileAssignmentCount');
  const dataState = document.querySelector('#sterileDataState');
  if (courseCount) courseCount.textContent = String(grades.length);
  if (assignmentCount) assignmentCount.textContent = String(grades.reduce((sum, grade) => sum + grade.assignments.length, 0));
  if (dataState) dataState.textContent = demo ? '正在预览范例数据' : grades.length ? '已载入 WebTESS 成绩' : '等待连接 WebTESS';
  document.querySelector('.sterile-overview-meta')?.setAttribute('data-connected', String(grades.length > 0));
}

export function initializeSterileNavigation() {
  const links = [...document.querySelectorAll('.sterile-nav a')];
  const sections = links.map((link) => document.querySelector(link.hash)).filter(Boolean);
  let pending = false;
  let preferredHash = '';
  for (const link of links) link.addEventListener('click', () => { preferredHash = link.hash; });
  function update() {
    pending = false;
    if (document.documentElement.dataset.theme !== 'sterile') return;
    let active = sections.filter((section) => section.getBoundingClientRect().top <= 150)
      .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || sections[0];
    const preferred = sections.find((section) => `#${section.id}` === preferredHash);
    if (active && preferred && Math.abs(active.getBoundingClientRect().top - preferred.getBoundingClientRect().top) < 3) active = preferred;
    for (const link of links) {
      if (link.hash === `#${active?.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
  document.addEventListener('scroll', () => {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
}
