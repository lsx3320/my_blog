---
title: 'REA 逆向一切——从「编译一个加法程序」到「AI 逆向还原源码」'
description: '用最小的实验验证 REA 到底有多「神」：编译一个加法程序、删掉源码，再看 AI 怎么把它逆向还原——拆解 REA 做了什么、没做什么。'
pubDate: 2026-10-24
category: '技术'
tags: ['REA', '逆向工程', 'AI', 'Ghidra', 'MCP', '教程']
---

> **教学对象**：对逆向工程、AI 编程助手、MCP 有初步概念的学习者
> **教学目标**：① 理解「逆向工程」的完整链路；② 看懂 REA 到底做了什么、没做什么；③ 亲手复现一次最小逆向实验
> **实验环境**：macOS (Apple Silicon) + REA 6.7.0 + Ghidra 12.1.4

## 一、热身：REA 是个啥，为什么会火

最近有个叫 **REA** 的项目莫名其妙地火了，全称非常霸气：**Reverse Engineer Anything——逆向一切**，短短几天冲到 20 多万 Star。

有人用它逆向了付费软件 Typeless，把它变成可以调用本地模型免费使用的工具；也有人让它分析剪映并复刻出一个叫「硬刻」的软件。

于是有了一个耸动的说法：**「软件保密的时代结束了，商业软件的护城河没了」**。

> 📌 **教学提示**：先别急着下结论。这节课的核心，就是用最小的实验亲手验证——REA 到底有多"神"，还是只是"搭了个桥"。

## 二、实验准备：制造一个「待攻破的目标」

我们用 C 语言写一个最简单的程序，编译成二进制 `a.out`，它就是我们要攻破的对象。

**实验步骤 0：准备目标 → 删除源码**

```c
#include <stdio.h>
int main(){int a=3,b=5;printf("%d\n",a+b);return 0;}
```

- 写入 `calc.c` → `gcc calc.c -o a.out` 编译
- `rm calc.c` 删除源码（**防止 Agent 偷看源码作弊**）
- `ls calc.c` 确认报 `No such file or directory`

![步骤0：源码已删除](/posts/rea-nixiang-shiyan-jiaoan/step0_deleted.png)

> 📌 **教学提示**：这一步的"删源码"是关键——只有源码彻底消失，后面 Agent 的逆向结果才是"真本事"，而不是读文件抄答案。

## 三、验证「二进制不可读」

**实验步骤 1a：运行程序**

`./a.out` 输出 `8`（即 3+5 的加法结果）。

![步骤1a：运行输出 8](/posts/rea-nixiang-shiyan-jiaoan/step1a_run.png)

**实验步骤 1b：直接看二进制**

`xxd a.out | head -5` 看到的是十六进制乱码，根本没法当代码读。

![步骤1b：十六进制乱码](/posts/rea-nixiang-shiyan-jiaoan/step1b_xxd.png)

> 📌 **教学提示**：这就是"逆向工程"要解决的问题——程序运行正常，但它的"原始样子"（机器码/二进制）人类没法直接读懂。注意开头 `cffa edfe`，这是 macOS 可执行文件（Mach-O）的魔数，说明它跑在 64 位 ARM 架构上。

## 四、发起逆向：让 Agent 上场

现在把 `a.out` 交给 AI 编程助手（接入了 REA MCP），让它反编译。

**实验步骤 2a：`open_binary` 加载目标**

这是 REA 的第一个关键调用，返回目标的类型信息：

```json
{
  "path": ".../rea-lab/a.out",
  "format": "mach-o",
  "kind": "executable",
  "architecture": "arm64"
}
```

![步骤2a：open_binary 调用记录](/posts/rea-nixiang-shiyan-jiaoan/step2a_open_binary.png)

**实验步骤 2b：完整调用链**

展开详情面板，能看到 Agent 的完整调用链：`open_binary` → `binary_overview` → `list_names` → 反编译。

![步骤2b：完整调用链](/posts/rea-nixiang-shiyan-jiaoan/step2b_detail.png)

> 📌 **教学提示**：`open_binary` 背后其实就是 Linux 的 `file` 命令——它只告诉你"这是啥文件、什么架构"，REA 只是把它包成了 JSON 结构化输出而已。**这是理解 REA 本质的第一个关键点：它不生产信息，只是转述工具的输出。**

## 五、获取概览，定位 main

**实验步骤 3：`binary_overview` 获取程序概览**

