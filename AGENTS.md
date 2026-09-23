# 工作协议

本文件只负责导航，具体规则按需读取。

1. 开工先跑 `atlas route <路线名>`，**只读它列出的文件**。路线列表：`atlas route --list`。
2. 没有对应路线，用 `atlas find <关键词>`，不要 grep 全仓。
3. 收工运行 `atlas check`，并验证改动的功能。
4. 功能改动验证通过后，提交本次改动，附一句简短 commit message。

本仓库中，`atlas` 命令通过 `python3 atlas/atlas.py` 执行。
