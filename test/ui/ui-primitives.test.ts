import { createApp, defineComponent, h, nextTick } from 'vue';
import { NConfigProvider } from 'naive-ui';
import { afterEach, describe, expect, it } from 'vitest';
import UiDiffText from '../../src/renderer/components/ui/UiDiffText.vue';
import UiSettingRow from '../../src/renderer/components/ui/UiSettingRow.vue';
import UiSplitButton from '../../src/renderer/components/ui/UiSplitButton.vue';
import UiVariableChip from '../../src/renderer/components/ui/UiVariableChip.vue';
import { getThemeOverrides } from '../../src/renderer/theme';

describe('shared UI primitives', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let container: HTMLDivElement | undefined;

  const mount = async (render: () => ReturnType<typeof h>) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(defineComponent({
      setup: () => () => h(NConfigProvider, { themeOverrides: getThemeOverrides('light') }, { default: render }),
    }));
    app.mount(container);
    await nextTick();
    return container;
  };

  afterEach(() => {
    app?.unmount();
    container?.remove();
    app = undefined;
    container = undefined;
  });

  it('shows a filled variable as its value with the name as a small label', async () => {
    const selected: string[] = [];
    const root = await mount(() => h(UiVariableChip, {
      name: '项目名称',
      value: 'AI Gist 2.2',
      onSelect: (name: string) => selected.push(name),
    }));
    const chip = root.querySelector<HTMLButtonElement>('button.ui-var')!;

    expect(chip.querySelector('.ui-var__label')?.textContent).toBe('项目名称');
    expect(chip.textContent).toContain('AI Gist 2.2');
    chip.click();
    expect(selected).toEqual(['项目名称']);
  });

  it('marks a missing required variable with its name only', async () => {
    const root = await mount(() => h(UiVariableChip, { name: '语气', missing: true }));
    const chip = root.querySelector('button.ui-var')!;

    expect(chip.classList.contains('ui-var--missing')).toBe(true);
    expect(chip.textContent?.trim()).toBe('语气');
  });

  it('never marks variables as missing while showing variable names', async () => {
    const root = await mount(() => h(UiVariableChip, { name: '语气', missing: true, mode: 'name' }));
    const chip = root.querySelector('button.ui-var')!;

    expect(chip.classList.contains('ui-var--name')).toBe(true);
    expect(chip.classList.contains('ui-var--missing')).toBe(false);
  });

  it('renders diff segments as inserted and deleted text', async () => {
    const root = await mount(() => h(UiDiffText, {
      segments: [
        { type: 'equal', value: '每部分' },
        { type: 'delete', value: '尽量简短' },
        { type: 'insert', value: '不超过 5 条' },
      ],
    }));

    expect(root.querySelector('del.ui-diff-delete')?.textContent).toBe('尽量简短');
    expect(root.querySelector('ins.ui-diff-insert')?.textContent).toBe('不超过 5 条');
    expect(root.textContent).toBe('每部分尽量简短不超过 5 条');
  });

  it('gives the split button menu an accessible name', async () => {
    const root = await mount(() => h(UiSplitButton, {
      options: [{ key: 'raw', label: '复制原始模板' }],
      menuLabel: '更多复制方式',
      shortcut: '⌘↵',
    }, { default: () => '复制' }));
    const buttons = root.querySelectorAll('button');

    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain('复制');
    expect(buttons[0].textContent).toContain('⌘↵');
    expect(buttons[1].getAttribute('aria-label')).toBe('更多复制方式');
  });

  it('lays out a setting row as description plus control', async () => {
    const root = await mount(() => h(UiSettingRow, {
      title: '开机时启动',
      description: '登录系统后在后台启动 AI Gist',
    }, { default: () => h('button', { type: 'button' }, '开关') }));

    expect(root.querySelector('.ui-row__title')?.textContent).toBe('开机时启动');
    expect(root.querySelector('.ui-row__description')?.textContent).toBe('登录系统后在后台启动 AI Gist');
    expect(root.querySelector('.ui-row__control button')).not.toBeNull();
  });
});
