export async function storeBrowserCredential(email, password, {
  timeoutMs = 5000,
  credentials = globalThis.navigator?.credentials,
  Credential = globalThis.PasswordCredential
} = {}) {
  if (!email || !password || !credentials?.store || !Credential) return 'unsupported';
  let timer;
  try {
    const credential = new Credential({ id: email, password, name: email });
    return await Promise.race([
      Promise.resolve(credentials.store(credential)).then(() => 'saved'),
      new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs); })
    ]);
  } catch {
    // The browser or user can decline saving without affecting the grades.
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
