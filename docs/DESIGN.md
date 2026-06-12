# 设计系统 — しずかな、就活。

**概念**：把「安静」做成品牌。就活的本质是嘈杂（邮件、日程、焦虑），
产品的视觉与声音都反向行之：纸色、墨色、大量留白、低语气文案。
Bot 的署名句「準備は、できています。」是整个品牌的声音锚点。

## 标识

- 符号 **◎**（二重丸 = 「最高评价」），外环墨色、内点蓝；favicon 同源。
- 文字标 GooJob；页脚水印 GOOJOB 用衬线描边大字。

## 色彩

| token | 值 | 用途 |
|---|---|---|
| paper | `#F6F5F1` | 底色（暖白纸） |
| ink / ink-2 / ink-3 | `#16161A` / `#66666F` / `#9C9CA6` | 文字三级 |
| accent | `#2B49E8` | 蓝（藍）：句点、◎、进度、焦点 |
| aurora | sky `#C2D6FF` · peach `#FFD9C5` · lilac `#E5D4FF` · mint `#CFEFDF` | 背景极光场 |

色彩纪律：内容层基本无彩色，所有颜色情绪由背景极光透过玻璃供给。

## 材质（液态玻璃）

```
背景: linear-gradient(135deg, rgba(255,255,255,.62), rgba(255,255,255,.26))
backdrop-filter: blur(18px) saturate(1.7)
边: 1px rgba(255,255,255,.72)
高光: inset 0 1px 0 rgba(255,255,255,.85)（上缘镜面）
投影: 0 24px 48px -26px rgba(22,22,26,.2)
```

强玻璃（注册卡/手机）blur 30px。全站再覆一层 3% 噪点（SVG turbulence，multiply），
消除数字平板感。

## 字体

- 日文：Hiragino Sans（UI）/ Hiragino Mincho ProN（衬线强调，`font-synthesis:none`
  防伪斜）；`font-feature-settings:"palt"` 收紧标点。
- 西文展示：Instrument Serif（含真斜体），自托管 woff2 共 30KB。
- 等宽（连携码）：SF Mono 系统栈，`letter-spacing:.34em`。

混排规则：黑体大标题中嵌一词明朝（如「終わり」「日本の就活」），制造织体对比。

## 动效

- 缓动：`--ease-out: cubic-bezier(.22,1,.36,1)`；弹性 `--ease-spring: cubic-bezier(.34,1.45,.56,1)`。
- 入场：标题行级 clip 上升；其余 IntersectionObserver 揭示（24px 位移，子项 0.12s 级差）。
- 微交互：磁性按钮（≤9px 跟随）、按下 `scale(.96)`、卡片悬浮 -5px、FAQ WAAPI 高度动画、
  连携码逐字旋入、◎ 印章弹出。
- 氛围：极光 30-47s 漂移 + 指针惰性跟随（lerp 0.035，作用于容器避免与漂移动画冲突）；
  手机 7.5s 浮动；对话循环播放（typing → spring 气泡）。
- 全部受 `prefers-reduced-motion` 约束。

## 文案声线

短句。读点多于句号的节奏感（「しずかな、就活。」）。不喊叫，不感叹号。
通知文案三段式：事实 → 准备材料 → 「準備は、できています。」
