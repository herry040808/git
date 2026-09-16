# 大学生接驳车时刻表

一个纯静态的校园接驳车时刻表页面：原生 HTML / CSS / JavaScript，没有后端、没有构建工具、没有第三方依赖。用浏览器打开即可运行，也可以直接托管到 GitHub Pages。

## 功能

- 深色界面，顶部渐变标题 + 实时时钟（时:分:秒）与日期星期，每秒更新
- 「智能 / 工作日 / 周末」切换：智能模式按设备本地日期自动选择时刻表，周六周日走周末班次
- 「查询时间」可指定一个时间点预览那时的下一班车，点「使用当前时间」恢复跟随真实时间
- 「即将发车」卡片按方向列出接下来 3 班车，显示发车时间、线路、路线和「N 分钟 后」倒计时；剩余不足 1 分钟显示「即将发车」
- 点「显示完整时刻表」展开两个方向全部班次，已发车的班次自动置灰
- 时刻表数据每分钟自动重新读取并重绘，倒计时每秒更新

## 文件结构

```
.
├── index.html          页面结构
├── style.css           深色主题样式与移动端适配
├── app.js              时间、日期切换、倒计时与渲染逻辑
├── data/
│   └── schedule.json   时刻表数据（唯一需要日常维护的文件）
└── README.md
```

## 本地预览

页面通过 `fetch` 读取 `data/schedule.json`。**直接双击 `index.html`（`file://` 协议）会被浏览器拦截**（页面会给出提示），所以要用一个本地静态服务器打开。

### 方式一：Node.js（推荐，本机已装 Node，无需安装任何依赖）

在 PowerShell 里执行下面两行，第二行请整行复制：

```powershell
cd D:\Codex\git
node -e 'const h=require(`http`),f=require(`fs`),p=require(`path`),m={html:`text/html`,css:`text/css`,js:`text/javascript`,json:`application/json`};h.createServer((q,s)=>{let u=decodeURIComponent(q.url.split(`?`)[0]);if(u.endsWith(`/`))u+=`index.html`;const n=p.join(process.cwd(),u);f.readFile(n,(e,d)=>{if(e){s.writeHead(404);s.end(`404`);return}s.writeHead(200,{[`content-type`]:(m[p.extname(n).slice(1)]||`application/octet-stream`)+`; charset=utf-8`});s.end(d)})}).listen(8000,()=>console.log(`已在 8000 端口启动`))'
```

看到「已在 8000 端口启动」后，用浏览器访问 <http://localhost:8000/>；按 `Ctrl + C` 停止服务器。

> 这条命令刻意没有使用双引号：Windows PowerShell 5.1 在调用 `node.exe` 时会吞掉参数里的双引号，所以脚本中一律用反引号（模板字符串）代替。整行复制即可，不用额外加引号，也不用改动。

### 方式二：VS Code + Live Server

本机已安装 VS Code，但还没有 Live Server 扩展。在扩展面板搜索并安装 `Live Server` 后，右键 `index.html` → `Open with Live Server` 即可，修改代码保存后浏览器会自动刷新。

### 方式三：Python（本机未安装，换台电脑时可用）

如果机器上有 Python，可以直接：

```powershell
cd D:\Codex\git
python -m http.server 8000
```

没有 `python` 命令时改用 `py -m http.server 8000`。

### 方式四：npx（需要能访问 npm 源）

```powershell
cd D:\Codex\git
npx serve .
```

注意：本机 PowerShell 的执行策略禁止运行 `npm.ps1` / `npx.ps1`，直接用 `npx` 可能报「禁止运行脚本」。这种情况改用 `npx.cmd serve .`，或使用方式一 / 方式二。

端口被占用时把 `8000` 换成其它端口（例如 `8080`）即可，页面内部都是相对路径，不受影响。

## 修改时刻表数据

只需要编辑 `data/schedule.json`，保存后页面最迟 1 分钟内自动生效（也可以手动刷新页面）。

