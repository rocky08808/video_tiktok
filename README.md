# 瞬看

竖屏短视频。Next.js 用 HLS 播放 Cloudflare R2 里的 `m3u8`。

没配 R2 时会播放几条公开示例流，用来看上下滑、点赞和评论。示例流是横屏片源，页面会裁成竖屏。

## 本地运行

```bash
npm install
npm run dev
```

打开 http://localhost:3000 。

## 把视频放进 R2

1. 切成 HLS。分片和播放列表放在同一个目录，点播列表必须包含全部分片：

```bash
ffmpeg -y -i input.mp4 -vf scale=720:-2 -c:v libx264 -profile:v main -level 4.0 -pix_fmt yuv420p -c:a aac -b:a 128k -ac 2 -hls_time 2 -hls_list_size 0 -hls_playlist_type vod -hls_segment_filename "seg_%03d.ts" index.m3u8
```

已经是竖屏的素材可以改成 `-vf scale=-2:1280`。

2. 按清单里的路径上传，例如：

```text
videos/001/index.m3u8
videos/001/seg_000.ts
videos/001/poster.jpg
```

`m3u8` 的 Content-Type 用 `application/vnd.apple.mpegurl`，`ts` 用 `video/mp2t`。

3. 给存储桶打开公开访问（`r2.dev` 子域或自定义域名）。浏览器直接拉流时还要配 CORS，规则在 `r2-cors.json`，来源可以改成你的站点。

4. 复制环境变量并填公开域名：

```bash
cp .env.example .env.local
```

```bash
NEXT_PUBLIC_R2_PUBLIC_BASE=https://pub-xxxxxxxx.r2.dev
```

5. 编辑 `src/data/catalog.json`。`src` 写成相对路径时，会拼到上面的域名后面。也可以写成完整的 `https://.../index.m3u8`。

不想改代码时，把同样格式的 JSON 传到 R2，再设置 `R2_MANIFEST_URL`。示例见 `src/data/manifest.example.json`。

本机调试若 R2 拦截 localhost Referer，在 `.env.local` 加 `HLS_PROXY=1`。生产请直连 R2 CDN（配好 CORS/Referer）；线上勿常规开代理，紧急才用 `HLS_PROXY=force`。

## 连接宝塔 MongoDB

视频文件仍在 R2。配了 `MONGODB_URI` 之后，信息流改从宝塔的 MongoDB 读，不再读 `catalog.json`。

1. 宝塔软件商店安装 MongoDB。数据库里新建库，例如 `video`，记下用户名和密码。
2. 本机调试时，配置文件里的 `bindIp` 加上 `0.0.0.0`，宝塔安全和云安全组放行 `27017`，来源尽量只填你的 IP。网站如果就跑在这台宝塔上，不要对外开放端口，连接用 `127.0.0.1`。
3. 在 `.env.local` 加上连接串。宝塔这个用户的认证库是数据库名：

```bash
MONGODB_URI=mongodb://video_user:密码@服务器IP:27017/video?authSource=video
NEXT_PUBLIC_R2_PUBLIC_BASE=https://pub-xxxxxxxx.r2.dev
```

4. 把当前清单写入数据库：

```bash
npm run db:seed
```

集合默认是 `videos`。每条记录的 `src` 仍然是 R2 上的 `m3u8` 路径。之后在宝塔或 Compass 里增删记录，刷新页面就会变。

## 操作

- 上滑、滚轮、上下键：切换视频
- 单击：暂停或播放
- 双击：点赞
- 空格：暂停
- M：开关声音
- 底部细线：拖动进度

Chrome 和 Firefox 用 hls.js。Safari 用系统自带的 HLS。当前这条和前后各一条会预加载。
