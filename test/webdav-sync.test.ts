/**
 * WebDAV 同步功能单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'crypto'
import os from 'os'
import { testDataGenerators } from './helpers/test-utils'

// WebDAV 同步测试类
class WebDAVSyncTester {
    constructor() {
        this.deviceId = this.generateDeviceId()
    }

    generateDeviceId() {
        return crypto.createHash('md5').update(os.hostname() + process.pid).digest('hex')
    }

    // 改进的哈希算法
    calculateDataHash(data) {
        if (!data || typeof data !== 'object') {
            return crypto.createHash('sha256').update('').digest('hex').substring(0, 16)
        }
        
        // 标准化数据：排序键、移除时间戳等易变字段
        const normalizedData = this.normalizeDataForHashing(data)
        const dataString = JSON.stringify(normalizedData)
        return crypto.createHash('sha256').update(dataString).digest('hex').substring(0, 16)
    }

    normalizeDataForHashing(data) {
        const normalized = {}
        
        // 只包含实际数据，排除元数据
        if (data.categories) normalized.categories = this.sortArray(data.categories, 'id')
        if (data.prompts) normalized.prompts = this.sortArray(data.prompts, 'id')
        if (data.aiConfigs) normalized.aiConfigs = this.sortArray(data.aiConfigs, 'id')
        if (data.settings) normalized.settings = this.sortObject(data.settings)
        
        return normalized
    }

    sortArray(arr, keyField = 'id') {
        if (!Array.isArray(arr)) return arr
        return arr.slice().sort((a, b) => {
            const aKey = a[keyField] || JSON.stringify(a)
            const bKey = b[keyField] || JSON.stringify(b)
            return aKey.toString().localeCompare(bKey.toString())
        })
    }

    sortObject(obj) {
        if (!obj || typeof obj !== 'object') return obj
        const sorted = {}
        Object.keys(obj).sort().forEach(key => {
            sorted[key] = obj[key]
        })
        return sorted
    }

    // 改进的同步决策算法
    makeSyncDecision(localData, localMetadata, localDataHash, remoteData, remoteMetadata) {
        // 情况1：远程没有数据
        if (!remoteData || !remoteMetadata) {
            return {
                action: 'upload_only',
                reason: '远程无数据，上传本地数据'
            }
        }

        const remoteDataHash = this.calculateDataHash(remoteData)

        // 情况2：数据完全相同
        if (localDataHash === remoteDataHash) {
            return {
                action: 'upload_only',
                reason: '数据相同，更新元数据'
            }
        }

        const localTime = new Date(localMetadata.lastSyncTime).getTime()
        const remoteTime = new Date(remoteMetadata.lastSyncTime).getTime()
        const timeDiff = Math.abs(localTime - remoteTime)

        // 情况3：检查是否是同一设备的不同同步
        if (localMetadata.deviceId === remoteMetadata.deviceId) {
            const syncCountDiff = localMetadata.syncCount - remoteMetadata.syncCount
            if (syncCountDiff > 0) {
                return {
                    action: 'upload_only',
                    reason: '同设备本地版本更新'
                }
            } else if (syncCountDiff < 0) {
                return {
                    action: 'download_only',
                    reason: '同设备远程版本更新'
                }
            } else {
                // 同步计数相同但数据不同，可能是删除或编辑操作
                const localRecords = localMetadata.totalRecords || 0
                const remoteRecords = remoteMetadata.totalRecords || 0
                if (localRecords !== remoteRecords) {
                    return {
                        action: 'upload_only',
                        reason: '同设备删除操作，上传本地版本'
                    }
                } else {
                    return {
                        action: 'upload_only',
                        reason: '同设备编辑操作，上传本地版本'
                    }
                }
            }
        }

        // 情况4：不同设备的修改，需要更仔细的分析
        
        // 4.1：时间差很大，使用时间戳决策
        if (timeDiff > 300000) { // 5分钟
            if (localTime > remoteTime) {
                return {
                    action: 'upload_only',
                    reason: '本地数据较新'
                }
            } else {
                return {
                    action: 'download_only',
                    reason: '远程数据较新'
                }
            }
        }

        // 4.2：时间差较小，可能是并发修改
        if (timeDiff < 60000) { // 1分钟
            return {
                action: 'merge',
                reason: '并发修改，需要合并'
            }
        }

        // 4.3：中等时间差，使用同步计数辅助判断
        const syncCountDiff = localMetadata.syncCount - remoteMetadata.syncCount
        if (Math.abs(syncCountDiff) > 5) {
            if (syncCountDiff > 0) {
                return {
                    action: 'upload_only',
                    reason: '本地同步计数显著更高'
                }
            } else {
                return {
                    action: 'download_only',
                    reason: '远程同步计数显著更高'
                }
            }
        }

        // 情况5：无法明确决策，标记为冲突
        return {
            action: 'conflict_detected',
            reason: `无法自动解决冲突: 时间差${Math.round(timeDiff/1000)}秒, 同步计数差${syncCountDiff}`
        }
    }
}

describe('WebDAV 同步功能测试', () => {
    let tester

    beforeEach(() => {
        tester = new WebDAVSyncTester()
    })

    describe('数据哈希计算', () => {
        it('应该为相同数据生成相同哈希', () => {
            const data1 = {
                categories: [{ id: 1, name: '分类1' }],
                prompts: [{ id: 1, title: '提示词1' }]
            }
            const data2 = {
                categories: [{ id: 1, name: '分类1' }],
                prompts: [{ id: 1, title: '提示词1' }]
            }

            const hash1 = tester.calculateDataHash(data1)
            const hash2 = tester.calculateDataHash(data2)

            expect(hash1).toBe(hash2)
        })

        it('应该为不同数据生成不同哈希', () => {
            const data1 = {
                categories: [{ id: 1, name: '分类1' }]
            }
            const data2 = {
                categories: [{ id: 1, name: '分类2' }]
            }

            const hash1 = tester.calculateDataHash(data1)
            const hash2 = tester.calculateDataHash(data2)

            expect(hash1).not.toBe(hash2)
        })

        it('应该正确处理空数据', () => {
            const hash1 = tester.calculateDataHash(null)
            const hash2 = tester.calculateDataHash({})

            expect(typeof hash1).toBe('string')
            expect(typeof hash2).toBe('string')
        })
    })

    describe('同步决策算法', () => {
        it('数据完全相同时应该只上传元数据', () => {
            const testData = {
                categories: [{ id: 1, name: '分类1' }],
                prompts: [{ id: 1, title: '提示词1' }]
            }
            const localMeta = testDataGenerators.createMockSyncMetadata({
                lastSyncTime: '2025-06-13T10:00:00.000Z',
                deviceId: 'device-001',
                syncCount: 5,
                totalRecords: 2
            })
            const remoteMeta = testDataGenerators.createMockSyncMetadata({
                lastSyncTime: '2025-06-13T10:01:00.000Z',
                deviceId: 'device-002',
                syncCount: 4,
                totalRecords: 2
            })
            
            const localHash = tester.calculateDataHash(testData)
            const decision = tester.makeSyncDecision(testData, localMeta, localHash, testData, remoteMeta)

            expect(decision.action).toBe('upload_only')
            expect(decision.reason).toContain('数据相同')
        })

        it('本地数据更新时应该上传', () => {
            const localData = {
                categories: [{ id: 1, name: '分类1-修改' }],
                prompts: [{ id: 1, title: '提示词1' }]
            }
            const remoteData = {
                categories: [{ id: 1, name: '分类1' }],
                prompts: [{ id: 1, title: '提示词1' }]
            }
            const localMeta = testDataGenerators.createMockSyncMetadata({
                lastSyncTime: '2025-06-13T10:30:00.000Z',
                deviceId: 'device-001',
                syncCount: 6,
                totalRecords: 2
            })
            const remoteMeta = testDataGenerators.createMockSyncMetadata({
                lastSyncTime: '2025-06-13T10:00:00.000Z',
                deviceId: 'device-002',
                syncCount: 5,
                totalRecords: 2
            })
            
            const localHash = tester.calculateDataHash(localData)
            const decision = tester.makeSyncDecision(localData, localMeta, localHash, remoteData, remoteMeta)

            expect(decision.action).toBe('upload_only')
            expect(decision.reason).toContain('较新')
        })

        it('并发修改时应该合并', () => {
            const localData = {
                categories: [{ id: 1, name: '分类1-本地修改' }],
                prompts: [{ id: 1, title: '提示词1' }]
            }
            const remoteData = {
                categories: [{ id: 1, name: '分类1-远程修改' }],
                prompts: [{ id: 1, title: '提示词1' }]
            }
            const now = new Date()
            const localMeta = testDataGenerators.createMockSyncMetadata({
                lastSyncTime: new Date(now.getTime() - 30000).toISOString(), // 30秒前
                deviceId: 'device-001',
                syncCount: 5,
                totalRecords: 2
            })
            const remoteMeta = testDataGenerators.createMockSyncMetadata({
                lastSyncTime: new Date(now.getTime() - 10000).toISOString(), // 10秒前
                deviceId: 'device-002',
                syncCount: 5,
                totalRecords: 2
            })
            
            const localHash = tester.calculateDataHash(localData)
            const decision = tester.makeSyncDecision(localData, localMeta, localHash, remoteData, remoteMeta)

            expect(decision.action).toBe('merge')
            expect(decision.reason).toContain('并发')
        })

        it('同设备不同同步计数时应该上传本地版本', () => {
            const localData = {
                categories: [{ id: 1, name: '分类1-新版本' }],
                prompts: [{ id: 1, title: '提示词1' }]
            }
            const remoteData = {
                categories: [{ id: 1, name: '分类1-旧版本' }],
                prompts: [{ id: 1, title: '提示词1' }]
            }
            const localMeta = testDataGenerators.createMockSyncMetadata({
                lastSyncTime: '2025-06-13T10:00:00.000Z',
                deviceId: 'device-001',
                syncCount: 8,
                totalRecords: 2
            })
            const remoteMeta = testDataGenerators.createMockSyncMetadata({
                lastSyncTime: '2025-06-13T09:50:00.000Z',
                deviceId: 'device-001', // 同一设备
                syncCount: 6,
                totalRecords: 2
            })
            
            const localHash = tester.calculateDataHash(localData)
            const decision = tester.makeSyncDecision(localData, localMeta, localHash, remoteData, remoteMeta)

            expect(decision.action).toBe('upload_only')
            expect(decision.reason).toContain('同设备本地版本更新')
        })

        it('同设备删除操作不应误判为冲突', () => {
            const localData = {
                categories: [{ id: 1, name: '分类1' }],
                prompts: [{ id: 1, title: '提示词1' }] // 删除了一个提示词
            }
            const remoteData = {
                categories: [{ id: 1, name: '分类1' }],
                prompts: [
                    { id: 1, title: '提示词1' },
                    { id: 2, title: '提示词2' } // 远程还有这个提示词
                ]
            }
            const localMeta = testDataGenerators.createMockSyncMetadata({
                lastSyncTime: '2025-06-13T10:00:00.000Z',
                deviceId: 'device-001',
                syncCount: 5, // 相同的同步计数
                totalRecords: 2 // 本地总记录数少了1
            })
            const remoteMeta = testDataGenerators.createMockSyncMetadata({
                lastSyncTime: '2025-06-13T10:00:00.000Z',
                deviceId: 'device-001', // 同一设备
                syncCount: 5, // 相同的同步计数
                totalRecords: 3 // 远程总记录数多1
            })
            
            const localHash = tester.calculateDataHash(localData)
            const decision = tester.makeSyncDecision(localData, localMeta, localHash, remoteData, remoteMeta)

            expect(decision.action).toBe('upload_only')
            expect(decision.reason).toContain('删除')
        })

        it('同设备编辑操作不应误判为冲突', () => {
            const localData = {
                categories: [{ id: 1, name: '分类1-编辑后' }],
                prompts: [{ id: 1, title: '提示词1' }]
            }
            const remoteData = {
                categories: [{ id: 1, name: '分类1-编辑前' }],
                prompts: [{ id: 1, title: '提示词1' }]
            }
            const localMeta = testDataGenerators.createMockSyncMetadata({
                lastSyncTime: '2025-06-13T10:00:00.000Z',
                deviceId: 'device-001',
                syncCount: 5, // 相同的同步计数
                totalRecords: 2 // 相同的记录数
            })
            const remoteMeta = testDataGenerators.createMockSyncMetadata({
                lastSyncTime: '2025-06-13T10:00:00.000Z',
                deviceId: 'device-001', // 同一设备
                syncCount: 5, // 相同的同步计数
                totalRecords: 2 // 相同的记录数
            })
            
            const localHash = tester.calculateDataHash(localData)
            const decision = tester.makeSyncDecision(localData, localMeta, localHash, remoteData, remoteMeta)

            expect(decision.action).toBe('upload_only')
            expect(decision.reason).toContain('编辑')
        })

        it('远程无数据时应该上传本地数据', () => {
            const localData = {
                categories: [{ id: 1, name: '分类1' }]
            }
            const localMeta = testDataGenerators.createMockSyncMetadata()
            const localHash = tester.calculateDataHash(localData)
            const decision = tester.makeSyncDecision(localData, localMeta, localHash, null, null)

            expect(decision.action).toBe('upload_only')
            expect(decision.reason).toContain('远程无数据')
        })
    })

    describe('设备ID生成', () => {
        it('应该生成唯一的设备ID', () => {
            const tester1 = new WebDAVSyncTester()
            const tester2 = new WebDAVSyncTester()

            expect(typeof tester1.deviceId).toBe('string')
            expect(tester1.deviceId.length).toBeGreaterThan(0)
            // 由于进程ID相同，同一进程内生成的设备ID应该相同
            expect(tester1.deviceId).toBe(tester2.deviceId)
        })
    })

    describe('数据标准化', () => {
        it('应该正确排序数组', () => {
            const unsortedArray = [
                { id: 3, name: 'C' },
                { id: 1, name: 'A' },
                { id: 2, name: 'B' }
            ]
            const sortedArray = tester.sortArray(unsortedArray, 'id')

            expect(sortedArray[0].id).toBe(1)
            expect(sortedArray[1].id).toBe(2)
            expect(sortedArray[2].id).toBe(3)
        })

        it('应该正确排序对象', () => {
            const unsortedObject = {
                z: 'last',
                a: 'first',
                m: 'middle'
            }
            const sortedObject = tester.sortObject(unsortedObject)
            const keys = Object.keys(sortedObject)

            expect(keys[0]).toBe('a')
            expect(keys[1]).toBe('m')
            expect(keys[2]).toBe('z')
        })
    })
})
