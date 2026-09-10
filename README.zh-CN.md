# STC-B Digital Twin

[English](README.md) | [简体中文](README.zh-CN.md)

[![CI](https://github.com/DeliciousBuding/stcb-board-3d-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/DeliciousBuding/stcb-board-3d-viewer/actions/workflows/ci.yml)
[![Pages](https://github.com/DeliciousBuding/stcb-board-3d-viewer/actions/workflows/pages.yml/badge.svg)](https://github.com/DeliciousBuding/stcb-board-3d-viewer/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12-339933.svg)](https://nodejs.org/)

一个可嵌入、可编程的 STC-B 学习板浏览器数字孪生。它使用 Three.js 程序化构建板体、封装、焊点与材质，并将参考装配图和铜箔层作为独立矢量纹理，支持交互检查、正反面查看、拆解，以及数码管和 LED 状态同步。

![STC-B Board 3D Viewer preview](docs/board-preview.png)

> 这是非官方社区项目。STC-B 及相关商标归各自权利人所有。

## 能力

- 92 × 72 mm 板体与 34 个可拾取组件，支持旋转、缩放、聚焦、拆解、俯视和背面检查。
- 四层矢量参考资产分别呈现正面/背面丝印与铜箔，不依赖运行时 PDF。
- 程序化封装细节：真实开口、弯曲引脚、带孔焊盘、凹陷焊锡、贴片端帽和确定性表面纹理。
- 数码管与 8 路 LED 的渲染状态可由浏览器直接控制。
- 提供 `window.stcbBoardViewer` 和 `postMessage` 两种嵌入接口，不绑定任何设备协议。
- 静止时停止重绘，只在交互、动画或状态变化时唤醒渲染循环。

## 快速开始

要求 Node.js 22.12+ 和 pnpm 10。

```bash
pnpm install
pnpm dev
```

生产构建：

```bash
pnpm build
pnpm preview
```

常用检查：

```bash
pnpm typecheck
pnpm test
pnpm test:python
pnpm check
```

## 实时状态接口

查看器只负责把状态表现为三维画面，不读取串口、不连接业务 API，也不下发设备命令。状态适配器可以来自 WebSocket、SSE、REST 轮询或桌面宿主。

### 同页调用

```ts
window.stcbBoardViewer.setVisualState({
  powered: true,
  display: '12345678',
  ledMask: 0b10101010,
  ledColor: 'blue',
})

const state = window.stcbBoardViewer.getVisualState()
```

### iframe / postMessage

宿主页面先监听就绪事件：

```ts
window.addEventListener('message', (event) => {
  if (event.data?.type === 'stcb-board:ready') {
    event.source?.postMessage({
      type: 'stcb-board:set-state',
      state: { powered: true, display: '12345678', ledMask: 0xff },
    }, event.origin)
  }
})
```

查看器会回复 `stcb-board:state` 或 `stcb-board:error`。生产集成应校验 `event.origin`，不要直接信任任意外部页面。

使用 `?embed=1` 可隐藏工具栏与检查器，只保留适合仪表盘或数字孪生面板的 3D 画布。完整适配器模式见 [`docs/INTEGRATION.md`](docs/INTEGRATION.md)。

## 状态契约

| 字段 | 类型 | 说明 |
|---|---|---|
| `powered` | `boolean` | 是否以通电状态渲染；离线数据源应显式设为 `false` |
| `display` | `string` | 最多 8 个字符，仅允许数字、空格和 `-`，不足位自动补空格 |
| `ledMask` | `0..255` | bit 0 是最右侧 L0，bit 7 是最左侧 L7 |
| `ledColor` | `blue \| red \| green` | 仅代表浏览器预览配色，不代表实板具有 RGB 能力 |

补丁按字段合并，非法值会被拒绝。当前接口表达 8 位字符显示；若设备需要逐段或逐页同步，应在设备适配器中先把原始协议翻译为稳定的显示语义，再扩展这里的状态模型。

## 结构

```text
src/
  board-layout.ts       毫米布局、封装方位和组件清单
  packages.ts           封装、引脚、开口与发光元件几何
  detail-geometry.ts    焊锡弯月面、带孔焊盘和弯曲引脚
  board-artwork.ts      正反面矢量层、阻焊和表面通道纹理
  board-model.ts        板体装配、组件实例化和视觉状态
  render-studio.ts      灯光、环境、阴影和渲染统计
  visual-state.ts       状态校验与不可变快照
tools/
  extract_artwork.py    可选：从合法持有的参考 PDF 导出矢量层
  screenshot.mjs        基于系统 Edge/Chrome 的浏览器回归与截图
```

## 重建矢量资产

仓库已经包含可运行的派生 SVG，普通使用不需要 PDF。只有在合法持有参考材料并需要重建设备资产时，才安装 PyMuPDF：

```bash
python -m pip install pymupdf
python tools/extract_artwork.py \
  --pdf /path/to/reference-board-schematic.pdf \
  --source-label reference-board-schematic.pdf
```

导出器会验证四层输入、前后焊盘一对一配准和孔位误差；任何失败都不会覆盖已有资产。源 PDF 和参考照片不在本仓库中分发。

## 可信边界

- 模型是视觉重建，不是机械 CAD、Gerber、网表或 DRC 结果。
- 孔位来自装配图的焊盘符号，孔径、器件高度和焊锡形态仍属外观近似。
- 照片、原理图与实板之间的版本差异会保留为显式说明，不擅自推断 BOM。
- 浏览器回归证明渲染和交互行为，不等于真板装配、电气能力或尺寸验收。
- `tools/screenshot.mjs` 默认使用系统 Edge，可通过 `--channel` 改用其他 Playwright channel。

## 安全与发布

- 运行时不加载远程脚本、字体或模型资源。
- 仓库不包含凭据、真实设备清单、串口日志或个人材料。
- CI 在 `ubuntu-latest` 上执行类型检查、Node/Python 测试和生产构建。
- GitHub Pages 发布完全由 [`pages.yml`](.github/workflows/pages.yml) 构建，不从本地上传 `dist`。

## 贡献

见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。安全问题请按 [`SECURITY.md`](SECURITY.md) 私下报告。

## 许可证

代码以 [MIT License](LICENSE) 发布。第三方依赖和派生板卡素材的边界见 [`NOTICE.md`](NOTICE.md)。
