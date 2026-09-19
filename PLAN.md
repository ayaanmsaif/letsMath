# letsMath — Plan: an AI maths tutor that sees and draws on your whiteboard

## Context

You want a platform where a student works through maths problems (starting with trigonometry) on a whiteboard while an AI tutor watches, talks with them, and **draws on the board**. That means marking up their work (circling angles, highlighting, ticks and crosses) **and drawing anything new: diagrams, graphs, constructions, sketches**. Voice comes later. **Phase 1 is a chat panel on the left and a whiteboard on the right.** The whole point is that the AI can reliably *see* the board and *add to or change* it smoothly, the student can draw easily, and the running cost stays low.

The repo `C:\Projects\letsMath` is empty apart from a README, an MIT LICENSE, and a GitHub remote (`ayaanmsaif/letsMath`). The stack below matches CalTrack's web app (Vite, React 19, TypeScript, Tailwind v4, Geist, motion). Node 24 and npm 11 are installed.

## Step 0 (first action after approval)

Save this plan into the repo as **`C:\Projects\letsMath\PLAN.md`**. It's an exact copy of this document. Then **start Phase 1 at M0** and work through the milestones in order, each ending in its demo and checks. Don't commit unless asked. An Anthropic API key (or an `ant auth login` profile) is needed from M2 onward; M0–M1 don't need one.

---

## 1. Is the "vector map" the right idea? Yes, with two refinements

**✔ Keep: the board is stored as vectors.** Every stroke, shape, and diagram is data (points, boxes, text), not pixels. That gives us undo, erase, select, sharp zoom, tiny saves, and replay of how the student wrote. Most importantly, we can **re-render any part of the board, at any size, for the AI**.

**✘ Refinement 1: the AI shouldn't *read* the vector data.** Handwriting is thousands of (x, y) points. A model can't reliably tell a "7" from a "1" in raw coordinates, and a full board would cost tens of times more tokens than a picture. Instead, each time the AI looks it gets:
- a **snapshot image**, sized so Claude never resizes it (so pixel coordinates line up exactly), and
- a short **board digest**: IDs and boxes of each group of student writing, the shapes and diagrams, and the tutor's own drawings, with *new since last look* flagged.

**✔/✘ Refinement 2: the AI *can* write vector content, through the right channel for each job.** Making it type every coordinate by hand would be slow, expensive, and imprecise. So it gets three channels, from most precise to most flexible (§4):
1. **Annotations** on student work (`circle g9`, `mark ✗`, `angle_arc`). These snap to the real ink.
2. **Maths diagrams** (`draw_diagram`). The AI describes the diagram in *maths terms*: points A=(0,0), B=(4,0), triangle ABC, right angle at B, plot `2sin x + 1`. Our compiler turns that into exact vectors and places them in free space on the board.
3. **Anything else** (`draw_svg`). The AI writes vector drawing code directly: a ladder against a wall, a clock face, a ship on a bearing, a pie chart. This is **your original idea, kept as the catch-all**. The code is checked and rebuilt safely before it goes on the board.

**➕ Improvement on the fade-in:** drawings are *drawn on* stroke by stroke, like a pen. Diagrams build in construction order (base, then sides, then angle marks, then labels), with a small "Tutor" pen cursor gliding to each spot. Highlights wipe in and text writes left to right. Reduced-motion users get a plain fade.

## 2. Whiteboard engine: build our own, on a proven ink library

| Option | Verdict |
|---|---|
| **tldraw** | Best SDK, and it ships an AI agent starter kit. But production use needs a commercial license (reported around $6k/yr). The free hobby license is non-commercial only, and there's a watermark otherwise. Too costly for a product that must be cheap. Keep it as the "buy" fallback. |
| **Excalidraw** (MIT) | Free, but it draws to a canvas, so animating individual drawings is hard. It also has a sketchy diagram look and isn't built around handwriting or maths diagrams. |
| **Custom React + SVG + `perfect-freehand`** ✅ | `perfect-freehand` (MIT) is the same pressure-sensitive ink algorithm tldraw uses (same author). We fully control the AI drawing layer, animations, maths diagrams, and styling, with **$0 licensing**. The cost is building select, eraser, and so on ourselves; that scope is fixed in M1. |

**Chosen stack.** npm workspaces monorepo:
- **Web:** Vite + React 19 + TS + Tailwind v4 + Geist + `motion` + `lucide-react`, with `zustand` for state and `perfect-freehand` for ink.
- **Maths:** MathJax 4 (TeX→self-contained SVG) for maths on the board, MathLive (MIT) for easy equation input, `@cortex-js/compute-engine` (MIT; parses and evaluates LaTeX and plain expressions) for exact function plots, and `react-markdown` + `remark-math` + `rehype-katex` for chat.
- **Server:** Hono on Node with the official `@anthropic-ai/sdk`.
- **Shared:** a pure-TypeScript package holding the `zod` 4 op and diagram schemas, **the diagram compiler, and the shape recognizer**. The same code runs on the server (placement, IDs, validation, snapping), in the browser (rendering), and in the eval (headless tests).

## 3. How the AI sees the board (perception)

1. **Snapshot** (`apps/web/src/board/snapshot/`). The scene model is serialized to a standalone SVG string (MathJax with `fontCache:'none'`), drawn to an `OffscreenCanvas`, and encoded as WebP (JPEG q0.9 fallback on Safari).
   - **Region:** the current viewport, widened to include recent ink.
   - **Size:** chosen with Anthropic's `resizedSize()` reference algorithm for the model's tier. Opus 5 and Sonnet 5 are high-res (2576px edge, 4784 visual tokens); Haiku 4.5 is standard (1568px, 1568 tokens). The target is about 1,500 visual tokens by default, since tokens = ⌈w/28⌉·⌈h/28⌉.
   - **Safety net:** the image block sets `transformations: {oversized_image: "error"}`, so a silent server-side resize (which would shift every coordinate) fails loudly instead.
   - **Rulers:** optional thin ruler ticks every 100px on the top and left margins. Whether they help is decided by the eval.
