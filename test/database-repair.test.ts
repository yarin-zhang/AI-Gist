/**
 * 数据库修复功能测试
 * 用于验证数据库健康检查和修复功能
 */

import { databaseServiceManager } from '../src/renderer/lib/services';

// 测试数据库健康状态检查
async function testDatabaseHealthCheck() {
    console.log('=== 测试数据库健康状态检查 ===');
    
    try {
        const healthStatus = await databaseServiceManager.getHealthStatus();
        console.log('健康状态检查结果:', healthStatus);
        
        if (healthStatus.healthy) {
            console.log('✅ 数据库状态正常');
        } else {
            console.log('❌ 数据库存在问题');
            console.log('缺失的对象存储:', healthStatus.missingStores);
        }
        
        return healthStatus;
    } catch (error) {
        console.error('健康状态检查失败:', error);
        return null;
    }
}

// 测试数据库修复功能
async function testDatabaseRepair() {
    console.log('\n=== 测试数据库修复功能 ===');
    
    try {
        const repairResult = await databaseServiceManager.repairDatabase();
        console.log('修复结果:', repairResult);
        
        if (repairResult.success) {
            console.log('✅ 数据库修复成功:', repairResult.message);
        } else {
            console.log('❌ 数据库修复失败:', repairResult.message);
        }
        
        return repairResult;
    } catch (error) {
        console.error('数据库修复失败:', error);
        return null;
    }
}

// 测试检查并修复功能
async function testCheckAndRepair() {
    console.log('\n=== 测试检查并修复功能 ===');
    
    try {
        const result = await databaseServiceManager.checkAndRepairDatabase();
        console.log('检查并修复结果:', result);
        
        if (result.healthy) {
            if (result.repaired) {
                console.log('✅ 数据库已修复:', result.message);
            } else {
                console.log('✅ 数据库状态正常:', result.message);
            }
        } else {
            console.log('❌ 数据库仍有问题:', result.message);
            if (result.missingStores) {
                console.log('仍缺失的对象存储:', result.missingStores);
            }
        }
        
        return result;
    } catch (error) {
        console.error('检查并修复失败:', error);
        return null;
    }
}

// 主测试函数
export async function runDatabaseRepairTests() {
    console.log('开始数据库修复功能测试...\n');
    
    // 等待数据库初始化
    await databaseServiceManager.waitForInitialization();
    
    // 1. 测试健康状态检查
    const healthStatus = await testDatabaseHealthCheck();
    
    // 2. 如果数据库有问题，测试修复功能
    if (healthStatus && !healthStatus.healthy) {
        await testDatabaseRepair();
    }
    
    // 3. 测试综合检查并修复功能
    await testCheckAndRepair();
    
    console.log('\n数据库修复功能测试完成');
}

// 如果直接运行此文件，执行测试
if (typeof window !== 'undefined' && (window as any).runDatabaseTests) {
    runDatabaseRepairTests().catch(console.error);
}
