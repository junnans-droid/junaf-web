# JUNAF Website

静态网站，由 Vercel 从 GitHub `main` 分支部署。

JUNAF 是连接音乐、视频、思考与工具的设计语言。`/music/` 是其中一个应用方向，`api-server/` 是独立的 Node.js + MongoDB API。前端由 Vercel 部署，API 运行在雨云香港服务器，由 `api.junaf.com` 的 Nginx 通过 HTTPS 代理。当前曲库仍为空；公开注册和购买均关闭。

公开 GitHub 仓库只发布前端文件。`api-server/` 保存在本地交付目录和服务器，不上传到公开仓库。

统一管理后台位于 `/admin/`。它以 JUNAF 设计语言组织整体概览、音乐、用户、视频、思考、工具和系统状态；目前音乐核款可操作，视频与思考管理模块仍在筹备。

音乐系统迁移范围与状态见 [JUNAF-MUSIC.md](JUNAF-MUSIC.md)。

Tools 首个应用是 `/tools/prompter/`。当前稿件保存在用户浏览器的 localStorage，不会同步到服务器；可通过 TXT 导入导出备份。