2. **Ink grouping** (`inkGroups.ts`). Student strokes are clustered by padded-bbox overlap plus time adjacency (union-find). Each group gets a stable short ID (`g` + lowest stroke number), and shapes get `#n`. Tutor drawings get `a1…` (annotations) and `d1…` (diagrams). Diagram parts get addressable IDs (`d1.AB`, `d1.angle_A`, `d1.plot1`), so the AI can later say "highlight `d1.AC`".
3. **Digest.** Compact text, not JSON, to save tokens. It states the image↔world mapping and lists groups, shapes, annotations, and diagrams (with their named points and parts) with pixel bboxes. New groups are marked `*`, and content off-screen is summarized. The client also sends an ID→world-geometry map so the server can resolve targets exactly.
4. **Zoom-in tool** (`look_closer {bbox}`). The model can request a high-res crop, either to read small handwriting or to check its own diagram. The client renders it and it comes back as a tool result.
5. **Shape recognition for hand-drawn figures** (`packages/shared/src/shapes/recognize.ts`).
   - **Stored as drawn:** hand-drawn shapes stay as raw ink strokes (points + pressure). The app never replaces them automatically.
   - **When:** at snapshot time, each writing group goes through a corner finder:
     1. Simplify the strokes with Ramer–Douglas–Peucker. Strokes in a multi-stroke group are first joined end to end by their nearest endpoints.
     2. Detect sharp corners (turning angle above a threshold) and roughly straight segments between them.
     3. Check closure: the ends meet or nearly meet.
     4. Classify as triangle, quadrilateral, polygon, circle/ellipse (for circles, fit and measure the error), line, or none.
   - **Result in the digest:** `g5 box [...] 3 strokes · looks like a triangle, corners ≈ (200,500) (600,500) (205,222)`. The detected corners and sides get part IDs (`g5.v1`, `g5.s1`) that tools can target.
   - **Snapping:** `angle_arc`, `highlight` on a side, and `draw_diagram` in `inline` mode snap to detected corners and sides. If detection fails, fall back to the plain box and Claude's approximate coordinates.
   - **Division of labour:** Claude still decides what the shape means from the image; the corner finder only supplies exact positions.

Handwriting OCR (Mathpix digital ink: 1K free sessions/month, then $0.01 per equation) is **not** in the MVP. Claude vision reads the snapshot directly. We add Mathpix only if the eval shows misreads.

## 4. How the AI draws on the board (action): it can draw anything

Every tool uses a strict JSON schema with `eager_input_streaming: true`, so drawing starts quickly. Board positions are in **snapshot image pixels** (the space Claude is most accurate in). Diagrams use their **own maths coordinates**.

### 4a. Annotations: marking the student's work
| Tool | Use |
|---|---|
| `circle {target, color, note?}` | loop around a line, term, or angle |
| `highlight {target, color}` / `underline {target}` | draw attention (a target can be a side, e.g. `g5.s1`) |
| `mark {kind: check\|cross\|question, target \| x,y}` | teacher ticks and crosses |
| `arrow {from, to, label?}` | point from a hint to the work |
| `angle_arc {vertex, p1, p2, label?}` | mark and label an angle in the *student's* drawing |
| `write {x, y, content, format: text\|latex, size}` | hints, the problem statement, corrections |

A target is an ID (preferred; groups, shapes, and recognized parts like `g5.v1`) or a bbox. The server **snaps**:
- an ID gives the exact geometry;
- a raw bbox snaps to the ink group with IoU > 0.3;
- an `angle_arc` vertex snaps to the nearest detected corner (§3 item 5), vertex, or line intersection within 20px.

### 4b. `draw_diagram`: exact maths diagrams (the workhorse for new drawings)
The AI describes *what* the diagram is, in maths units with named points. The shared compiler works out *where every line goes*.

```json
{ "placement": {"mode": "auto", "near": "g9", "width": 420},
  "frame": {"xmin": -1, "xmax": 5, "ymin": -1, "ymax": 4},
  "points": {"A": [0,0], "B": [4,0], "C": [4,3]},
  "elements": [
    {"type": "polygon", "through": ["A","B","C"]},
    {"type": "right_angle", "at": "B", "from": "A", "to": "C"},
    {"type": "angle", "at": "A", "from": "B", "to": "C", "label": "\\theta"},
    {"type": "side_label", "from": "A", "to": "B", "text": "4"},
    {"type": "side_label", "from": "A", "to": "C", "text": "x", "style": "attention"} ] }
```

- **Element vocabulary (v1):**
  - *Basic geometry:* point (dot + label), segment, ray, line, vector.
  - *Shapes:* polygon, circle, arc, sector/shaded region.
  - *Markings:* angle (arc + label; auto square for 90°), equal-length ticks, parallel marks, side/dimension label, text/LaTeX label.
  - *Graphs:* axes (ticks, labels, π-multiples), grid, `plot {expr: "2\\sin x + 1", domain}`, parametric curve, point on a curve, shading between curves.
  - *Other:* number line, table (LaTeX cells).
- **Point values** may be expressions (`[4\cos 30°, 4\sin 30°]`) or constructions: `midpoint`, `intersection`, `on_circle {angle}`, `foot_of_perpendicular`. The AI never does trig arithmetic to place a point.
- **Plots** are sampled adaptively from the evaluated expression (Compute Engine), so graphs are **mathematically exact**, not guessed points.
- **Placement:**
  - `auto`: a free-space search over existing bboxes, beside or below `near`.
  - `at {bbox}`: an explicit position.
  - `inline`: draw over the student's own figure, with the frame aligned to its detected corners and sides (§3 item 5).
- **Result:** one diagram group `d1` with addressable parts. `update_diagram {id, patch}` changes it later (move C, relabel, add the height, recolour a side) with a smooth morph. Students can move or erase diagrams like any shape.
- **Style:** `clean` (crisp geometry, the default for diagrams) or `hand` (sketchy, matching annotations).

### 4c. `draw_svg`: the catch-all for anything the vocabulary can't express
- **What the AI sends:** `{placement, viewBox, svg}`, where `svg` is a restricted SVG subset: `g, path, line, polyline, polygon, rect, circle, ellipse, text`, with only stroke, fill, opacity, and transform attributes.
- **Safety:** the server **parses and rebuilds it from an allowlist into our own shape objects**. It never inserts the model's markup. It has a strict path-data tokenizer, rejects `script`, `foreignObject`, `href`, `url()`, and `style`, and caps content at about 200 elements.
- **Rendering:** each path becomes a tutor shape (animated draw-on, selectable), and `text` becomes our text or LaTeX shapes.
- **Use:** real-world sketches (ladders, ramps, clocks, bearings, towers and angles of elevation), charts, and icons.

### 4c-i. What strict tool schemas allow (learned in M3 and M4)

