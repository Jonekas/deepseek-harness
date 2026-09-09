# Agent Note: 引擎原生 JSON 校验

Status: implemented

[English](2026-09-09-engine-native-json-validation.md) | 中文

## Problem

不同 JavaScript 引擎的原生函数源码格式不同。将内建构造函数与包含 V8 格式的字面量比较，会拒绝普通 Firefox 对象。Assistant-stream 展开因此拒绝合法历史，即使历史请求成功，聊天仍然为空。

## Decision

[JSON 校验器](../../../../packages/util/values/src/index.ts) 将候选构造函数的原生源码与当前引擎对应的 `Object` 或 `Array` 构造函数比较。构造函数名称和 prototype 身份检查仍然必需。跨 realm 接受规则不依赖 V8 的空白格式。

## Alternatives considered

**归一化原生源码空白。** 与当前引擎的构造函数比较，无需另行定义归一化规则，同时保留同一引擎内的精确源码比较。

**放宽普通容器校验。** 删除构造函数检查会接受伪造的 prototype；引擎兼容性不需要削弱这种拒绝。

## Consequences

Firefox 历史可以通过与 Chromium 相同的无损 JSON 检查，无需更改持久化 Session、RPC 数据或认证。该 helper 仍假设同进程 JavaScript 内建对象可信；这不是新的敌意代码隔离机制。

## Testing

[JSON 回归测试](../../../../packages/core/session/tests/json.spec.ts) 覆盖本地和外部 realm 容器的多行原生表示，同时保留伪造构造函数拒绝。真实浏览器验证覆盖 Firefox 和 Chromium 的初始历史及向前翻页。仅基于 Node 的浏览器测试不能替代第二种 JavaScript 引擎的执行。
