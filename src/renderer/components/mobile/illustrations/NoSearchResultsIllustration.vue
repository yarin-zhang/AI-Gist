<template>
  <svg
    class="mobile-empty-illustration"
    viewBox="0 0 160 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-hidden="true"
  >
    <!-- 背景列表：暗示在一组已有结果里没有找到匹配项 -->
    <rect x="18" y="16" width="82" height="88" rx="10" stroke="var(--border-subtle)" stroke-width="3" />
    <g stroke="var(--border-subtle)" stroke-width="3" stroke-linecap="round">
      <line x1="32" y1="38" x2="86" y2="38" />
      <line x1="32" y1="54" x2="86" y2="54" />
      <line x1="32" y1="70" x2="72" y2="70" />
      <line x1="32" y1="86" x2="80" y2="86" />
    </g>
    <!-- 放大镜：盖住部分列表，镜片内是空的，代表没有匹配结果 -->
    <circle cx="100" cy="62" r="27" fill="var(--surface-body)" stroke="var(--content-tertiary)" stroke-width="5" />
    <line
      x1="119" y1="81" x2="140" y2="102"
      stroke="var(--content-tertiary)" stroke-width="6" stroke-linecap="round"
    />
    <line
      x1="90" y1="62" x2="110" y2="62"
      stroke="var(--content-tertiary)" stroke-width="3.5" stroke-linecap="round" opacity="0.7"
    />
  </svg>
</template>
