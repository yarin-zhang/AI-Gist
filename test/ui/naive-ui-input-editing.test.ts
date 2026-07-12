import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { NConfigProvider, NInput, NModal } from 'naive-ui';
import { afterEach, describe, expect, it } from 'vitest';
import { getThemeOverrides } from '../../src/renderer/theme';

describe('Naive UI input editing integration', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    app = undefined;
    container = undefined;
  });

  it.each([
    ['text', false],
    ['textarea', true],
  ] as const)('keeps %s inputs focused and editable', async (_label, textarea) => {
    const value = ref('before');
    container = document.createElement('div');
    document.body.appendChild(container);

    app = createApp(defineComponent({
      setup: () => () => h(NConfigProvider, {
        themeOverrides: getThemeOverrides('light'),
      }, {
        default: () => h(NInput, {
          type: textarea ? 'textarea' : 'text',
          value: value.value,
          'onUpdate:value': (nextValue: string) => {
            value.value = nextValue;
          },
        }),
      }),
    }));

    app.mount(container);
    await nextTick();

    const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      textarea ? 'textarea' : 'input',
    );
    expect(input).not.toBeNull();

    input!.focus();
    input!.value = 'after';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    expect(document.activeElement).toBe(input);
    expect(value.value).toBe('after');
    expect(input!.value).toBe('after');
  });

  it.each([
    ['text', false],
    ['textarea', true],
  ] as const)('keeps %s inputs focused and editable inside a raw modal with a div root', async (_label, textarea) => {
    const value = ref('before');
    container = document.createElement('div');
    document.body.appendChild(container);

    app = createApp(defineComponent({
      setup: () => () => h(NConfigProvider, {
        themeOverrides: getThemeOverrides('light'),
      }, {
        default: () => h(NModal, {
          show: true,
          displayDirective: 'show',
        }, {
          default: () => h('div', {
            role: 'dialog',
            'aria-modal': 'true',
          }, [
            h(NInput, {
              type: textarea ? 'textarea' : 'text',
              value: value.value,
              'onUpdate:value': (nextValue: string) => {
                value.value = nextValue;
              },
            }),
          ]),
        }),
      }),
    }));

    app.mount(container);
    await nextTick();
    await nextTick();

    const input = document.body.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      textarea ? '.n-modal-container textarea' : '.n-modal-container input',
    );
    expect(input).not.toBeNull();

    input!.focus();
    input!.value = 'after';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    expect(document.activeElement).toBe(input);
    expect(value.value).toBe('after');
    expect(input!.value).toBe('after');
  });
});