![步骤3：binary_overview 概览](/posts/rea-nixiang-shiyan-jiaoan/step3_overview.png)

关键信息：架构 `arm64`、入口点 `0x100000000`、**3 个 procedure**、9 个段、11 个字符串。

**实验步骤 4：定位并反编译 main**

先 `list_names` 找符号，发现 main 的真实符号是 `entry`（地址 `0x100000460`），`_printf` 是外部导入函数；再用 `procedure_pseudo_code` 反编译：

```c
undefined4 entry(void)
{
  _printf("%d\n");
  return 0;
}
```

![步骤4：main 的伪代码](/posts/rea-nixiang-shiyan-jiaoan/step4_pseudocode.png)

> 📌 **教学提示（本课最关键的观察）**：伪代码里**看不到 `a+b`**！原因见下一节。而真正干活的，是 REA 背后的 **Ghidra**（免费开源的逆向工具）。所以说白了，这个任务 = `file` 命令 + `Ghidra` 反编译，REA 只是告诉 Agent"你可以用哪些工具"。

## 六、还原源码，并理解「变量名之谜」

**实验步骤 5a：还原出 `restored_calc.c`**

根据反编译结果，Agent 还原出了 C 源码：

![步骤5a：还原的源码](/posts/rea-nixiang-shiyan-jiaoan/step5a_restored.png)

**实验步骤 5b：与原始代码对比**

![步骤5b：diff 对比](/posts/rea-nixiang-shiyan-jiaoan/step5b_diff.png)

对比结论：**逻辑结构完全一致**（`a=3, b=5, printf("%d\n", a+b), return 0`），差异仅在格式（单行 vs 多行、`int main()` vs `int main(void)`）。

> 📌 **教学提示（第二个关键点——"作弊"之谜）**：
>
> 1. **为什么伪代码里没有 `a+b`？** 因为编译器做了**常量折叠优化**——`a=3, b=5` 是编译期常量，`3+5` 在编译时就被算好了，所以伪代码只剩 `_printf("%d\n")`。但**汇编里那条 `add` 指令还在**：
>    ```
>    mov w8, #0x3     ; a = 3
>    mov w8, #0x5     ; b = 5
>    add w10, w8, w9  ; a + b
>    ```
> 2. **为什么变量名能"完美还原"成 a、b？** 不是作弊——Ghidra 根本不知道原始符号名（它把变量标成无名栈变量 `[x29,#-0x8]`、`[x29,#-0xc]`）。是**大模型"见多识广"，根据 add 指令和上下文，把这两个无名变量猜成了最常用的 `a`、`b`**。这是大模型的能力，和 REA 无关。

## 七、总结：REA 到底做了什么、没做什么

**REA 的本质**：把一大推逆向工具（file、Ghidra、Hopper、IDA 等）用 MCP/CLI 形式"搭了个桥"，并写了 Skill 告诉 Agent 什么时候该用什么工具。**它自己几乎没做集成工作。**

- ✅ **做了什么**：让普通人知道了"AI 可以做逆向"；降低了逆向的入门门槛。
- ❌ **没做什么**：不生产分析结果（结果来自 Ghidra 等工具）；不负责装工具（本地还得自己装 Ghidra + JDK，甚至 mac arm64 的原生反编译器要自己编译）；变量名还原靠的是大模型常识，不是它。

**三条思考（教案收束）**：

1. **出圈价值**：REA 最大的作用是"让大家知道 AI 能做逆向"，就像 Computer Use 让 Blender 火了一样——工具早就有，火的是"被看见"。
2. **未来趋势**：当模型能力足够强时，这类"中间人说明书/工具桥"反而会成为累赘——Agent 自己就能选更合适的工具。
3. **对商业软件的冲击**：真正有冲击的不是 REA 本身，而是"逆向这么方便"这件事被广泛知道后，会有越来越多人去逆向并开源商业软件。

## 附录：本教案实验的复现环境

| 组件               | 版本/路径                                               |
| ---------------- | --------------------------------------------------- |
| REA (rea-agents) | 6.7.0                                               |
| Ghidra           | 12.1.4（含手编的 arm64 原生反编译器 `os/mac_arm_64/decompile`） |
| JDK              | openjdk 25.0.1                                      |
| 目标程序             | `a.out`（mach-o, arm64, sha256 `5873b2...`）          |

> 说明：Ghidra 官方 zip 不含 Apple Silicon 的 arm64 原生反编译器，本实验已自行编译补齐——这也正好印证了正文"本地还得装工具"的结论。
