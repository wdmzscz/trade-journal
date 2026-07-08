# 免费云端部署指南

部署完成后，访问地址为：

**https://wdmzscz.github.io/trade-journal/**

无需购买域名，GitHub Pages 免费提供托管。

---

## 架构说明

| 组件 | 作用 | 费用 |
|------|------|------|
| **GitHub Pages** | 托管前端网页 | 免费 |
| **Supabase** | 数据库 + 用户登录 + 实时同步 | 免费额度足够个人使用 |

任意设备登录同一账号后，添加/删除/修改的数据会自动同步。

---

## 第一步：创建 Supabase 项目

1. 打开 [https://supabase.com](https://supabase.com)，用 GitHub 账号注册/登录
2. 点击 **New Project**，选择免费计划（Free）
3. 设置数据库密码（请记住），选择离你较近的区域（如 Singapore）
4. 等待项目创建完成（约 1-2 分钟）

### 运行数据库脚本

1. 进入 Supabase Dashboard → **SQL Editor**
2. 点击 **New query**
3. 复制项目中的 `supabase/schema.sql` 全部内容，粘贴并点击 **Run**
4. 确认无报错

### 获取 API 密钥

1. 进入 **Settings → API**
2. 复制：
   - **Project URL** → 这是 `VITE_SUPABASE_URL`
   - **anon public** key → 这是 `VITE_SUPABASE_ANON_KEY`

### 关闭邮件验证（可选，方便测试）

1. 进入 **Authentication → Providers → Email**
2. 关闭 **Confirm email**（否则注册后需点邮件链接才能登录）

---

## 第二步：配置 GitHub Secrets

1. 打开 GitHub 仓库：https://github.com/wdmzscz/trade-journal
2. 进入 **Settings → Secrets and variables → Actions**
3. 点击 **New repository secret**，添加两个 secret：

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key |

---

## 第三步：启用 GitHub Pages

1. 进入仓库 **Settings → Pages**
2. **Source** 选择 **GitHub Actions**（不是 Deploy from a branch）
3. 保存

---

## 第四步：推送代码触发部署

将代码推送到 `master` 分支后，GitHub Actions 会自动构建并部署。

1. 进入仓库 **Actions** 标签页查看部署进度
2. 部署成功后访问：https://wdmzscz.github.io/trade-journal/

---

## 本地开发（带云端同步）

1. 复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

2. 填入 Supabase 的 URL 和 anon key
3. 运行：

```bash
npm run dev
```

有 `.env` 时会启用登录和云端同步；没有则仍使用本地 localStorage。

---

## 数据迁移

首次用已有本地数据的浏览器登录云端账号时，系统会自动把 localStorage 中的数据上传到 Supabase。

---

## 常见问题

**Q: 注册后无法登录？**  
A: 检查 Supabase 是否开启了邮件验证。可在 Authentication 设置中关闭，或去邮箱点确认链接。

**Q: 同步失败？**  
A: 确认 `schema.sql` 已执行，且 GitHub Secrets 配置正确。侧边栏底部会显示同步状态。

**Q: 刷新子页面 404？**  
A: 部署 workflow 已包含 SPA fallback（404.html），直接访问子路由应正常。

**Q: Supabase 免费额度够用吗？**  
A: 个人交易日志完全够用（500MB 数据库、5万月活用户、Realtime 免费）。
