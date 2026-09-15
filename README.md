# letsMath
AI maths tutor that can actually see and annotate your work. 

See [PLAN.md](PLAN.md) for the architecture and roadmap.

## Development

Requires Node 24+.

```sh
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY (needed from M2 onward)
npm run dev            # web on http://localhost:5173, API on http://localhost:8787
```

Other scripts: `npm test`, `npm run typecheck`, `npm run build`.

## Whiteboard

Tools: select `V`, hand `H` (or hold Space), pen `P`, highlighter `M`, eraser `E`, line `L`, arrow `A`, rectangle `R`, ellipse `O`, polygon `G`, text `T`, equation `Q`, laser pointer `Z`. Hold Shift to snap angles or keep shapes square.

Undo `Ctrl+Z`, redo `Ctrl+Shift+Z`, delete `Del`, duplicate `Ctrl+D`, select all `Ctrl+A`, zoom `+`/`−`, fit `Shift+1`, 100% `Shift+0`. Double-click text or an equation to edit it. The board autosaves in the browser.

Add `?debug=1` to the URL for the frame-time meter and the 2,000-stroke stress test.
