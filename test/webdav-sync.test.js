/**
 * WebDAV 同步功能单元测试
 */

const crypto = require('crypto');

// 模拟的 WebDAV 服务类（简化版）
class WebDAVSyncTester {
    constructor() {
        this.deviceId = this.generateDeviceId();
    }

    generateDeviceId() {
        return crypto.createHash('md5').update(require('os').hostname() + process.pid).digest('hex');
    }

    // 改进的哈希算法
    calculateDataHash(data) {
        if (!data || typeof data !== 'object') {
            return crypto.createHash('sha256').update('').digest('hex').substring(0, 16);
        }
        
        // 标准化数据：排序键、移除时间戳等易变字段
        const normalizedData = this.normalizeDataForHashing(data);
        const dataString = JSON.stringify(normalizedData);
        return crypto.createHash('sha256').update(dataString).digest('hex').substring(0, 16);
    }

    normalizeDataForHashing(data) {
        const normalized = {};
        
        // 只包含实际数据，排除元数据
        if (data.categories) normalized.categories = this.sortArray(data.categories, 'id');
        if (data.prompts) normalized.prompts = this.sortArray(data.prompts, 'id');
        if (data.aiConfigs) normalized.aiConfigs = this.sortArray(data.aiConfigs, 'id');
        if (data.settings) normalized.settings = this.sortObject(data.settings);
        
        return normalized;
    }

    sortArray(arr, keyField = 'id') {
        if (!Array.isArray(arr)) return arr;
        return arr.slice().sort((a, b) => {
            const aKey = a[keyField] || JSON.stringify(a);
            const bKey = b[keyField] || JSON.stringify(b);
            return aKey.toString().localeCompare(bKey.toString());
        });
    }

    sortObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        const sorted = {};
        Object.keys(obj).sort().forEach(key => {
            sorted[key] = obj[key];
        });
        return sorted;
    }

    // 改进的同步决策算法
    makeSyncDecision(localData, localMetadata, localDataHash, remoteData, remoteMetadata) {
        console.log('\n=== 同步决策分析 ===');
        console.log('本地哈希:', localDataHash);
        console.log('本地时间:', localMetadata.lastSyncTime);
        console.log('本地同步次数:', localMetadata.syncCount);
        console.log('本地设备ID:', localMetadata.deviceId);
        
        // 情况1：远程没有数据
        if (!remoteData || !remoteMetadata) {
            console.log('决策: 首次上传');
            return {
                action: 'upload_only',
                reason: '远程无数据，执行首次上传'
            };
        }

        const remoteDataHash = this.calculateDataHash(remoteData);
        console.log('远程哈希:', remoteDataHash);
        console.log('远程时间:', remoteMetadata.lastSyncTime);
        console.log('远程同步次数:', remoteMetadata.syncCount);
        console.log('远程设备ID:', remoteMetadata.deviceId);

        // 情况2：数据完全相同
        if (localDataHash === remoteDataHash) {
            console.log('决策: 数据相同，仅更新时间戳');
            return {
                action: 'upload_only',
                reason: '数据相同，仅更新同步时间'
            };
        }

        const localTime = new Date(localMetadata.lastSyncTime).getTime();
        const remoteTime = new Date(remoteMetadata.lastSyncTime).getTime();
        const timeDiff = Math.abs(localTime - remoteTime);

        console.log('时间差:', timeDiff, 'ms');

        // 情况3：检查是否是同一设备的不同同步
        if (localMetadata.deviceId === remoteMetadata.deviceId) {
            // 同一设备，比较同步计数
            if (localMetadata.syncCount > remoteMetadata.syncCount) {
                console.log('决策: 同设备，本地版本更新');
                return {
                    action: 'upload_only',
                    reason: '同设备本地版本更新'
                };
            } else if (localMetadata.syncCount < remoteMetadata.syncCount) {
                console.log('决策: 同设备，远程版本更新');
                return {
                    action: 'download_only',
                    reason: '同设备远程版本更新'
                };
            } else {
                // 同设备同步计数相同但数据不同，这通常表示本地有未同步的修改
                console.log('检测到同设备未同步的本地修改（删除、编辑等）');
                
                // 比较记录数
                const recordDiff = localMetadata.totalRecords - (remoteMetadata.totalRecords || 0);
                if (recordDiff !== 0) {
                    console.log(`决策: 同设备本地数据有变化（记录数差异: ${recordDiff}），上传本地版本`);
                    return {
                        action: 'upload_only',
                        reason: `同设备本地数据有变化（${recordDiff > 0 ? '新增' : '删除'}了${Math.abs(recordDiff)}条记录）`
                    };
                } else {
                    console.log('决策: 同设备记录数相同但内容有修改，上传本地版本');
                    return {
                        action: 'upload_only',
                        reason: '同设备本地数据有编辑修改'
                    };
                }
            }
        }

        // 情况4：不同设备的修改，需要更仔细的分析
        
        // 4.1：时间差很大，使用时间戳决策
        if (timeDiff > 300000) { // 5分钟
            if (localTime > remoteTime) {
                console.log('决策: 本地时间较新（时间差>5分钟）');
                return {
                    action: 'upload_only',
                    reason: '本地修改时间较新'
                };
            } else {
                console.log('决策: 远程时间较新（时间差>5分钟）');
                return {
                    action: 'download_only',
                    reason: '远程修改时间较新'
                };
            }
        }

        // 4.2：时间差较小，可能是并发修改
        if (timeDiff < 60000) { // 1分钟内
            console.log('决策: 检测到可能的并发修改，需要合并');
            return {
                action: 'merge',
                reason: '检测到并发修改，尝试自动合并'
            };
        }

        // 4.3：中等时间差，使用同步计数辅助判断
        const syncCountDiff = localMetadata.syncCount - remoteMetadata.syncCount;
        if (Math.abs(syncCountDiff) > 5) {
            // 同步计数差异很大，可能有一方很久没同步
            if (syncCountDiff > 0) {
                console.log('决策: 本地同步计数远大于远程');
                return {
                    action: 'upload_only',
                    reason: '本地同步次数更多'
                };
            } else {
                console.log('决策: 远程同步计数远大于本地');
                return {
                    action: 'download_only',
                    reason: '远程同步次数更多'
                };
            }
        }

        // 情况5：无法明确决策，标记为冲突
        console.log('决策: 无法自动决策，标记为冲突');
        return {
            action: 'conflict_detected',
            reason: `无法自动解决冲突: 时间差${Math.round(timeDiff/1000)}秒, 同步计数差${syncCountDiff}`
        };
    }
}

