import { writeFile } from 'node:fs/promises';

const port = Number(process.argv[2] || 9222);
const screenshotPath = process.argv[3] || '/tmp/ai-gist-launcher.png';
const seedCount = Number(process.argv[4] || 0);
const endpoint = `http://127.0.0.1:${port}`;

class CdpClient {
  constructor(url) {
    this.sequence = 0;
    this.pending = new Map();
    this.socket = new WebSocket(url);
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    return this;
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  close() {
    this.socket.close();
  }
}

async function targets() {
  const response = await fetch(`${endpoint}/json`);
  return response.json();
}

async function waitForTarget(predicate, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const target = (await targets()).find(predicate);
    if (target) return target;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for Electron target');
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  return result.result.value;
}

const mainTarget = await waitForTarget(target => target.type === 'page' && !target.url.includes('surface=launcher'));
const main = await new CdpClient(mainTarget.webSocketDebuggerUrl).connect();
const seededPromptIds = seedCount > 0 ? await evaluate(main, `(async () => {
  const service = window.databaseAPI.databaseServiceManager.prompt;
  const existing = await service.getAllPromptsForTags();
  for (const prompt of existing) {
    if (prompt.title.startsWith('[Launcher verification]')) await service.deletePrompt(prompt.id);
  }
  const ids = [];
  for (let index = 0; index < ${seedCount}; index += 1) {
    const prompt = await service.createPrompt({
      title: '[Launcher verification] Prompt ' + String(index + 1).padStart(2, '0'),
      content: 'Verification content ' + index,
      description: 'Temporary prompt used to verify scrolling and clipping',
      tags: ['verification'],
      isFavorite: false,
      useCount: index,
      isActive: true,
    });
    ids.push(prompt.id);
  }
  return ids;
})()`) : [];
await evaluate(main, 'window.electronAPI.shortcuts.openLauncher()');

const launcherTarget = await waitForTarget(target => target.type === 'page' && target.url.includes('surface=launcher'));
const launcher = await new CdpClient(launcherTarget.webSocketDebuggerUrl).connect();

await evaluate(launcher, `new Promise((resolve, reject) => {
  const started = Date.now();
  const check = () => {
    const options = Array.from(document.querySelectorAll('[role="option"]'));
    const hasSeededPrompt = ${seedCount > 0}
      ? options.some(option => option.textContent?.includes('[Launcher verification]'))
      : true;
    const inputFocused = document.activeElement?.getAttribute('role') === 'combobox';
    if (document.visibilityState === 'visible' && options.length > 1 && hasSeededPrompt && inputFocused) resolve(true);
    else if (Date.now() - started > 10000) reject(new Error('Launcher results did not render'));
    else setTimeout(check, 50);
  };
  check();
})`);

const inspectSelection = () => evaluate(launcher, `(() => {
  const selected = document.querySelector('[role="option"][aria-selected="true"]');
  return {
    selectedId: selected?.id || null,
    selectedText: selected?.querySelector('.n-thing-header__title')?.textContent?.trim() || null,
    optionCount: document.querySelectorAll('[role="option"]').length,
    activeDescendant: document.querySelector('[role="combobox"]')?.getAttribute('aria-activedescendant') || null,
    focusedRole: document.activeElement?.getAttribute('role') || document.activeElement?.tagName || null,
  };
})()`);

const before = await inspectSelection();
await launcher.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
await launcher.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
await new Promise(resolve => setTimeout(resolve, 100));
const afterDown = await inspectSelection();
await launcher.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
await launcher.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
await new Promise(resolve => setTimeout(resolve, 100));
const afterUp = await inspectSelection();

const visualState = await evaluate(launcher, `(() => {
  const styles = element => {
    const value = getComputedStyle(element);
    return { backgroundColor: value.backgroundColor, opacity: value.opacity };
  };
  const resultViewport = document.querySelector('.result-scrollbar .n-scrollbar-container');
  const resultViewportRect = resultViewport?.getBoundingClientRect();
  const optionRects = Array.from(document.querySelectorAll('[role="option"]'))
    .map(option => option.getBoundingClientRect());
  return {
    html: styles(document.documentElement),
    body: styles(document.body),
    app: styles(document.querySelector('#app')),
    shell: styles(document.querySelector('.launcher-shell')),
    cardCount: document.querySelectorAll('.n-card').length,
    listCount: document.querySelectorAll('.n-list').length,
    thingCount: document.querySelectorAll('.n-thing').length,
    cardStructure: Array.from(document.querySelector('.launcher-card')?.children || []).map(element => ({
      tag: element.tagName,
      className: element.className,
      rect: element.getBoundingClientRect().toJSON(),
    })),
    viewport: { width: innerWidth, height: innerHeight },
    card: document.querySelector('.launcher-card')?.getBoundingClientRect().toJSON(),
    header: document.querySelector('.n-card-header')?.getBoundingClientRect().toJSON(),
    content: document.querySelector('.n-card-content')?.getBoundingClientRect().toJSON(),
    footer: document.querySelector('.n-card__footer')?.getBoundingClientRect().toJSON(),
    scrollbar: resultViewportRect?.toJSON(),
    density: {
      optionHeights: optionRects.map(rect => rect.height),
      fullyVisibleOptionCount: resultViewportRect
        ? optionRects.filter(rect => rect.top >= resultViewportRect.top - 1 && rect.bottom <= resultViewportRect.bottom + 1).length
        : 0,
      titleFontSize: getComputedStyle(document.querySelector('.n-thing-header__title')).fontSize,
      descriptionFontSize: getComputedStyle(document.querySelector('.result-description')).fontSize,
    },
    documentScroll: {
      windowX: scrollX,
      windowY: scrollY,
      htmlTop: document.documentElement.scrollTop,
      bodyTop: document.body.scrollTop,
    },
  };
})()`);

const screenshot = await launcher.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

await evaluate(launcher, `(() => {
  const input = document.querySelector('[role="combobox"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'stale launcher state');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input.value;
})()`);
await evaluate(launcher, 'window.electronAPI.shortcuts.hideLauncher()');
await evaluate(main, 'window.electronAPI.shortcuts.openLauncher()');
await evaluate(launcher, `new Promise((resolve, reject) => {
  const started = Date.now();
  const check = () => {
    const input = document.querySelector('[role="combobox"]');
    if (document.visibilityState === 'visible' && input?.value === '' && document.querySelectorAll('[role="option"]').length > 1) resolve(true);
    else if (Date.now() - started > 10000) reject(new Error('Launcher exposed stale state when reopened'));
    else setTimeout(check, 50);
  };
  check();
})`);
const afterReopen = await inspectSelection();
await launcher.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
await launcher.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
await new Promise(resolve => setTimeout(resolve, 150));
const scrollValidation = await evaluate(launcher, `(() => {
  const selected = document.querySelector('[role="option"][aria-selected="true"]')?.getBoundingClientRect();
  const viewport = document.querySelector('.result-scrollbar .n-scrollbar-container')?.getBoundingClientRect();
  return {
    selectedId: document.querySelector('[role="option"][aria-selected="true"]')?.id || null,
    selected: selected?.toJSON(),
    viewport: viewport?.toJSON(),
    isVisible: Boolean(selected && viewport && selected.top >= viewport.top - 1 && selected.bottom <= viewport.bottom + 1),
    documentScrollTop: Math.max(scrollY, document.documentElement.scrollTop, document.body.scrollTop),
  };
})()`);
const reopenedScreenshotPath = screenshotPath.replace(/\.png$/i, '-reopen.png');
const reopenedScreenshot = await launcher.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
await writeFile(reopenedScreenshotPath, Buffer.from(reopenedScreenshot.data, 'base64'));

if (seededPromptIds.length) {
  await evaluate(main, `(async () => {
    const service = window.databaseAPI.databaseServiceManager.prompt;
    for (const id of ${JSON.stringify(seededPromptIds)}) await service.deletePrompt(id);
  })()`);
}

const diagnostics = { before, afterDown, afterUp, afterReopen, scrollValidation, visualState, screenshotPath, reopenedScreenshotPath };
process.stdout.write(`${JSON.stringify(diagnostics, null, 2)}\n`);

if (before.optionCount < 2) throw new Error('Expected at least two launcher options');
if (before.selectedId === afterDown.selectedId) throw new Error('ArrowDown did not change the selected result');
if (before.selectedId !== afterUp.selectedId) throw new Error('ArrowUp did not restore the previous selection');
if (afterDown.activeDescendant !== afterDown.selectedId) throw new Error('ARIA active descendant did not follow keyboard selection');
if (before.focusedRole !== 'combobox') throw new Error('Launcher search input did not receive focus');
if (afterReopen.selectedId !== before.selectedId) throw new Error('Launcher selection was not reset before reopening');
if (visualState.cardCount < 1 || visualState.listCount < 1 || visualState.thingCount < 1) {
  throw new Error('Launcher is not rendered with the expected Naive UI components');
}
if (!visualState.footer || visualState.footer.bottom > visualState.viewport.height + 1) {
  throw new Error('Launcher footer is clipped outside the window');
}
if (!visualState.header || visualState.header.top < -1) {
  throw new Error('Launcher search header is clipped outside the window');
}
if (!visualState.content || !visualState.scrollbar || visualState.scrollbar.bottom > visualState.content.bottom + 1) {
  throw new Error('Launcher result scroller exceeds its content region');
}
if (before.optionCount >= 6 && visualState.density.fullyVisibleOptionCount < 6) {
  throw new Error('Launcher result density is too low to show six complete options');
}
if (!scrollValidation.isVisible) throw new Error('Keyboard selection did not scroll fully into view');
if (scrollValidation.documentScrollTop !== 0 || visualState.documentScroll.windowY !== 0) {
  throw new Error('Keyboard navigation scrolled the launcher document');
}

launcher.close();
main.close();
