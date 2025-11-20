#!/bin/bash

# xmmusic - GitHub Actions 构建触发脚本
# 用途：快速触发多平台构建

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 仓库信息
REPO_OWNER="zdhsoft"
REPO_NAME="xmmusic"
WORKFLOW_FILE="build.yml"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   xmmusic GitHub Actions 构建触发器    ║"
echo "╚════════════════════════════════════════╝"
echo ""

# 检查 gh CLI 是否安装
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI (gh) 未安装${NC}"
    echo ""
    echo "请先安装 GitHub CLI："
    echo "  macOS:   brew install gh"
    echo "  Windows: scoop install gh"
    echo "  Linux:   https://github.com/cli/cli/blob/trunk/docs/install_linux.md"
    echo ""
    exit 1
fi

# 检查是否已登录
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}⚠️  未登录 GitHub${NC}"
    echo ""
    echo "正在打开登录流程..."
    gh auth login
    echo ""
fi

# 显示菜单
echo -e "${BLUE}请选择操作：${NC}"
echo ""
echo "  1) 触发构建（默认分支）"
echo "  2) 触发构建（指定分支）"
echo "  3) 查看最近的构建状态"
echo "  4) 监控当前构建进度"
echo "  5) 下载最新构建产物"
echo "  6) 取消"
echo ""
read -p "请输入选项 [1-6]: " choice

case $choice in
    1)
        echo ""
        echo -e "${BLUE}🚀 触发构建...${NC}"
        gh workflow run $WORKFLOW_FILE -R $REPO_OWNER/$REPO_NAME

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ 构建已触发！${NC}"
            echo ""
            echo "📊 查看构建进度："
            echo "   https://github.com/$REPO_OWNER/$REPO_NAME/actions"
            echo ""

            # 询问是否打开浏览器
            read -p "是否打开浏览器查看？ [y/N]: " open_browser
            if [[ $open_browser =~ ^[Yy]$ ]]; then
                if command -v open &> /dev/null; then
                    open "https://github.com/$REPO_OWNER/$REPO_NAME/actions"
                elif command -v xdg-open &> /dev/null; then
                    xdg-open "https://github.com/$REPO_OWNER/$REPO_NAME/actions"
                elif command -v start &> /dev/null; then
                    start "https://github.com/$REPO_OWNER/$REPO_NAME/actions"
                fi
            fi

            # 询问是否监控
            read -p "是否监控构建进度？ [y/N]: " watch_build
            if [[ $watch_build =~ ^[Yy]$ ]]; then
                sleep 2
                gh run watch -R $REPO_OWNER/$REPO_NAME
            fi
        else
            echo -e "${RED}❌ 触发失败${NC}"
            exit 1
        fi
        ;;

    2)
        echo ""
        read -p "请输入分支名称 [main]: " branch
        branch=${branch:-main}

        echo ""
        echo -e "${BLUE}🚀 触发构建（分支: $branch）...${NC}"
        gh workflow run $WORKFLOW_FILE --ref $branch -R $REPO_OWNER/$REPO_NAME

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ 构建已触发！${NC}"
        else
            echo -e "${RED}❌ 触发失败${NC}"
            exit 1
        fi
        ;;

    3)
        echo ""
        echo -e "${BLUE}📋 最近的构建状态：${NC}"
        echo ""
        gh run list --workflow=$WORKFLOW_FILE --limit=10 -R $REPO_OWNER/$REPO_NAME
        ;;

    4)
        echo ""
        echo -e "${BLUE}👀 监控构建进度...${NC}"
        echo ""
        gh run watch -R $REPO_OWNER/$REPO_NAME
        ;;

    5)
        echo ""
        echo -e "${BLUE}📦 查找最新的构建产物...${NC}"

        # 获取最新成功的 run
        latest_run=$(gh run list --workflow=$WORKFLOW_FILE --status=success --limit=1 --json databaseId --jq '.[0].databaseId' -R $REPO_OWNER/$REPO_NAME)

        if [ -z "$latest_run" ]; then
            echo -e "${RED}❌ 没有找到成功的构建${NC}"
            exit 1
        fi

        echo ""
        echo "最新构建 ID: $latest_run"
        echo ""
        echo "可用的产物："
        gh run view $latest_run --log-failed -R $REPO_OWNER/$REPO_NAME
        echo ""

        # 下载产物
        read -p "是否下载产物到当前目录？ [y/N]: " download
        if [[ $download =~ ^[Yy]$ ]]; then
            mkdir -p ./downloads
            cd ./downloads
            gh run download $latest_run -R $REPO_OWNER/$REPO_NAME
            echo -e "${GREEN}✅ 下载完成！${NC}"
            echo "文件保存在: ./downloads/"
            ls -lh
        fi
        ;;

    6)
        echo ""
        echo "已取消"
        exit 0
        ;;

    *)
        echo ""
        echo -e "${RED}❌ 无效的选项${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}操作完成！${NC}"
echo ""
