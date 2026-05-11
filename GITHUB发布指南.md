# 🚀 GitHub Actions 自动打包指南

配置完成！只需推送到 GitHub，自动打包好三个平台的版本。

---

## 📦 打包内容

| 平台 | 输出文件 | 说明 |
|-----|---------|------|
| **Windows** | `.exe`、`.msi` | 单文件可执行，双击即用 |
| **macOS** | `.dmg` | 通用二进制（Intel + Apple Silicon） |
| **Linux** | `.AppImage`、`.deb` | 跨发行版 |

---

## 🔧 使用步骤

### 第一步：创建 GitHub 仓库

1. 访问 https://github.com/new
2. 创建一个新仓库（公开或私有都可以）
3. 不需要初始化 README、.gitignore 等

### 第二步：推送代码

```bash
cd ~/.openclaw/workspace/projects/audio-scheduler

# 初始化 Git
git init
git add .
git commit -m "初始提交：音频定时播放器"

# 关联远程仓库（替换成你的仓库地址）
git remote add origin https://github.com/你的用户名/仓库名.git
git branch -M main
git push -u origin main
```

### 第三步：触发自动打包

**方法 A：打标签触发（推荐）**

```bash
git tag v1.0.0
git push origin v1.0.0
```

**方法 B：手动触发**

1. 打开 GitHub 仓库页面
2. 点击 **Actions** 标签
3. 点击左侧「构建发布」工作流
4. 点击右侧 **Run workflow** → 选择 main 分支 → 点击运行

---

## 📥 下载打包好的文件

### 方式 1：GitHub Release（推荐）

1. 打开 GitHub 仓库页面
2. 点击右侧 **Releases**
3. 找到最新的 Draft 版本（草稿）
4. 里面有三个平台的安装包，直接下载

### 方式 2：Actions 运行记录

1. 打开 **Actions** 标签
2. 点击最近一次成功的运行记录
3. 拉到页面底部，**Artifacts** 区域下载

---

## ⏱️ 构建时间

- 首次构建：约 15-20 分钟（需要缓存依赖）
- 后续构建：约 5-10 分钟

---

## 💡 小贴士

1. **首次构建较慢**是正常的，Rust 编译需要时间，后续会快很多
2. Windows exe 可能会被 SmartScreen 提示"未知发布者"，点击"更多信息" → "仍要运行"即可
3. 每次发布新版本，只要打个新 tag 就行：`git tag v1.0.1 && git push origin v1.0.1`
4. 如需修改应用图标，替换 `src-tauri/icons/` 目录下的图标文件即可

---

## 🎯 推荐使用流程

```bash
# 修改代码后
git add .
git commit -m "修复 xxx 问题"

# 打新版本标签
git tag v1.0.1
git push origin v1.0.1

# 坐等 GitHub 自动打包完成 🎉
```

---

**需要帮忙推送到 GitHub 吗？我可以帮你执行命令！** 🥜
