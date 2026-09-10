# Notices

## Project notice

STC-B Board 3D Viewer
Copyright 2026 STC-B Board 3D Viewer contributors

This product is licensed under the Apache License, Version 2.0. See `LICENSE`.
This notice provides attribution only; it does not modify the license terms.

## Distributed runtime software

The production bundle includes Three.js 0.186.0, which is distributed under the
MIT License:

Copyright (c) 2010-2026 three.js authors

Vite 8.2.2 contributes browser runtime support code to the production bundle.
Vite is distributed under the MIT License:

Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Direct build and test dependencies also include TypeScript 6.0.3 and Playwright
Core 1.63.0, both under Apache-2.0. The complete transitive dependency versions
and integrity values are pinned in `pnpm-lock.yaml`; license texts for those
packages remain available from their package distributions and registries.

## Board reference artwork

`public/artwork/*.svg` contains generated vector layers derived from an STC-B
reference assembly source supplied to the maintainers. The source PDF, assembly
photos, and other reference material are not distributed in this repository and
are not licensed by this project.

The generated layers are included so the viewer is usable out of the box. They
are visual reconstructions, not a Gerber, netlist, mechanical drawing, or
endorsement by the original board vendor. No ownership is asserted over the
underlying STC-B board design, vendor marks, or source material. Anyone
redistributing these layers or extracting new layers must independently confirm
that they have the necessary rights. Third-party material described in this
section is excluded from the Apache-2.0 grant to the extent it is separately
owned.

## Names and marks

STC-B and other product names are used only to identify compatible hardware.
All trademarks remain the property of their respective owners. This project is
not affiliated with or endorsed by the original hardware vendor.
