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

Add `?debug=1` to the URL for the frame-time meter, the 2,000-stroke stress test, what the tutor last saw, and per-reply tokens, cost and timings.

## The tutor

Write on the board, then ask a question or tap **Check my work**. The tutor sees a snapshot of your board and can mark it up: circling, highlighting, ticks and crosses, arrows, angle arcs, and written notes. Its marks draw themselves on, appear as chips under its reply that jump to them on the board, and one undo removes a whole turn's marks.

Add `?mock=1` to the URL to get scripted replies and drawings without calling Claude, which costs nothing.

Spending is capped: the server prices every turn, keeps a running total in `.usage/`, and refuses to call Claude once `DEV_BUDGET_USD` is reached. `npm run check:api` and `npm run check:tools` verify the key and the tool schemas for free.