Strict tools buy schema-valid arguments, but the API enforces limits that reject **every** tool at once if any one is broken. Three found so far, each only at request time:
- `minItems` may only be 0 or 1, so **points and boxes are plain number arrays**, not fixed-length tuples;
- `maxItems` isn't supported at all, so list lengths are capped on the server;
- **at most 16 nullable or union-typed parameters across all tools together**, which is why the diagram schema has a list per kind of thing rather than one shape with nullable fields;
- **the compiled grammar has a shared size budget**, so a large schema can push the whole set over. Strictness is per-tool: `draw_diagram` opts out while the small tools keep it.

Every property must still be required, with unused ones nullable.

**The safety net doesn't depend on strict mode**: `resolve.ts` validates every call against the same zod schema and turns a mistake into a message the tutor can act on.

**What catches these:** a unit test counts union-typed parameters and forbidden array constraints locally — trust that over the API, because `npm run check:tools` (token counting) accepts schemas the Messages API then rejects. Rejections are free, so probing with one real request costs nothing until it succeeds. `draw_svg` must respect the same budget.

### 4d. Housekeeping
- `erase_drawings {ids | "all"}` removes the tutor's own annotations and diagrams.
- `look_closer {bbox}` requests a zoom crop (round-trip).

**Prompt rule for choosing a tool:**
- mark student work → annotations;
- a maths diagram or graph → `draw_diagram` (exact, cheaper, editable);
- only if the vocabulary can't express it → `draw_svg`.

**Rules.** The AI never edits or deletes **student ink**. It draws on a separate tutor layer (hide, erase, and undo all work) and can freely create and change its *own* drawings. The only thing that replaces student ink is the student's own **Tidy shape** action (§6).

**Server pipeline per tool call** (`apps/server/src/tutor/turn.ts`). When a `content_block_stop` arrives for a tool_use:
1. parse the JSON,
2. validate it with zod,
3. resolve and snap targets, **or compile the diagram / import the SVG** (shared compiler) and place it,
4. assign IDs,
5. stream a ready-to-render `op` event (world-space shapes plus animation order).

The client animates ops in stream order.

**Cheap turn protocol.** The prompt says: *write your message first, then call board tools; your turn ends there.* The ok/error `tool_result` blocks are prepended to the student's *next* user message, alongside the new snapshot. That avoids an extra round-trip each turn. **Two exceptions trigger an immediate continuation:**
- `look_closer`;
- a `draw_diagram`/`draw_svg` that failed validation (one automatic retry, with the error message, so a broken diagram is never left unfixed).

The history is strictly append-only (thinking blocks kept verbatim).

**Tutor rendering** (`board/render/`, `board/ai/`).
- **Annotations:** irregular, overshooting hand-drawn loops (synthetic points plus slight noise through perfect-freehand).
- **Animation:** strokes use `pathLength=1` with a dashoffset draw-on over 350–700ms, scaled to length. Diagrams animate element by element in construction order. Plots trace left to right. Highlights use a multiply-blend wipe. Text and LaTeX use a clip-path writing wipe.
- **Colour meanings:** coral = mistake, green = correct, amber = attention, violet = tutor ink and cursor.
- **Undo and chips:** each tutor op batch is **one undo entry**. Each drawing also appears as a chip in chat ("✎ drew triangle ABC"); clicking it pans the board to the drawing and pulses it.

## 5. The tutor brain (Claude API)

- **Endpoint:** `POST /api/tutor/turn`, returning an SSE stream of `text`, `op`, `usage`, `done`, and `error` events. Sessions live in memory on the server for the MVP.
- **Request:** `client.messages.stream` (the beta namespace when fallbacks are enabled).
  - Frozen system prompt plus tools, cached. They're kept over 4,096 tokens so they also cache on Haiku 4.5; the diagram vocabulary docs live here.
  - Top-level automatic `cache_control`.
  - `thinking: {type:"adaptive"}` and `output_config.effort` (default `low`; the eval decides).
  - `max_tokens` about 8k, so there's room for `draw_svg`.
  - Server-side refusal fallbacks (`fallbacks:"default"`, beta `server-side-fallback-2026-07-01`) on by default, as recommended for Opus 5. Always check `stop_reason`.
- **System prompt:** a patient, Socratic maths tutor (British "maths").
  - Hint ladder: nudge, then targeted hint, then worked step.
  - **Show, don't describe:** point at the board and draw a diagram when it helps.
  - Keep boards tidy: at most about 3 annotations per turn.
  - 2–4 sentence replies, with LaTeX in `$…$`.
  - If handwriting is unclear, use `look_closer` or ask.
- **Model and effort, decided by the eval: `claude-sonnet-5` at medium effort, everywhere.** Medium took 42 of 43 checks, drew every hard figure correctly, and never replied with a drawing and no words — which low did in two of eleven drawing turns. The saving from routing cheaper turns to low was smaller than the run-to-run variation in what the prompt cache happened to do, so it wasn't worth the extra moving part. The router is still there in `routing.ts`, tested and reachable with `TUTOR_EFFORT=auto`, if the cost of a turn ever starts to matter more than the consistency.

  **Why not Haiku:** it draws a described figure well, but asked for a bearing of 060 it drew the line 30 degrees out, reading the bearing as a plain angle. Nothing in the wording marks that question as the dangerous one, so no router could keep Haiku away from it, and a wrong diagram that looks right is the worst failure a tutor has. **Why not two models:** effort is a request setting, but the prompt cache is per model, so switching models mid-conversation rewrites about 6,700 tokens of tool definitions at the new model's price. Changing effort costs nothing extra; changing model costs more than the cheaper model saves.

  `TUTOR_EFFORT` pins every turn to one level when set, which is how the eval compares them; unset, it means "auto".
- **Context control:** a rolling reset about every 12 tutor turns or 40k tokens. The new context starts with a summary, the current snapshot, and the digest (existing diagrams keep their IDs).
- **Budget guards:**
  - a per-session $ counter from `usage`; `SESSION_BUDGET_USD` pauses watch mode when it's exceeded;
  - a total development spend ledger; `DEV_BUDGET_USD` (§12) blocks Claude calls once the testing budget is used up.

