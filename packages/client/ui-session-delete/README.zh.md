# Session 删除插件

在 Web 左侧会话菜单中增加“永久删除会话”。本次运行中已打开的会话会拒绝删除并返回原因；重启 Harness 后才能删除它们。删除 JSONL 会话目录后不可恢复；本地图片附件只有在没有其他会话引用时才会清理。

这是独立的 DSH Profile 插件包：安装后会自动挂载所需的 Cordis 配置层。

```bash
dsh plugin --profile web add @deepseek-ai/dsh-client-ui-session-delete
```

本仓库构建出的 tarball 也可作为离线／本地安装源。安装或更新后重启对应 Profile；已修改的本仓库 Web Profile 默认启用该插件。