```json
{
  "meta": {
    "title": "兰台研究生公寓（南师附中）接驳车时刻表",
    "updated": "2026-09-16",
    "note": "工作日班次 · 数据来源：接驳车时刻表 一、（工作日）"
  },
  "directions": [
    {
      "key": "fromLantai",
      "label": "从兰台出发",
      "subtitle": "兰台 → 北门转盘 · 纪忠楼 · 文学院",
      "note": "早间段 7:30-9:40 循环发车"
    },
    {
      "key": "toLantai",
      "label": "前往兰台",
      "subtitle": "纪忠楼 · 文学院 · 北门转盘 → 兰台",
      "note": "早间段 7:40-9:50 循环发车"
    }
  ],
  "schedules": {
    "weekday": {
      "label": "工作日班次（周一 ~ 周五）",
      "fromLantai": [
        { "time": "07:30", "line": "纪忠楼线", "tone": "amber", "route": "兰台 - 北门转盘 - 纪忠楼", "note": "2 辆车" },
        { "time": "10:00", "line": "北门线", "tone": "blue", "route": "兰台 - 北门转盘" }
      ],
      "toLantai": [
        { "time": "10:10", "line": "北门线", "tone": "blue", "route": "北门转盘 - 兰台" }
      ]
    },
    "weekend": {
      "label": "周末班次（周六、周日）· 待补充",
      "fromLantai": [],
      "toLantai": [],
      "note": "当前只有工作日时刻表数据，周末班次待补充。"
    }
  }
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `meta.title` | 页面主标题 |
| `meta.updated` | 数据更新日期，显示在页脚 |
| `meta.note` | 副标题；留空字符串则不显示 |
| `directions[]` | 决定页面上出现哪些方向、顺序和标题 |
| `directions[].key` | 方向标识，需与 `schedules` 里的键名一致 |
| `directions[].note` | 方向补充说明，显示在标题下方，可省略 |
| `schedules.weekday` / `schedules.weekend` | 工作日、周末两套班次，结构完全相同 |
| `schedules.*.note` | 当日说明横幅（如「周末班次待补充」），可省略 |
| `time` | 发车时间，24 小时制 `HH:MM`，也接受 `7:05` |
| `route` | 路线文字，例如「兰台 → 教学区 · 图书馆」 |
| `line` | 线路名，显示为小标签，可省略 |
| `tone` | 标签配色，可选 `blue` / `green` / `amber`，可省略 |
| `note` | 备注，显示在路线下方，可省略 |

几点约定：

- 班次不用自己排序，页面会按 `time` 自动排序
- `time` 格式不合法的条目会被忽略，不会导致页面报错
- 要增删方向，同时改 `directions` 和两套 `schedules` 即可，无需改 JS
- 删除某天某方向的全部班次时，该方向会显示「今日暂无班次」

## 工作日 / 周末如何判定

以运行页面的设备本地时间为准：周六、周日使用 `weekend`，其余使用 `weekday`。

顶部工具条的「自动切换 / 工作日 / 周末」按钮用于预览：临时查看另一套时刻表时不必改系统时间，刷新页面后会回到自动模式。

跨天（例如凌晨零点）后页面会自动切换并重新渲染。

## 自动刷新逻辑

- 时钟与倒计时：每 1 秒刷新
- 时刻表数据：每分钟重新读取一次 `data/schedule.json` 并重绘；浏览器标签页被挂起后，超出 2 分钟会强制同步一次
- 从后台切回页面时立即对时，避免倒计时停留在旧值

## 部署到 GitHub Pages

仓库已推送到 GitHub 后，在仓库 **Settings → Pages** 中选择 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`，保存后访问：

```
https://herry040808.github.io/git/
```

## 数据来源与待补充项

- 班次数据来自《兰台研究生公寓（南师附中）接驳车时刻表 一、（工作日）》，只覆盖**工作日**。
- 原表按「早间段 / 平峰段 / 晚间段」分三段，包含三条线路：`兰台 - 北门转盘`（北门线）、`兰台 - 北门转盘 - 文学院 - 纪忠楼`（文学院线）、`兰台 - 北门转盘 - 纪忠楼`（纪忠楼线）。
- 早间段是循环发车（兰台出发 7:30-9:40，回兰台 7:40-9:50）。原表只在兰台方向列出 7:30 / 7:40 / 9:30 三个具体班次，回程没有列具体时刻，所以页面上用「方向说明」呈现，未虚构班次。
- 原表脚注「晚间 19:45 至 21:45，因南师附中下课，兰台回北门时间存在不确定性」已放入「从兰台出发」的方向说明。
- **周末班次尚未录入**：原图没有周末时刻表，`schedules.weekend` 目前为空数组，周末打开页面会显示「今日暂无班次安排」和对应说明。拿到周末时刻表后，按同样格式补进 `weekend` 的 `fromLantai` / `toLantai` 即可，不需要改代码。
