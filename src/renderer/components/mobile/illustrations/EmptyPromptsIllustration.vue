<template>
  <svg
    class="mobile-empty-illustration"
    viewBox="0 0 160 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-hidden="true"
  >
    <!-- 背面卡片：轻微旋转，暗示一叠提示词 -->
    <rect
      x="30" y="18" width="76" height="92" rx="10"
      transform="rotate(-8 68 64)"
      stroke="var(--border-strong)"
      stroke-width="3"
    />
    <!-- 正面卡片 -->
    <rect
      x="46" y="10" width="76" height="92" rx="10"
      transform="rotate(4 84 56)"
      stroke="var(--content-tertiary)"
      stroke-width="3.5"
    />
    <!-- 正面卡片上的文本行，代表提示词内容 -->
    <g transform="rotate(4 84 56)" stroke="var(--content-tertiary)" stroke-width="3" stroke-linecap="round">
      <line x1="60" y1="34" x2="106" y2="34" />
      <line x1="60" y1="47" x2="112" y2="47" />
      <line x1="60" y1="60" x2="98" y2="60" />
    </g>
    <!-- 新建徽标 -->
    <circle cx="120" cy="90" r="16" fill="var(--accent-primary)" />
    <g stroke="var(--surface-primary)" stroke-width="4" stroke-linecap="round">
      <line x1="120" y1="83" x2="120" y2="97" />
      <line x1="113" y1="90" x2="127" y2="90" />
    </g>
  </svg>
</template>
