# Third-party research notices

No third-party game code, art, or audio is included in the runtime. The projects below were inspected only to study general architecture. Runtime code and assets in Troy V16 were independently authored.

| Repository | Revision | License | Reviewed ideas |
|---|---|---|---|
| ricardo-foundry/canvas-vampire-survivors | `e616704889e57efc9c1f49098786a95c364008d3` | MIT | Declarative stage data, audio buses |
| FreePeak/opencombat | `aad6c51adbe6d89254b2302c7742449090596b86` | MIT | State machines, animation events |
| dknos/kitty-kaki-survivors | `411c1968d31688f19f8f80d09eebae90b1e27ca9` | MIT | Content registration, telegraph geometry |
| risingore/gear-arena | `bd1fc80261153ce9295bb603121f9cdbd6329d74` | MIT code only | Atomic shop transitions; all asset paths denied |

## Audio

Every V16 runtime audio entry uses `sourceClass: original`. `audio-source-allowlist-v16.json` therefore contains no external assets.
