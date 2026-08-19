<template>
  <svg
    class="mobile-empty-illustration"
    viewBox="0 0 160 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-hidden="true"
  >
    <!-- 待连接的服务节点：三个圆点，线段与主卡片之间留白，暗示尚未接入 -->
    <g stroke="var(--border-strong)" stroke-width="3" stroke-linecap="round">
      <line x1="14" y1="38" x2="28" y2="38" />
      <line x1="14" y1="60" x2="28" y2="60" />
      <line x1="14" y1="82" x2="28" y2="82" />
    </g>
    <g fill="var(--surface-body)" stroke="var(--border-strong)" stroke-width="3">
      <circle cx="10" cy="38" r="5" />
      <circle cx="10" cy="60" r="5" />
      <circle cx="10" cy="82" r="5" />
    </g>

    <!-- 主卡片：代表一个待创建的 AI 配置 -->
    <rect x="40" y="26" width="88" height="64" rx="14" stroke="var(--content-tertiary)" stroke-width="3.5" />

    <!-- 卡片中央的自定义 4 角星形，呼应应用里 AI 相关页面已在使用的 sparkle 图标语言 -->
    <path
      d="M84 42 L88 55 L101 59 L88 63 L84 76 L80 63 L67 59 L80 55 Z"
      fill="var(--accent-primary)"
    />

    <!-- 新建徽标，与提示词空状态保持同一视觉家族 -->
    <circle cx="122" cy="94" r="16" fill="var(--accent-primary)" />
    <g stroke="var(--surface-primary)" stroke-width="4" stroke-linecap="round">
      <line x1="122" y1="87" x2="122" y2="101" />
      <line x1="115" y1="94" x2="129" y2="94" />
    </g>
  </svg>
</template>
