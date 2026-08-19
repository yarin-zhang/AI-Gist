/**
 * 统一的日期时间格式化工具。
 *
 * 云同步相关的时间戳（最近同步时间、下次同步/检查时间等）此前在数据同步设置页
 * 和悬浮状态指示器里各自调用 `toLocaleString()`，格式会随浏览器/系统 locale 变化
 * （例如 "19/08/2026, 19:21:30"），在不同设备上不一致。这里提供一个固定的
 * `yyyy-MM-dd HH:mm:ss` 格式化函数供这些位置共用，避免重新发明格式化逻辑。
 */
export const formatDateTime = (value: string | number | Date): string => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    const pad = (num: number) => String(num).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};