// 测试用例
function runTests() {
    const tester = new WebDAVSyncTester();
    
    console.log('开始 WebDAV 同步测试...\n');

    // 测试用例1：数据完全相同
    console.log('=== 测试用例1: 数据完全相同 ===');
    const testData1 = {
        categories: [{ id: 1, name: '分类1' }],
        prompts: [{ id: 1, title: '提示词1' }]
    };
    const localMeta1 = {
        lastSyncTime: '2025-06-13T10:00:00.000Z',
        deviceId: 'device-001',
        syncCount: 5,
        totalRecords: 2
    };
    const remoteMeta1 = {
        lastSyncTime: '2025-06-13T10:01:00.000Z',
        deviceId: 'device-002',
        syncCount: 4,
        totalRecords: 2
    };
    
    const localHash1 = tester.calculateDataHash(testData1);
    const decision1 = tester.makeSyncDecision(testData1, localMeta1, localHash1, testData1, remoteMeta1);
    console.log('结果:', decision1);
    console.log('预期: upload_only (数据相同)');
    console.log('通过:', decision1.action === 'upload_only' && decision1.reason.includes('数据相同'));

    // 测试用例2：本地数据更新
    console.log('\n=== 测试用例2: 本地数据更新 ===');
    const testData2Local = {
        categories: [{ id: 1, name: '分类1-修改' }],
        prompts: [{ id: 1, title: '提示词1' }]
    };
    const testData2Remote = {
        categories: [{ id: 1, name: '分类1' }],
        prompts: [{ id: 1, title: '提示词1' }]
    };
    const localMeta2 = {
        lastSyncTime: '2025-06-13T10:30:00.000Z',
        deviceId: 'device-001',
        syncCount: 6,
        totalRecords: 2
    };
    const remoteMeta2 = {
        lastSyncTime: '2025-06-13T10:00:00.000Z',
        deviceId: 'device-002',
        syncCount: 5,
        totalRecords: 2
    };
    
    const localHash2 = tester.calculateDataHash(testData2Local);
    const decision2 = tester.makeSyncDecision(testData2Local, localMeta2, localHash2, testData2Remote, remoteMeta2);
    console.log('结果:', decision2);
    console.log('预期: upload_only (本地时间较新)');
    console.log('通过:', decision2.action === 'upload_only' && decision2.reason.includes('较新'));

    // 测试用例3：并发修改
    console.log('\n=== 测试用例3: 并发修改 ===');
    const testData3Local = {
        categories: [{ id: 1, name: '分类1-本地修改' }],
        prompts: [{ id: 1, title: '提示词1' }]
    };
    const testData3Remote = {
        categories: [{ id: 1, name: '分类1-远程修改' }],
        prompts: [{ id: 1, title: '提示词1' }]
    };
    const now = new Date();
    const localMeta3 = {
        lastSyncTime: new Date(now.getTime() - 30000).toISOString(), // 30秒前
        deviceId: 'device-001',
        syncCount: 5,
        totalRecords: 2
    };
    const remoteMeta3 = {
        lastSyncTime: new Date(now.getTime() - 10000).toISOString(), // 10秒前
        deviceId: 'device-002',
        syncCount: 5,
        totalRecords: 2
    };
    
    const localHash3 = tester.calculateDataHash(testData3Local);
    const decision3 = tester.makeSyncDecision(testData3Local, localMeta3, localHash3, testData3Remote, remoteMeta3);
    console.log('结果:', decision3);
    console.log('预期: merge (并发修改)');
    console.log('通过:', decision3.action === 'merge' && decision3.reason.includes('并发'));

    // 测试用例4：同设备不同同步计数
    console.log('\n=== 测试用例4: 同设备不同同步计数 ===');
    const testData4Local = {
        categories: [{ id: 1, name: '分类1-新版本' }],
        prompts: [{ id: 1, title: '提示词1' }]
    };
    const testData4Remote = {
        categories: [{ id: 1, name: '分类1-旧版本' }],
        prompts: [{ id: 1, title: '提示词1' }]
    };
    const localMeta4 = {
        lastSyncTime: '2025-06-13T10:00:00.000Z',
        deviceId: 'device-001',
        syncCount: 8,
        totalRecords: 2
    };
    const remoteMeta4 = {
        lastSyncTime: '2025-06-13T09:50:00.000Z',
        deviceId: 'device-001', // 同一设备
        syncCount: 6,
        totalRecords: 2
    };
    
    const localHash4 = tester.calculateDataHash(testData4Local);
    const decision4 = tester.makeSyncDecision(testData4Local, localMeta4, localHash4, testData4Remote, remoteMeta4);
    console.log('结果:', decision4);
    console.log('预期: upload_only (同设备本地版本更新)');
    console.log('通过:', decision4.action === 'upload_only' && decision4.reason.includes('同设备'));

    // 测试用例5：同设备删除操作测试
    console.log('\n=== 测试用例5: 同设备删除操作（不应误判为冲突） ===');
    const testData5Local = {
        categories: [{ id: 1, name: '分类1' }],
        prompts: [{ id: 1, title: '提示词1' }] // 删除了一个提示词
    };
    const testData5Remote = {
        categories: [{ id: 1, name: '分类1' }],
        prompts: [
            { id: 1, title: '提示词1' },
            { id: 2, title: '提示词2' } // 远程还有这个提示词
        ]
    };
    const localMeta5 = {
        lastSyncTime: '2025-06-13T10:00:00.000Z',
        deviceId: 'device-001',
        syncCount: 5, // 相同的同步计数
        totalRecords: 2 // 本地总记录数少了1
    };
    const remoteMeta5 = {
        lastSyncTime: '2025-06-13T10:00:00.000Z',
        deviceId: 'device-001', // 同一设备
        syncCount: 5, // 相同的同步计数
        totalRecords: 3 // 远程总记录数多1
    };
    
    const localHash5 = tester.calculateDataHash(testData5Local);
    const decision5 = tester.makeSyncDecision(testData5Local, localMeta5, localHash5, testData5Remote, remoteMeta5);
    console.log('结果:', decision5);
    console.log('预期: upload_only (同设备删除操作，应上传本地版本)');
    console.log('通过:', decision5.action === 'upload_only' && decision5.reason.includes('删除'));

    // 测试用例6：同设备编辑操作测试
    console.log('\n=== 测试用例6: 同设备编辑操作（不应误判为冲突） ===');
    const testData6Local = {
        categories: [{ id: 1, name: '分类1-编辑后' }],
        prompts: [{ id: 1, title: '提示词1' }]
    };
    const testData6Remote = {
        categories: [{ id: 1, name: '分类1-编辑前' }],
        prompts: [{ id: 1, title: '提示词1' }]
    };
    const localMeta6 = {
        lastSyncTime: '2025-06-13T10:00:00.000Z',
        deviceId: 'device-001',
        syncCount: 5, // 相同的同步计数
        totalRecords: 2 // 相同的记录数
    };
    const remoteMeta6 = {
        lastSyncTime: '2025-06-13T10:00:00.000Z',
        deviceId: 'device-001', // 同一设备
        syncCount: 5, // 相同的同步计数
        totalRecords: 2 // 相同的记录数
    };
    
    const localHash6 = tester.calculateDataHash(testData6Local);
    const decision6 = tester.makeSyncDecision(testData6Local, localMeta6, localHash6, testData6Remote, remoteMeta6);
    console.log('结果:', decision6);
    console.log('预期: upload_only (同设备编辑操作，应上传本地版本)');
    console.log('通过:', decision6.action === 'upload_only' && decision6.reason.includes('编辑'));

    console.log('\n=== 测试完成 ===');
}

// 运行测试
runTests();
