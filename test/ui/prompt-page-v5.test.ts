import { readFileSync } from 'node:fs';
import { createApp, defineComponent, h, nextTick, type Component } from 'vue';
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui';
import { afterEach, describe, expect, it } from 'vitest';
import type { PromptWithRelations } from '@shared/types/database';
import i18n from '../../src/renderer/i18n';
import { getThemeOverrides } from '../../src/renderer/theme';
import VariableFieldList from '../../src/renderer/components/prompts/VariableFieldList.vue';
import PromptFillBody from '../../src/renderer/components/prompts/PromptFillBody.vue';
import VariableDefinitionList from '../../src/renderer/components/prompts/VariableDefinitionList.vue';

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8');

describe('V5 prompt page components', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let container: HTMLDivElement | undefined;

  const mount = async (component: Component, props: Record<string, unknown>) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(defineComponent({
      setup: () => () => h(NConfigProvider, { themeOverrides: getThemeOverrides('light') }, {
        default: () => h(NMessageProvider, null, {
          default: () => h(NDialogProvider, null, { default: () => h(component, props) }),
        }),
      }),
    }));
    app.use(i18n);
    i18n.global.locale.value = 'zh-CN';
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

  it('lays out three or fewer options as buttons and more as a select', async () => {
    const root = await mount(VariableFieldList, {
      variables: [
        { name: '语气', type: 'select', options: ['正式', '简洁', '轻松'], required: true },
        { name: '语言', type: 'select', options: ['TS', 'Go', 'Rust', 'Python'], required: false },
      ],
      values: { 语气: '简洁', 语言: '' },
    });

    const group = root.querySelector('[role="radiogroup"][aria-label="语气"]');
    expect(group?.querySelectorAll('button')).toHaveLength(3);
    expect(group?.querySelector('[aria-checked="true"]')?.textContent).toContain('简洁');
    expect(root.querySelector('[data-variable-field="语言"] .n-select')).not.toBeNull();
  });

  it('does not flag a required field until it has been revealed', async () => {
    const variables = [{ name: '项目名称', type: 'text', required: true }];
    let root = await mount(VariableFieldList, { variables, values: { 项目名称: '' } });
    expect(root.querySelector('.field--missing')).toBeNull();
    app?.unmount();
    container?.remove();

    root = await mount(VariableFieldList, { variables, values: { 项目名称: '' }, revealMissing: new Set(['项目名称']) });
    expect(root.querySelector('.field--missing .field__meta')?.textContent).toBe('还没填');
  });

  it('labels values from the last copy and from defaults', async () => {
    const root = await mount(VariableFieldList, {
      variables: [
        { name: '项目名称', type: 'text', required: true },
        { name: '受众', type: 'text', required: false, defaultValue: '部门负责人' },
      ],
      values: { 项目名称: 'AI Gist 2.2', 受众: '部门负责人' },
      sources: { 项目名称: 'last', 受众: 'default' },
    });
    const metas = [...root.querySelectorAll('.field__meta')].map(node => node.textContent);
    expect(metas).toEqual(['上次填写', '默认值']);
  });

  it('shows filled values, missing required names and optional names in the body (#381)', async () => {
    const prompt = {
      uuid: 'p', title: '周报', isFavorite: false, useCount: 0, isActive: true, tags: [],
      createdAt: new Date(), updatedAt: new Date(),
      content: '请为 {{项目名称}} 写周报，语气 {{语气}}，备注 {{备注}}',
      variables: [
        { name: '项目名称', type: 'text', required: true },
        { name: '语气', type: 'select', options: ['正式'], required: true },
        { name: '备注', type: 'text', required: false },
      ],
    } as unknown as PromptWithRelations;
    const root = await mount(PromptFillBody, { prompt, values: { 项目名称: 'AI Gist', 语气: '', 备注: '' } });
    const chips = [...root.querySelectorAll('button.ui-var')];

    expect(chips).toHaveLength(3);
    expect(chips[0].textContent).toContain('AI Gist');
    expect(chips[0].querySelector('.ui-var__label')?.textContent).toBe('项目名称');
    expect(chips[1].classList.contains('ui-var--missing')).toBe(true);
    expect(chips[2].classList.contains('ui-var--name')).toBe(true);
    expect(root.textContent).toContain('请为 ');
  });

  it('summarizes variable definitions and keeps unused ones in their own group', async () => {
    const root = await mount(VariableDefinitionList, {
      variables: [{ name: '受众', type: 'text', required: false, defaultValue: '部门负责人' }],
      unused: [{ name: '旧变量', type: 'textarea', required: true }],
      occurrences: { 受众: 2 },
    });
    const metas = [...root.querySelectorAll('.definition-row__meta')].map(node => node.textContent);
    expect(metas[0]).toBe('文本 · 默认「部门负责人」 · 出现 2 次');
    expect(metas[1]).toBe('长文本 · 必填 · 未在正文中');
    expect(root.textContent).toContain('未使用');
  });

  it('keeps favorite stars neutral until a prompt is favorited', () => {
    const header = readRendererFile('components/prompts/PromptHeader.vue');
    const list = readRendererFile('components/prompts/PromptLibraryList.vue');
    expect(header).toContain(":class=\"{ 'is-favorite': prompt.isFavorite }\"");
    expect(header).toMatch(/\.prompt-header__icon-button\.is-favorite\s*\{[^}]*color:\s*var\(--accent-favorite\)/);
    expect(list).toContain('v-else-if="prompt.isFavorite"');
  });

  it('copies only after every required variable is filled and records the usage', () => {
    const page = readRendererFile('components/prompts/PromptPage.vue');
    expect(page).toMatch(/const copyPrompt = async \(\) => \{[\s\S]*?if \(missing\.value\.length\) \{[\s\S]*?return\s*\}[\s\S]*?recordPromptUsage\(/);
    expect(page).toContain("message.success(t('promptPage.copiedAndRecorded'))");
  });
});
