# Agent Note: 保留超过目录容量的已完成 Codex 响应

Status: implemented

[English](2026-09-08-codex-completion-capacity.md) | 中文

## 问题

当报告的输入与缓存输入之和超过目录容量时，pi-ai 的静默溢出启发式检测会把成功的 `stop` 转换为上下文错误。Codex 可以在超过该估计值时返回完整答案。拒绝这些答案也会拒绝压缩摘要，导致长会话即使收到成功的提供方响应也无法缩减历史。

## 决策

pi-ai 适配器仅对以 `stop` 结束的 `openai-codex-responses` 消息省略溢出分类的容量参数。提供方声明的错误、零输出长度溢出以及其他协议保持现有分类。根据[空补全策略](2026-07-24-empty-model-response-is-retryable.zh.md)，空的 Codex stop 仍然是 `EMPTY_RESPONSE` 失败。

[精确路由容量与压缩策略](../architecture/2026-07-20-routed-model-context-and-compaction-policy.zh.md)保持不变：目录元数据仍驱动主动压缩。一次成功请求不能证明路由支持的最大上下文，因此修复不提高配置容量，也不重写已存储会话。

已安装 pi-ai 的兼容字段仍受到穷尽分类，以便适配器能够针对其声明的依赖重新构建。`thinking.budget` 加入现有聊天模板占位符。`thinkingTokenBudgetField`、`vllmPriority`、`supportsMaxOutputTokens`、`supportsMidConvoEffort` 和 `allowedFallbackModels` 不向通用配置开放，但仍继承已安装目录中的值；不会默认启用新的提供方控制项。

## 考虑过的替代方案

**提高目录限制。** 公开 API 的模型限制不能证明 Codex 订阅路由的权限。提高猜测的限制仍使成功补全的分类受未来目录偏差影响。

**全局移除基于用量的溢出检测。** 其他协议依赖该启发式检测发现静默截断。例外应属于已完成响应提供了相反证据的协议。

**修改压缩或 agent loop（智能体循环）。** 两者都消费适配器的结束原因。正确分类成功摘要即可让现有压缩替换与重试生效，无需在其中引入提供方专用逻辑。

## 后果

已完成的 Codex 内容可以进入持久历史，成功摘要可以缩减历史。真正的提供方拒绝仍可通过现有溢出路径恢复。保守的目录容量可能提前触发压缩；此更改并不声称每个超大请求都能成功，也不声称能仅凭用量检测服务端静默截断。

回归覆盖使用一条已完成的 Codex 响应：输入为 399,016 token，包含缓存用量，对照 272,000 token 的目录容量；同时保留显式溢出、空响应与零输出长度失败。
