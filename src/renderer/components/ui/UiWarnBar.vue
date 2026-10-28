<template>
  <div class="ui-warn-bar" role="status">
    <span class="ui-dot ui-dot--warning" aria-hidden="true" />
    <span class="ui-warn-bar__text"><slot /></span>
    <span class="ui-warn-bar__actions">
      <slot name="actions" />
    </span>
  </div>
</template>

<style scoped>
.ui-warn-bar__text {
  flex: 1;
  min-width: 0;
}

.ui-warn-bar__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}
</style>
