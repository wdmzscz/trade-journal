# IBKR Flex 自动同步配置教程

通过 IBKR **Flex Web Service**（免费）自动拉取交易数据，替代每次手动下载 CSV。

---

## 一、IBKR 端配置（约 10 分钟）

### 1. 创建 Flex Query（活动账单）

1. 登录 [IBKR Client Portal](https://www.interactivebrokers.com/sso/Login)
2. 进入 **Performance & Reports（业绩与报告）** → **Flex Queries**
3. 点击 **Create（创建）** → 选择 **Activity Flex Query（活动 Flex 查询）**
4. 配置字段（建议至少包含）：
   - **Account Information**（账户信息）
   - **Net Asset Value**（净资产值）
   - **Change in NAV**（净资产值变更）
   - **Deposits & Withdrawals**（存款和取款）— 部分账户界面无此项
   - **Cash Transactions**（现金交易）— **入金/出金用这个**（IBKR 官方等同来源）
   - **Trades**（交易）
5. 日期范围选 **Last 365 Calendar Days**
6. 格式选 **CSV**
7. 保存后记下 **Query ID**（一串数字）

> **说明**：你截图里的自定义 Flex Query（勾选 Trades / NAV 等 section）可以直接用。
> **Include section code and line descriptor** 设为 No 也没问题——系统已支持这种列式 CSV（与手动下载的活动账单格式不同）。
> 同步后账户标签会显示为 **IBKR**，实际账户号为 IBKR 账户 ID（如 `U25840333`）。
> **本金与 Calendar 百分比**：全部来自 IBKR 同步，无需手动填写。
> - **NAV in Base**（每日净资产）→ 计算每日收益率分母（最准确）
> - **Cash Transactions**（现金交易）→ 每笔入金/出金日期与金额（含 6/24、7/8 各 $5,000）
> - **Change in NAV** → 期初/期末净值与期间入金汇总
>
> 若列表里没有 “Deposits & Withdrawals”，勾选 **Cash Transactions** 即可（IBKR 文档：该段包含 deposits and withdrawals）。

### 2. 开启 Flex Web Service 并获取 Token

1. 在 Flex Queries 页面点击 **Flex Web Service Configuration**
2. 打开 **Enable Flex Web Service**
3. 点击 **Generate Token**，复制 Token（只显示一次）
4. （可选）IP 白名单；云端同步可留空

文档：[Flex Web Service | IBKR Campus](https://www.interactivebrokers.com/campus/ibkr-api-page/flex-web-service/)

---

## 二、Supabase 端配置

### 1. 运行数据库脚本

在 Supabase **SQL Editor** 运行 `supabase/schema.sql` 里 **ibkr_sync_settings** 表相关语句。

### 2. 部署 Edge Function

```bash
supabase login
supabase link --project-ref 你的项目ID
supabase secrets set CRON_SECRET=随机长字符串
supabase functions deploy sync-ibkr
```

### 3. GitHub Secrets（定时同步）

| Name | Value |
|------|-------|
| `CRON_SECRET` | 与 Supabase 相同 |
| `VITE_SUPABASE_URL` | 已有 |

---

## 三、在 Trade Journal 使用

1. 打开网站并登录
2. 侧边栏 **IBKR Sync**
3. 填入 Token 和 Query ID
4. 选同步频率 → 启用自动同步 → 保存
5. 点 **立即同步** 测试

---

## 四、费用与实时性

- **免费**：Flex API 不另外收费
- **非实时推送**：是拉取报表；推荐 **每小时自动同步 + 手动立即同步**
- **Token 安全**：只存 Supabase，不进前端或 GitHub

---

## 五、常见问题

### `Edge Function returned a non-2xx status code`

1. **Token 过期**：在 IBKR 重新 Generate Token，在 IBKR Sync 页保存后再试
2. **未保存配置**：先填 Token + Query ID 并点保存，再点立即同步
3. **Edge Function 未更新**：本地改过后需重新部署：
   ```bash
   supabase functions deploy sync-ibkr
   ```
4. 仍失败时，到 Supabase Dashboard → **Edge Functions** → **sync-ibkr** → **Logs** 查看具体报错
