# 五子棋联机对战 — Node 服务器版

15×15 五子棋，支持不同人联机对战（WebSocket 实时同步），另有双人同屏、人机对战。

## 文件结构

```
gomoku-online/
  server.js            # Node + WebSocket 服务器，同时托管静态页面（无数据库，房间存在内存里）
  package.json         # 唯一依赖：ws
  public/index.html    # 棋盘页面（创建/加入房间、复制邀请链接、观战、计分、换边重开）
  README.md
```

## 本地运行

```bash
npm install
npm start
# 打开 http://localhost:3000
```

## 玩法

1. 一人点「创建房间」，得到 6 位房间码（或点「复制邀请链接」发给对方）
2. 对方打开链接（自动填好房间码）点「加入房间」
3. 创建者执黑先行；第三人加入同一房间码为观战
4. 一局结束点「重新开始」，双方换边再来一局，胜场比分保留

服务器端校验：只能轮到自己时落子、不能落在已有棋子上、五子连珠由服务器判定胜负。

## 部署到 Abasthan（Web Service，免费档即可）

1. 把这整个文件夹推到一个 GitHub / GitLab / Bitbucket 仓库根目录（不要只推 `public/`）
2. Abasthan 控制台：Create App → **Web Service**，连上这个仓库和 main 分支
3. Build command：`npm install`（留空也行，Abasthan 会按 package.json 安装）
   Start command：`npm start`
   选 **Free** 档（0.1 vCPU / 512MB，跑这个小游戏足够）
4. 部署完成拿到 `https://你的应用.abasthan.app`，打开就能玩

注意：

- 这会占用账号唯一的**免费应用名额**。之前那个纯静态单文件版就不用再部署了，二选一。
- 服务器用 `$PORT` 环境变量（Abasthan 会注入），本地默认 3000。
- 房间只存在内存里：服务重启后房间消失，需要重新创建；不保存棋谱和账号。
- 免费档按秒计费、服务暂停后不收费；但部署后它会一直运行，消耗的是免费额度内的运行时间。
