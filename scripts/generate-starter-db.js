#!/usr/bin/env node

/**
 * 生成 starter.db 的脚本
 * 该脚本会创建一个预设数据的数据库模板，用于用户首次启动应用时初始化
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const STARTER_DB_PATH = path.join(__dirname, '..', 'resources', 'prisma', 'starter.db');
const TEMP_DB_PATH = path.join(__dirname, '..', 'temp_starter.db');

async function generateStarterDatabase() {
  // 设置临时数据库URL
  process.env.DATABASE_URL = `file:${TEMP_DB_PATH}`;
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${TEMP_DB_PATH}`
      }
    }
  });

  try {
    console.log('正在创建启动数据库...');
    
    // 推送数据库结构
    console.log('正在推送数据库架构...');
    const { execSync } = require('child_process');
    execSync('yarn prisma db push', {
      env: { ...process.env, DATABASE_URL: `file:${TEMP_DB_PATH}` },
      stdio: 'inherit'
    });

    console.log('正在填充初始数据...');
    
    // // 创建示例用户
    // const adminUser = await prisma.user.create({
    //   data: {
    //     email: '管理员@example.com',
    //     name: '系统管理员'
    //   }
    // });

    // const demoUser = await prisma.user.create({
    //   data: {
    //     email: '演示用户@example.com',
    //     name: '演示用户'
    //   }
    // });

    // // 创建示例文章
    // await prisma.post.create({
    //   data: {
    //     title: '欢迎使用本应用',
    //     content: '这是您的第一篇文章。您可以随时编辑或删除它。',
    //     published: true,
    //     authorId: adminUser.id
    //   }
    // });

    // await prisma.post.create({
    //   data: {
    //     title: '快速入门指南',
    //     content: '这里是一些帮助您快速上手本应用的小贴士...',
    //     published: true,
    //     authorId: adminUser.id
    //   }
    // });

    // await prisma.post.create({
    //   data: {
    //     title: '演示文章',
    //     content: '这是由演示用户创建的一篇演示文章。',
    //     published: false,
    //     authorId: demoUser.id
    //   }
    // });

    console.log('初始数据填充成功');

    // 关闭数据库连接
    await prisma.$disconnect();

    // 确保目标目录存在
    const targetDir = path.dirname(STARTER_DB_PATH);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 复制到最终位置
    fs.copyFileSync(TEMP_DB_PATH, STARTER_DB_PATH);
    
    // 清理临时文件
    if (fs.existsSync(TEMP_DB_PATH)) {
      fs.unlinkSync(TEMP_DB_PATH);
    }

    console.log(`启动数据库创建成功，位置: ${STARTER_DB_PATH}`);
    
  } catch (error) {
    console.error('创建启动数据库失败:', error);
    
    // 清理临时文件
    try {
      await prisma.$disconnect();
    } catch {}
    
    if (fs.existsSync(TEMP_DB_PATH)) {
      fs.unlinkSync(TEMP_DB_PATH);
    }
    
    process.exit(1);
  }
}

if (require.main === module) {
  generateStarterDatabase();
}

module.exports = { generateStarterDatabase };
