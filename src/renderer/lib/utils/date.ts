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

const toDate = (value: string | number | Date): Date => (value instanceof Date ? value : new Date(value));

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * 列表和元信息里的友好日期：今天 10:24、昨天 21:08、10月20日、2025年9月18日。
 * 日期部分交给 Intl 按界面语言输出，避免每种语言各写一套规则。
 * 「今天 / Today」单独显示时首字母大写；嵌在句子里（如「Updated today」）时传 capitalize: false。
 * withSeconds 让时间精确到秒（今天 10:24:05），用在两个时间只差几秒、到分钟分不出先后的地方。
 */
export const formatFriendlyDate = (
    value: string | number | Date,
    locale: string,
    options: { withTime?: boolean; withSeconds?: boolean; now?: Date; capitalize?: boolean } = {}
): string => {
    const date = toDate(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const now = options.now ?? new Date();
    const dayOffset = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
    const time = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        ...(options.withSeconds ? { second: '2-digit' as const } : {}),
        hour12: false
    }).format(date);

    if (dayOffset === 0 || dayOffset === -1) {
        const day = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(dayOffset, 'day');
        const label = options.capitalize === false ? day : day.charAt(0).toUpperCase() + day.slice(1);
        return options.withTime === false ? label : `${label} ${time}`;
    }

    const sameYear = date.getFullYear() === now.getFullYear();
    const dateText = new Intl.DateTimeFormat(locale, sameYear
        ? { month: 'short', day: 'numeric' }
        : { year: 'numeric', month: 'short', day: 'numeric' }
    ).format(date);
    return options.withTime ? `${dateText} ${time}` : dateText;
};

/** 状态栏里的「2 分钟前」：一小时内按分钟，今天之内按小时，更早的退回友好日期 */
export const formatRelativeTime = (value: string | number | Date, locale: string, now = new Date()): string => {
    const date = toDate(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const minutes = Math.round((date.getTime() - now.getTime()) / 60_000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (Math.abs(minutes) < 1) return rtf.format(0, 'second');
    if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
    if (startOfDay(date) === startOfDay(now)) return rtf.format(Math.round(minutes / 60), 'hour');
    return formatFriendlyDate(date, locale, { now });
};
