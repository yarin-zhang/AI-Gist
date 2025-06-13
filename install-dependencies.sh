#!/bin/bash

# WebDAV 同步和数据管理功能依赖安装脚本

echo "开始安装 WebDAV 同步和数据管理功能所需的依赖包..."

# 检查是否安装了 yarn
if ! command -v yarn &> /dev/null; then
    echo "错误: 未找到 yarn，请先安装 yarn"
    echo "安装命令: npm install -g yarn"
    exit 1
fi

echo "正在安装运行时依赖..."

# 安装 WebDAV 相关依赖
echo "安装 webdav 包..."
yarn add webdav

# 安装 UUID 生成依赖
echo "安装 uuid 包..."
yarn add uuid

echo "正在安装开发依赖..."

# 安装类型定义
echo "安装 TypeScript 类型定义..."
yarn add -D @types/webdav @types/uuid

# 可选：CSV 处理依赖
read -p "是否安装 CSV 处理依赖？(y/n): " install_csv
if [[ $install_csv =~ ^[Yy]$ ]]; then
    echo "安装 CSV 处理依赖..."
    yarn add csv-parser csv-writer
    yarn add -D @types/csv-parser
fi

echo "所有依赖安装完成！"
echo ""
echo "请注意："
echo "1. 安装完成后，WebDAV 功能将可以正常使用"
echo "2. 如果遇到类型错误，请重启 VS Code 或 TypeScript 服务"
echo "3. 可以通过设置页面配置 WebDAV 同步和数据管理功能"
