#!/bin/bash

# 打开 dist 目录的脚本
# 使用 Finder 打开项目的 dist 目录

# 获取脚本所在目录（项目根目录）
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# dist 目录路径
DIST_DIR="$PROJECT_DIR/dist"

# 检查 dist 目录是否存在
if [ -d "$DIST_DIR" ]; then
    echo "正在用 Finder 打开 dist 目录..."
    open "$DIST_DIR"
else
    echo "错误: dist 目录不存在"
    echo "请先运行 'npm run dist' 构建应用"
    exit 1
fi
