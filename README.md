# JUNAF Website

静态网站，由 Vercel 从 GitHub `main` 分支部署。

目前仓库没有数据库、身份验证或服务端接口。GitHub 仓库可以作为简单的内容管理入口；如果以后需要多人编辑、草稿审核和媒体库，再接入正式 CMS。

Tools 首个应用是 `/tools/prompter/`。当前稿件保存在用户浏览器的 localStorage，不会同步到服务器；可通过 TXT 导入导出备份。