**Working a number out** (`check_maths`). Everywhere else the model is kept away from arithmetic: constructions place points, the evaluator draws curves. Marking was the hole left, and the tutor was judging a student's numbers by mental arithmetic — weakest exactly where trigonometry lives, in decimals, degrees against radians, and rounding. It now asks the board, which answers with the same evaluator that draws the graphs, and the answer comes back within the same turn. It also checks a claimed solution by substitution, and tells whether two expressions are the same by trying values. **Tolerance comes from how precisely the claim was written**, so a student who rounds 2.1131 to 2.11 is right: telling a student their correct work is wrong costs their trust, and that is not recoverable.

**Watch mode: dropped.** The plan was for the tutor to watch and intervene unasked. A real tutor lets a student attempt the work and waits to be asked, and productive struggle is where the learning happens; interrupting at the first hesitation prevents the very thing the tutor is for. It was also about **a third of a session's running cost**, spent mostly to conclude that nothing was wrong. "Check my work" is the student-initiated form of the same thing and is worth more. If the early-error case ever needs catching — a slip in line one that the next five lines are built on — the respectful form is a quiet marker the student can tap, not the tutor speaking. `look_closer` survives from that milestone: that one is the tutor asking for a closer look at handwriting it can't read, which makes it more accurate rather than more intrusive.

## 6. UI (modern, minimal)

