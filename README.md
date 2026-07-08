# Trade Journal

类似 TradeZella / Stonk Journal 的交易日志与分析网站。使用 React + TypeScript + Vite + Tailwind CSS 构建，数据保存在浏览器 localStorage。

## 功能

- **Dashboard** — 总盈亏、胜率、盈亏比、期望值等 KPI；累计盈亏曲线、每日盈亏柱状图、胜负分布饼图、按星期/标的/策略分析
- **Trades** — 交易列表，支持搜索、筛选、导出 CSV、删除
- **Daily Journal** — 日历视图，盘前计划、盘后复盘、经验教训、评分
- **Add Trade** — 手动添加交易（做多/做空、已平仓/持仓中）
- **Import CSV** — 拖拽上传，兼容 TradeZella 通用 CSV 格式，可下载模板

## 快速开始

需要先安装 [Node.js](https://nodejs.org/)（建议 18+）。

```bash
cd D:\trade-journal
npm install
npm run dev
```

浏览器打开 http://localhost:5173

首次启动会自动加载示例交易数据，便于查看 Dashboard 效果。

## 构建

```bash
npm run build
npm run preview
```

## CSV 导入格式

| 字段 | 说明 |
|------|------|
| Symbol | 标的代码（必填） |
| Side | long / short |
| Entry Date | 入场日期 |
| Exit Date | 出场日期 |
| Entry Price | 入场价 |
| Exit Price | 出场价（留空则为持仓中） |
| Quantity | 数量 |
| Fees | 手续费 |
| Setup | 策略名称 |
| Tags | 标签（逗号分隔） |
| Notes | 笔记 |
| Account | 账户 |
| R Multiple | R 倍数 |

## 技术栈

- React 18 + TypeScript
- Vite 6
- Tailwind CSS 3
- Recharts（图表）
- React Router 6
- PapaParse（CSV 解析）
- localStorage（本地持久化）

## 后续可扩展

- 后端 API + 数据库（PostgreSQL / SQLite）
- 用户认证与多账户
- 券商 API 自动同步
- 交易截图上传
- 税务报告导出
