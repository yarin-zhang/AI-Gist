/**
 * 数据变更通知总线
 *
 * 所有 IndexedDB 写入成功后都会从这里发布变更。页面订阅 store 变更，
 * 不需要猜测是哪一次导航、按钮或回调造成了数据更新。
 */

export type DataStoreName =
  | 'categories'
  | 'prompts'
  | 'promptVariables'
  | 'promptHistories'
  | 'ai_configs'
  | 'quick_optimization_configs'
  | 'ai_generation_history'
  | 'settings'
  | 'syncTombstones';

export type DataChangeAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'batch-delete'
  | 'clear';

export interface DataChangeEventPayload {
  storeName: DataStoreName | string;
  action: DataChangeAction;
  id?: IDBValidKey;
  ids?: IDBValidKey[];
  /** 只更新了使用次数这类统计：界面照常刷新，但不单独触发云同步，等下一次同步一起带上 (#488) */
  usageOnly?: boolean;
  timestamp: number;
  sourceId: string;
}

type DataChangeListener = (change: DataChangeEventPayload) => void;

const CHANNEL_NAME = 'ai-gist-data-changes';
const sourceId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const listeners = new Set<DataChangeListener>();
let broadcastChannel: BroadcastChannel | null | undefined;

const notifyListeners = (change: DataChangeEventPayload): void => {
  listeners.forEach(listener => {
    try {
      listener(change);
    } catch (error) {
      console.error('数据变更监听器执行失败:', error);
    }
  });
};

const getBroadcastChannel = (): BroadcastChannel | null => {
  if (broadcastChannel !== undefined) {
    return broadcastChannel;
  }

  if (typeof BroadcastChannel === 'undefined') {
    broadcastChannel = null;
    return null;
  }

  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = event => {
      const change = event.data as DataChangeEventPayload | undefined;
      if (!change || change.sourceId === sourceId) return;
      notifyListeners(change);
    };
  } catch (error) {
    console.warn('初始化数据变更广播通道失败:', error);
    broadcastChannel = null;
  }

  return broadcastChannel;
};

export const emitDataChange = (
  change: Omit<DataChangeEventPayload, 'timestamp' | 'sourceId'>
): void => {
  const payload: DataChangeEventPayload = {
    ...change,
    timestamp: Date.now(),
    sourceId
  };

  notifyListeners(payload);

  try {
    getBroadcastChannel()?.postMessage(payload);
  } catch (error) {
    console.warn('广播数据变更失败:', error);
  }
};

export const onDataChange = (
  storeNames: DataStoreName | DataStoreName[],
  listener: DataChangeListener
): (() => void) => {
  const storeNameSet = new Set(Array.isArray(storeNames) ? storeNames : [storeNames]);
  const wrappedListener: DataChangeListener = change => {
    if (storeNameSet.has(change.storeName as DataStoreName)) {
      listener(change);
    }
  };

  listeners.add(wrappedListener);
  getBroadcastChannel();

  return () => {
    listeners.delete(wrappedListener);
  };
};