- **Layout:** resizable split. Chat on the left (400px default, 320–560, collapsible with `Ctrl+\`); the board fills the rest. Light theme first. Off-white board (`#FAFAF9`) with dotted grid; floating white toolbars with a 1px border, soft shadow, and 12px radius; Geist font.
- **Chat panel:**
  - Header: wordmark, session title, watch-mode toggle (eye icon), dev cost badge.
  - Tutor messages: markdown + KaTeX, no bubble. Student messages: neutral right-aligned bubbles.
  - Drawing chips appear inline in tutor messages.
  - Composer: auto-growing textarea plus quick actions **Check my work · Give me a hint · I'm stuck · Draw it for me**.
  - "Add problem": the tutor writes the problem and draws its diagram at the top of the board.
- **"Tutor is looking" feedback:** a soft shimmer over the captured region plus an eye pulse.
- **Toolbar** (bottom-centre pill, tooltips with shortcuts):
  - Select `V`: click, shift-click, marquee; move, delete, duplicate; resize handles. A tutor drawing selects as one thing, however many shapes it is made of; a **double click reaches inside it** to the single piece under the pointer. Resizing scales the writing with the drawing, so a stretched graph doesn't leave its numbers behind. The tutor's drawings carry no captions: the chat says what a drawing is.
  - Hand `H`: also Space-drag.
  - Pen `P` (pressure) and Highlighter `M`.
  - Eraser `E`.
  - Shapes: Line `L`, Arrow `A`, Rect `R`, Ellipse `O`, Polygon (Shift snaps to 15° and perfect circles).
  - Text `T` and Equation `Q` (MathLive input rendered as MathJax SVG).
  - Laser pointer `Z`.
  - **Add picture**: drop a file on the board, paste a screenshot with `Ctrl+V`, or use the toolbar button, which on a tablet offers the camera. Pictures move and resize like anything else, keeping their proportions. They are shrunk to a longest edge of 1600px on the way in, and their bytes are kept beside the shapes rather than inside them, so dragging a photo doesn't copy it into the undo stack. PNG, JPEG, WebP and GIF; SVG is refused, since it can carry scripts.
- **Context style panel:** 6 colours, 3 sizes, highlighter opacity.
- **Board chrome:** undo/redo top-left. Zoom −/%/+, fit (`Shift+1`), and reset (`Shift+0`) bottom-right. Background picker: blank, dots, grid, lined. Show/hide and clear tutor drawings. Clear board (with confirm).
- **"Tidy shape":** available from the context menu, or suggested by the tutor. It swaps a recognised squiggly shape (§3 item 5) for a clean polygon or ellipse. It's a single undoable action.
- **Input handling:** Pointer Events with `getCoalescedEvents()`, pointer capture, `touch-action:none`. Once a pen is detected, touch only pans and pinch-zooms (palm rejection).
- **Problems:** one problem is one board and the conversation about it, saved together in IndexedDB under the problem's id — which is also the tutor's session id, so reopening can pick up where it left off. The header lists them newest first, titled from the first thing the student asked, with **New problem** beside it. Before this, a refresh brought the board back but not the conversation, and the tutor reappeared with no memory of work it had just been discussing.
- **Dev inspector** (`?debug=1`): the last snapshot with the model's coordinates and snapped/placed results overlaid (including detected corners and sides), the digest, raw tool JSON (including diagram specs), validation errors, and tokens and $ per turn. It has a **"Save as eval fixture"** button.

## 6b. Smoothness targets (measured, not hoped for)

Feel is a requirement. Every target below is measured on real devices, and M1 and M4 each end with a polish pass against it.

| Area | Target | How we get there |
|---|---|---|
| **Pen** | Ink appears under the pen within 1 frame (≤16ms). 60fps while drawing with **2,000 strokes** on the board. | Coalesced and predicted pointer events (`getCoalescedEvents()`, `getPredictedEvents()`). Only the live stroke re-renders; finished stroke paths are memoized. **Fallback:** if SVG misses the target, move finished student ink to a Canvas2D layer (same scene model). |
| **Pan & zoom** | 60fps. | One camera transform on the SVG root, no React re-render per frame, heavy overlays hidden mid-gesture. |
| **"Tutor is looking"** | Indicator within **100ms** of asking. | Shown on click, before the snapshot is even encoded. |
| **First words** | About **1.5s** after asking. | Streaming, low effort, small snapshot. Snapshot encoding, ink grouping, and shape recognition run in a **Web Worker**, off the main thread. |
| **First drawing starts** | About **3s** after asking. | `eager_input_streaming`. Each op is applied the moment its tool call finishes, and the tutor cursor starts moving as soon as the first op arrives. **Tune if missed:** shorter lead-in sentence, effort, model. |
| **Never blocking** | The student can keep writing, panning, and undoing while the tutor draws. Nothing the AI does locks the board. | Tutor animations live on their own layer. Ops commit to the scene immediately (the animation is visual only). Student input always has priority. |

**Where we are (measured):** M2 hit 1.6s to first word. With the drawing tools attached in M3 that rose to **15.7s**, with no thinking tokens used, so the cause isn't the model reasoning. Every turn now records its own timings (server log and the dev usage line) so the next real turns show where the time goes; closing this is part of M4's polish pass.

**How we measure:**
- **Timings:** the server logs time to first word and to done for every turn, and the dev usage line shows the same. The inspector will add the "looking" indicator and first drawing, plus a median over the session.
- **Frame-time meter:** shown with `?debug=1` while drawing and panning, plus a **stress-test button** that fills the board with 2,000 sample strokes.
- **Test devices:**
  - iPad with Apple Pencil (Safari);
  - Windows laptop with touch and pen (Chrome/Edge);
  - a school-grade Chromebook;
  - an Android tablet (Chrome).

**Polish-pass "feel" checklist** (end of M1 and M4):
- Every target above is met on every test device, or there's a written exception and a fix plan.
- **Ink:** no dropped or jagged strokes when writing fast. A palm resting on the screen draws nothing. Pinch-zoom never leaves stray ink.
- **Handles:** text editing enters and exits cleanly. Selection handles are easy to grab on touch (≥44px hit area).
- **Undo:** undo/redo is instant and never loses work.
- **AI feel (M4):**
  - animations never stutter, overlap awkwardly, or make the board jump;
  - diagrams build cleanly and labels never collide;
  - drawing chips pan smoothly;
  - reduced-motion is respected.

## 7. Repo layout

```
letsMath/
  package.json                 # workspaces, scripts: dev, build, typecheck, test, eval
  .env.example                 # ANTHROPIC_API_KEY, TUTOR_MODEL, TUTOR_EFFORT, WATCH_MODEL, SESSION_BUDGET_USD, DEV_BUDGET_USD, TUTOR_MOCK
  docs/ARCHITECTURE.md         # the decisions in this plan
  packages/shared/src/
    boardOps.ts                # zod schemas for every tool → JSON Schema
    sizing.ts                  # resizedSize (Claude image tier math)
    shapes/recognize.ts        # corner finder: RDP, corners, closure, classify → part IDs (g5.v1, g5.s1)
    diagram/                   # schema.ts, compile.ts (spec → world shapes + part IDs), constructions.ts,
                               # plot.ts (Compute Engine + adaptive sampling), labels.ts (label/angle placement),
                               # layout.ts (free-space placement), svgImport.ts (allowlist parser → shapes)
  apps/web/src/
    board/model/               # types.ts (Shape union incl. DiagramGroup), store.ts, history.ts, geometry.ts, inkGroups.ts
    board/render/              # Board.tsx (SVG + camera), StudentLayer, TutorLayer, Overlay, shapes/*, animate.ts
    board/tools/               # pen, highlighter, eraser, select, shapes, text, equation, laser, hand, registry
    board/input/               # pointer.ts, shortcuts.ts
    board/snapshot/            # rasterize.ts, digest.ts, region.ts
    board/ai/                  # applyOps.ts, handDrawn.ts, TutorCursor.tsx
    board/ui/                  # Toolbar, StylePanel, ZoomControls, BackgroundPicker, ContextMenu (Tidy shape)
    chat/                      # ChatPanel, Message, Composer, DrawingChip, useTutorStream.ts
    dev/Inspector.tsx
    App.tsx
  apps/server/src/
    index.ts                   # Hono: /api/tutor/turn (SSE), /api/tutor/watch, /api/tutor/continue
    tutor/                     # prompt.ts, tools.ts, session.ts, turn.ts, resolve.ts, watch.ts, cost.ts,
                               # ledger.ts (total spend + budget guard), mock.ts (scripted responses)
  eval/                        # fixtures/*.json+.webp, run.ts, score.ts
```

## 8. Build milestones (each ends in a demo)

- **M0 Scaffold:** workspaces, Vite + Tailwind v4 + Geist, Hono server, Vite `/api` proxy, `.env.example`, vitest, and typecheck scripts.
- **M1 Whiteboard:** camera and every student tool from §6, plus undo/redo, backgrounds, shortcuts, pen/touch handling, and autosave. Tests cover geometry, hit-testing, and history. It also includes the frame-time meter and 2,000-stroke stress test. **Ends with a polish pass** against §6b on all test devices.
- **M2 Chat + AI sees:** chat UI with streaming SSE, snapshot, sizing, ink groups and digest, the server turn endpoint with caching and sessions, and the inspector. The spend ledger, budget guard, and mock tutor mode (§12) come **first**, and everything is built against mock mode before any paid call. The tutor discusses the board.
- **M3 AI annotates:** annotation tools, streaming op application, target resolution and snapping, and **the corner finder (`shapes/recognize.ts`) with snapping to detected corners and sides** (digest shape notes, `g5.v1`/`g5.s1` part IDs). Also the hand-drawn tutor layer, draw-on animation and cursor, chips, and undo/hide/erase.
- **M4 AI draws anything:**
  - **Stage 1 done:** the `draw_diagram` compiler for core geometry — named points, polygons, segments, angle marks and right-angle squares, side and point labels — fitted into clear space on the board, with every part addressable (`d1.AB`, `d1.angle_B`). Verified with a real turn: asked for a diagram of "a ladder 5 m long leans against a wall at 65°", the tutor drew it correctly for 2.2p. *Known blemish:* a long side label can still touch its line, because the compiler places labels from an anchor without knowing how wide the rendered text will be; estimating width (as written notes already do) would close it.
  - **Stage 2 done (graphs):** axes with automatic or given tick spacing, π-multiple ticks for trig, an optional faint grid, equal scaling for when a shape must stay true (a circle), and real function plots. Expressions (`sin(x)`, `2x+1`, `x^2-3`) go through a small evaluator in `diagram/plot.ts` — no `eval`, and unknown names are refused, so a model's string can never run as code — then are sampled adaptively, so a curve is the real function rather than guessed points and an asymptote breaks the line instead of being drawn through. Every part is addressable (`d1.plot1`, `d1.xaxis`, `d1.xnum3`). Verified with a real turn: "sketch y = sin x and y = cos x for 0 to 2π on the same axes" drew both curves correctly with π ticks, in 6.6s for 0.7p on a warm cache. Labels carry an **anchor** (`top-centre`, `middle-right`, …) rather than a position worked out in advance: the compiler can't measure MathJax, so it names the point it means and the renderer, which can measure, places the text. That was found the hard way — π ticks came out scrambled because `\frac{3\pi}{2}` is fourteen characters of source but draws about as wide as two, so centring by character count threw every label onto its neighbour. It is also the route to closing the stage-1 label-width blemish. When the domain straddles zero, the y-axis numbers move to the left margin so they don't sit across the curves. *Known blemishes:* a tick number under the axis can be crossed by a curve passing close to it; and `dashed` still never reaches the screen, because the draw-on animation's CSS sets `stroke-dasharray` on every tutor stroke and keeps it afterwards, so construction lines render solid — closing that means reworking the animation CSS, not adding a shape attribute.
  - **Stage 3 done (circles and constructions):** points can be built rather than calculated — `polar` (a distance and angle from another point), `midpoint`, `intersection`, and the `foot` of a perpendicular — so the tutor never does trigonometry to place a point. Circles, arcs, and dots on points. Labels choose their anchor by direction, so text runs away from what it labels (closing the stage-1 blemish of a long side label reaching back across its line), and axis numbers move to the margins whenever an axis runs through the plot (closing the stage-2 blemish; a unit circle crosses the x-axis exactly at the ±1 ticks). Part ids are made unique: a polygon's side and a separate segment between the same two points had both been `d1.AB`, so one silently replaced the other on the board. Verified with a real turn: asked to "draw a unit circle and mark 30 degrees with its coordinates", the tutor built P with a `polar` construction instead of working out cos 30°. Its first attempt was refused whole because the coordinate label ran three characters past a 60-character limit, and nobody could see why, since failed tool calls were never recorded. They now go to `.usage/tool-errors.jsonl`, text limits are generous, and the clear space kept for a diagram includes how far its labels reach.
  - still to do: more constructions if the eval asks for them (line–circle intersection, tangents), shaded regions, equal-length and parallel marks, number lines, tables;
  - inline placement (drawing over the student's own figure);
  - `update_diagram` with morph;
  - `draw_svg` allowlist import;
  - **Retry loop done:** a refused drawing goes straight back to the tutor within the same turn, with the reason and an instruction to draw it again, so the student is never left with "here it is" over an empty board. One retry only; a second failure waits for the student's next message, and a short note says the drawing didn't work. It retries **any** refused drawing rather than only diagrams as first planned: a circle aimed at a stale id fails just as silently, and a retry only costs anything when something has already gone wrong. Verified against the API: told to use a 137-character caption, the tutor was refused, shortened it to 86, and the triangle appeared — two rounds, 4p, with nothing about the failure reaching the student. `turn.test.ts` covers it with a stand-in for Claude, and pins the rule the whole session depends on: every `tool_use` must be answered by the very next message, or the API refuses every later turn. That work also closed a latent race — a tool result used to be recorded *after* its drawing was emitted, so a slow client could leave a call unanswered.
  - **Legible axes, and forgiving input:** tick numbers thin out to what will fit — a -12 to 12 axis stepping in twos printed thirteen numbers across a small plot, one on top of another — while the tick marks all stay. And because `draw_diagram` can't be strict (its schema far exceeds the API's grammar budget), nothing holds the model's output to the schema's shape: one correct drawing was refused twice because `width` was missing and `near` held 48 characters of leaked tool-call markup, the model having slipped out of JSON mid-call. `diagram/tidy.ts` now fills in what was left out, takes an id out of a sentence, shortens an over-long caption, and strips stray markup before it can reach the board. Anything that could make the maths wrong is still refused. The prompt that failed twice — "draw a circle with radius 10 with a line going diagonal y = x through the middle" — now draws first time.
  - **Diagrams are drawn big enough to work with.** A graph's box is now shaped to its axes instead of always being `width × 0.78`: with scales locked together, as a circle forces, a square-ranged graph squeezed into a wide, short box could only be as big as its short side, and came out smaller than its own tick numbers. Sizes are decided in board units, the same units the text is drawn in, with floors (420 for a graph, 320 for a figure) under whatever width the tutor asks for, since what matters is how big the drawing looks beside its labels. The tool description now asks for 420-520.
  - **Drawings are the student's to handle.** One click takes a whole drawing, a double click one piece of it, and either can be moved, resized (text scaling with it) or deleted; the student's own ink is never caught up in it. Fixing this uncovered a bug that had been there since M1: a pointer event's `detail` is always 0, unlike a mouse event's, so **no double click had ever been detected** — which is why double-click-to-edit text quietly did nothing. Clicks are now counted where the events arrive. Captions were dropped from diagrams altogether: the chat already says what a drawing is.
  - **Pictures on the board, which the tutor can read.** Because a snapshot is rendered from the board itself, a photographed or pasted question is simply part of what the tutor sees — verified with a real turn, which read two dropped questions back correctly. This is why the bytes are stored as data URLs: a snapshot is a serialised SVG, and an SVG drawn as an image never fetches anything external, so any other form would have left a blank rectangle where the picture was. The digest lists it as a picture "added by the student", and an added photo costs no extra tokens, the snapshot being a fixed size.
  - build-order animation;
  - **"Tidy shape"**;
  - **ends with a polish pass** against §6b: AI timing targets, animation feel, and never blocking.
- **M5 look_closer:** the crop round-trip, for handwriting the tutor can't read. (Watch mode was dropped — see §5.)
- **Done alongside M4:** the arithmetic check (§5), and problems that persist with their conversations (§6). Pictures can be dropped, pasted or photographed onto the board, and the tutor reads them from the snapshot.
- **M6 Eval — first results.** Six cases run through the real turn path (`npm run eval`), scored mechanically: did the drawing compile, is the circle round, is the radius at 30°, did the tutor work the number out before judging it, did it say something rather than only draw, did it withhold the answer when asked for a hint.

  | | checks | cost, 6 cases | median first word | worst |
  |---|---|---|---|---|
  | Sonnet 5, medium | 23/23 | 4.8p | 4.1s | 13s |
  | Haiku 4.5 | 22/23 | 5.7p | 0.9s | 1.6s |
  | Sonnet 5, low | 21/23 | 16.2p | 3.1s | 13.6s |

  What it found, none of which was visible before:
  - **Haiku wouldn't run at all**, three times over: it refuses adaptive thinking, refuses the effort setting, and compiles a smaller grammar than Sonnet so it rejected the strict tool set. It now runs with those off and every tool loose. `check:tools` checks every model we might use, so this is caught for free next time.
  - **Constructions were being refused over the order they were written in** ("Px is built from A, which isn't defined before it"). The tutor lists them as it thinks of them. They are now resolved by dependency, which took the unit circle from 5/6 in two rounds at 2.1p to 6/6 in one round at 0.8p.
  - **A position given where a point's name belongs** is now accepted: asked to mark the top of a sine curve, the tutor sent (1.5708, 1), because that point has no name to give.
  - **Cost is decided by whether the prompt cache hits, not by list price.** Haiku wrote the full prefix on nearly every turn while Sonnet reused it, so they cost about the same despite Haiku being half the price on paper. The same six cases cost Sonnet between 4.8p and 14.9p across runs. Worth understanding before choosing on cost.
  - **The first-word spikes are Sonnet's, not the network's.** Haiku never exceeded 1.6s; Sonnet ranged from 0.2s to 25s at both effort levels. Still unexplained.
  - **A brittle check is worse than no check.** "rounded-answer" failed while the tutor was entirely right, because it said "spot on" rather than "correct". The check now looks for the value, not the wording.

  **Then five harder drawings were added**, each aimed at a way a cheaper model goes wrong: a bearing (measured clockwise from north, while our construction measures anticlockwise from east), a curve with an asymptote, an area between two curves needing shading the board can't do, an elevation problem whose figure has to be worked out, and a trapezium described in words.

  | on the five hard cases | result | cost, 11 cases | median first word |
  |---|---|---|---|
  | Haiku 4.5 | 17/20 — **drew the bearing at 60° instead of 30°** | 10.6p | 0.8s |
  | Sonnet 5, low | 18/20 — bearing right, silent twice | 14.3p (hard only) | 2.1s |
  | Sonnet 5, medium | 19/20 — bearing right, silent never | 34.1p | 3.0s |

  **Haiku can't be the drawing tier.** It is dependable at transcribing a figure someone has already worked out — the trapezium's parallel sides came out in the right ratio, the asymptote broke properly, the elevation problem got both angle marks — but it read the bearing as a plain angle and drew a neat, confident, wrong diagram. Sonnet got it right at both effort levels, so it is a difference in the model rather than a gap in the prompt. A failure that looks correct is the worst kind for a tutor, and nothing in the request would let a router know in advance that this question was the dangerous one.

  **Opus wasn't run.** It was there in case Sonnet struggled on the hard cases; Sonnet took 19 of 20, so the measurement couldn't have changed the decision and would have cost 20p.

  **Drawing in silence is the soft failure**, appearing twice at low effort and once on Haiku, never at medium. The student still sees the drawing and a chip describing it, so it degrades the experience rather than breaking it.

  **No model change yet.** The checks measure that the tutor works, not that it teaches well, and teaching is where Sonnet would earn its keep. Next: judge the quality of the explanations, and chase the latency.

- **M6 remaining:**
  - Annotation fixtures (planted trig errors → expected target group).
  - **Diagram prompts:** "right triangle with 35° and hypotenuse 10, label the opposite side x", "sketch y=sin x and y=cos x for 0–2π and mark where they meet", "unit circle with 30°, 45°, 60° and their coordinates", "ladder 5m against a wall at 70°", "bearing of 060° from A to B".
  - Scoring: compile success, geometric correctness checks (right angles are 90°, side ratios), a vision-judge score of the rendered result, "no answer giveaway", and $/turn.
  - Run through the Batch API (50% off) inside the §12 budget: about 15 fixtures, Sonnet 5 and Haiku 4.5 on all of them, and Opus 5 on 5 as a quality reference. Show the estimated cost and running total before each sweep, then set defaults.
- **Phase 2 Voice:** see §10. **Phase 3 Product:** Supabase auth and persistence, problem library, session replay, iPad/Apple Pencil polish, deploy (Render), usage caps and billing, privacy for under-18s.

## 9. Cost model (Claude API list prices: Opus 5 $5/$25, Sonnet 5 $2/$10, Haiku 4.5 $1/$5 per M tokens; cache read 0.1×, 5-minute cache write 1.25×)

**Assumptions per tutor turn:**
- System prompt plus tools: about 5.5k tokens (including the diagram vocabulary), cached.
- New content: about 1.9k tokens.
- Average cached history: about 20k tokens (rolling reset).
- Output: about 500 tokens.

| | per tutor turn | per watch check (Haiku) | **30-min session** (20 turns + 40 checks) |
|---|---|---|---|
| Opus 5 | ≈ $0.034 | ≈ $0.003 | **≈ $0.80** |
| Sonnet 5 | ≈ $0.014 | ≈ $0.003 | **≈ $0.40** |
| Haiku 4.5 | ≈ $0.007 | ≈ $0.003 | **≈ $0.26** |

**Extra cost of drawing** (output tokens):

| | `draw_diagram` | `draw_svg` |
|---|---|---|
| Output tokens | ≈150–400 | ≈500–1,500 |
| Cost on Sonnet 5 | ≈$0.002–0.004 | ≈$0.005–0.015 |

This is why diagrams are preferred and `draw_svg` is the catch-all. A few diagrams per session add only cents. Shape recognition runs locally and costs nothing, apart from a few tokens of shape notes in the digest.

**Levers:** caching, snapshot only when the board changed, rolling reset, short replies, low effort, cheap watch triage, per-session budget cap. The inspector shows real numbers; M6 replaces these estimates.

## 10. Phase 2: voice (decided now, so Phase 1 is built for it)

**Choice: a cascaded pipeline on LiveKit Agents (Node).**
- Deepgram **Flux** streaming speech-to-text ($0.0065/min, built-in end-of-turn detection) feeds **the same tutor brain, tools, diagrams, and board protocol from Phase 1**.
- The tutor's words are spoken by streaming text-to-speech (Deepgram Aura-2 at $0.030 per 1k characters, or Cartesia Sonic).
- LiveKit handles WebRTC, echo cancellation, semantic turn detection, and **interruptions**: when the student speaks, the tutor's audio and the in-flight LLM stream are cancelled.
- Board data travels over the data channel. Each drawing starts when the sentence that mentions it starts playing ("let's draw the triangle…").

**Estimated cost:** ≈$0.03–0.04 per minute (≈$0.85–1.15 per 30 min).

**Why not speech-to-speech?** It would split the product into two tutors. At the Phase 2 gate we still benchmark **Gemini 3.1 Flash Live** (≈$0.02–0.04/min) and gpt-realtime-mini (≈$0.016/min+). We switch only if cascaded misses **<1.2s latency** or the cost target.

## 11. Verification

- **`npm run typecheck && npm test`** (vitest):
  - geometry, hit-testing, undo/redo, ink grouping;
  - `resizedSize` matches the Claude docs examples (1075×1520 → 924×1307 and 1920×1080 → 1456×819 on the standard tier);
  - image↔world round-trip;
  - op validation and snapping.
- **Shape recognition tests** (sample hand-drawn strokes stored as fixtures):
  - A wobbly triangle drawn in one stroke gives 3 corners within about 8px.
  - A triangle drawn in 3 strokes gives the same result.
  - An open "V" is not a triangle.
  - A rough circle is classified as a circle.
  - An `angle_arc` snaps to the correct corner.
- **Diagram compiler tests:**
  - A 3-4-5 triangle has a right angle at B, and its side labels sit outside the triangle.
  - Angle arcs sweep the correct side.
  - Plot samples of `sin x` stay within 0.5px of the exact curve.
  - `intersection` and `midpoint` constructions are correct.
  - Auto placement never overlaps existing bboxes.
  - `update_diagram` keeps part IDs.
  - The SVG import rejects `script`, `foreignObject`, `href`, `url()`, and malformed path data.
- **Smoothness checks** (§6b):
  - Run the 2,000-stroke stress test with the frame-time meter on each test device, drawing and panning at 60fps.
  - Check inspector timings over 10 real turns: median indicator ≤100ms, first word ≤1.5s, first drawing ≤3s.
  - While the tutor is drawing, keep writing, panning, and undoing to confirm nothing blocks or jumps.
  - Go through the polish-pass checklist.
- **Manual end-to-end** with `npm run dev` at http://localhost:5173:
  1. Exercise every student tool.
  2. Write a trig solution with a planted error (`sin 30° = √3/2`) and press **Check my work**. The tutor circles the wrong line, the animation plays, undo removes it, and `cache_read_input_tokens > 0` from turn 2.
  3. Hand-draw a wobbly triangle and ask "which angle is θ opposite side 3?". The inspector shows `looks like a triangle` with corners, and the tutor's `angle_arc` sits exactly on the corner. Then use **Tidy shape** and confirm one undo restores the original ink.
  4. Ask **"draw a unit circle and mark 30° with its coordinates"**. The diagram builds in free space in construction order, and you can move and erase it.
  5. Follow up with "highlight the sine". The tutor targets `d1.*` via `update_diagram`/`highlight`.
  6. Ask for "a ladder leaning against a wall at 70°". It uses `draw_diagram` or `draw_svg` and renders cleanly.
  7. Write `x = 5 cos 65 = 2.7` and ask for it to be checked. The tutor works the value out with `check_maths` before judging it, marks the line wrong, and writes 2.11. Rounding it to 2.11 yourself is accepted.
  8. Reload the page: the board and the conversation both come back. Start a new problem, then switch between them from the header.
- **Browser automation** (Playwright via the `run` skill) captures screenshots of tool states, an annotated turn, and a diagram turn.
- **Eval:** `npm run eval -- --model claude-sonnet-5 --effort low` runs batched. It prints the estimated cost and asks before spending, then reports annotation hit rate, diagram correctness and judge scores, and $/turn.

## 12. Testing budget: under £5 in total

All testing across every milestone, including the M6 eval, must cost **less than £5 in Claude API usage**. The server enforces this; it doesn't rely on anyone being careful.

**The limit is enforced.**
- **Ledger:** every Claude response's `usage` (input, cache writes, cache reads, output) is priced at the model's list rates and appended to `.usage/ledger.jsonl` (gitignored). The dev cost badge shows the running total.
- **Guard:** `DEV_BUDGET_USD=5.00`. The badge turns amber at 80%. At 100% the server refuses new Claude calls with a clear message, while mock mode keeps working. $5.00 of usage stays under £5 even with 20% UK VAT, as long as £1 buys at least $1.20.
- **Backstop:** buy only a small amount of prepaid API credit and keep auto-reload off, so not even a bug can spend more.

**Free testing comes first.**
- **Mock tutor mode** (`TUTOR_MOCK=1`): the server replays scripted responses, including streamed text and tool calls. The chat UI, streaming, drawing ops, animations, undo, and chips (M2–M4) are built and tested this way, at no cost.
- **Unit tests** cover the digest, sizing, shape recognition, snapping, the diagram compiler, and the SVG import without the API.
- **Token counting** (`count_tokens`, free) checks prompt and snapshot sizes before any paid call.
- **Recorded responses:** a few real responses are saved once and replayed as test fixtures.

**Paid testing is kept cheap.**
- Day-to-day real turns use **Sonnet 5 at low effort** (about 2.5× cheaper than Opus 5); watch triage uses Haiku 4.5.
- Test sessions stay short (a fresh session per scenario), so cached history stays small.
- The M6 eval is batched (50% off) and runs Opus 5 only on a handful of fixtures.
- Before any bulk spend (an eval sweep), the estimate and running total are shown and confirmed.

**How the $5.00 is split:**

| Use | Budget | Roughly buys |
|---|---|---|
| M2–M5 hands-on testing (Sonnet 5) | $2.00 | about 150 short tutor turns |
| Watch-mode tuning (Haiku 4.5) | $0.30 | about 100 triage checks |
| M6 eval (Batch API) | $1.50 | about 4 full sweeps |
| Buffer | $1.20 | re-runs and surprises |

## Sources
- tldraw: [license plans](https://tldraw.dev/pricing), [licensing debate ($6k/yr)](https://biggo.com/news/202509190115_tldraw_SDK_4.0_Licensing_Debate), [agent starter kit](https://tldraw.dev/starter-kits/agent)
- Claude: [vision limits & token cost](https://platform.claude.com/docs/en/build-with-claude/vision), [coordinates & bounding boxes](https://platform.claude.com/docs/en/build-with-claude/vision-coordinates)
- Voice: [Deepgram pricing](https://deepgram.com/pricing), [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini Live per-minute breakdown](https://the-rogue-marketing.github.io/google-gemini-tts-speech-audio-api-pricing-may-2026/), [OpenAI Realtime cost per minute](https://www.layer3labs.io/guides/openai-realtime-api-pricing), [voice agent cost model](https://inworld.ai/resources/voice-agent-cost-per-minute-2026), [LiveKit Anthropic plugin](https://docs.livekit.io/agents/models/llm/anthropic/), [LiveKit turn detection](https://docs.livekit.io/agents/build/turns/)
- Handwriting OCR: [Mathpix API pricing](https://mathpix.com/pricing/api)
