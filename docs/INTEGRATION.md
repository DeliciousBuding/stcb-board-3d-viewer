# State adapter integration

The viewer is a renderer, not a transport. A host adapts its own latest device
snapshot into `BoardVisualState` and pushes it into the viewer. The adapter
should preserve the platform's online, quality, and freshness semantics outside
the 3D renderer.

## Minimal adapter

```ts
type BoardVisualState = {
  powered: boolean
  display: string
  ledMask: number
  ledColor: 'blue' | 'red' | 'green'
}

function renderSnapshot(frame: HTMLIFrameElement, state: BoardVisualState) {
  frame.contentWindow?.postMessage(
    { type: 'stcb-board:set-state', state },
    new URL(frame.src).origin,
  )
}
```

Recommended behavior:

1. Keep only the latest state per device; replace older pending patches.
2. Coalesce high-frequency samples with `requestAnimationFrame`.
3. On reconnect, send a full snapshot before incremental patches.
4. On offline/stale data, set `powered: false`; retain the last display only if
   the UI also communicates that the value is stale.
5. Never forward a device command through the visual state channel.

## Example mapping

A device adapter may receive a generic snapshot such as:

```json
{
  "online": true,
  "updated_at": 1780000000,
  "state": {
    "display": "12345678",
    "led_mask": 255
  }
}
```

It maps the fields to the viewer contract:

```ts
renderSnapshot(frame, {
  powered: snapshot.online,
  display: String(snapshot.state.display ?? '').slice(0, 8),
  ledMask: Number(snapshot.state.led_mask ?? 0) & 0xff,
})
```

The field names above are an example adapter contract, not a protocol owned by
this repository. A real integration should keep device-specific translation in
the driver or application layer.

## CloudPath example

CloudPath's browser live store already exposes the latest `DeviceView` state.
A CloudPath plugin or page can map that object to the same viewer message; no
CloudPath Core change is required for the standalone page. Embedding the viewer
inside a driver device-detail section would require a generic device-visual UI
primitive and should not introduce STC-B-specific branches into Core.
