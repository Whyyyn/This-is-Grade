// Keep scrape + history in one operation: both use the same session cookie.
// A second submission must not change that cookie while history is saving.
export function createScrapeController({
  scrape, updateGrades, updateHistory, saveCredential,
  onStart, onSuccess, onNotice, onError, onBusy,
  timeoutMs = 90_000
}) {
  let busy = false;
  let revision = 0;
  return {
    async submit(inputs) {
      if (busy) return;
      busy = true;
      const attempt = ++revision;
      let timer;
      const controller = new AbortController();
      onBusy(true);
      onStart();
      try {
        const result = await Promise.race([
          scrape(inputs, controller.signal),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error('查询超时，请稍后重试。'));
              controller.abort();
            }, timeoutMs);
          })
        ]);
        clearTimeout(timer);
        updateGrades(result.grades);
        onSuccess();
        // A browser password prompt must never hold the grade/history flow open.
        void Promise.resolve().then(() => saveCredential(inputs.email, inputs.password)).then((result) => {
          if (attempt === revision && ['timeout', 'failed'].includes(result)) onNotice(result);
        }).catch(() => { if (attempt === revision) onNotice('failed'); });
        await updateHistory(inputs, result);
      } catch (error) {
        onError(error);
      } finally {
        clearTimeout(timer);
        busy = false;
        onBusy(false);
      }
    }
  };
}
