# AGENTS.md — frontend/src/router

路由装配：`MemoryRouter` + `AppShell`（条件 TabBar）+ `AppRoutes`；导航只走 `useNavigation()`。
入口链：`main.tsx` → `App.tsx`（hydration 门控 + Splash）→ `AppRouter`（本目录）。

## WHERE TO LOOK

- `index.tsx`：`AppShell`（`isTabPath(location.pathname)` 才渲染 TabBar）+ `MemoryRouter` 装配。
  必须 `MemoryRouter`：Lynx 无地址栏、无 history API。
- `routes.tsx`：`AppRoutes`（13 路由：P0–P9 + K0–K2，另有 `*` 兜底 + 调试路径显示）；路径全取 `constants/routes.ts` 的 `ROUTES`。
- `navigation.ts`：`useNavigation()`（`StudyNavigationOptions` / `GraphNavigationOptions` /
  `KanaStudyNavigationOptions` 三类参数）；K 关索引走 store 断点（`enterKanaGroup` 先写再跳），禁塞 query 参数。

## CONVENTIONS

- 禁用 `<Link>` / `<NavLink>`；跳转一律 `useNavigation()`。
- Tab 仅 5 个（`/` / `/stages` / `/grammar` / `/review` / `/me`）；K 路由不是 Tab。
- Quiz 有路由无入口（有意保留，见根 AGENTS.md）。

## ANTI-PATTERNS

- 换 `BrowserRouter` / `HashRouter`；页面里手写路径字符串。
- 给 K 路由加 Tab；给 Quiz 加入口。
