# Desktop demo recording defaults

Apply this style to PR and feature walkthroughs. These are opinionated defaults; a specific request for another viewport, pace or transition takes precedence.

## Frame and movement

- Use a **1440×900 CSS-pixel viewport** with matching recording dimensions. Verify the actual first capture for every actor/tab. A narrow desktop-app browser pane can otherwise produce a mobile layout even though recording runs on a desktop computer.
- Start at the page overview, scroll down through the relevant sections to the bottom, pause, then scroll back up. Keep the actions and their resulting state visible. For long pages, pause at meaningful sections instead of spending the whole video in constant motion.
- Use native wheel/scroll actions through the permitted browser interface. A useful starting cadence is **20–35 pixels per roughly 100 ms**, about **200–350 pixels/second**. Tune for tool latency and text density. Avoid one large jump, locator auto-scroll as the whole transition, or fast-forwarding the scroll.
- Hold each important result and the top/bottom checkpoints for **2–3 seconds**. Fill forms deliberately and pause before saving so the relevant values can be read.
- Aim the scroll at the actual scrolling container. Many dashboards scroll `main`; a timeline, table or side panel can intercept the wheel. Read the visible DOM's scroll position and bounds to confirm the intended container moved. If it stalls, inspect and reposition the scroll point rather than recording repeated ineffective gestures. Verify both bottom and return-to-top positions.
- Keep useful environment/preview banners visible. Do not cover status labels, inputs or confirmation buttons with captions. Restore temporary viewport settings after recording.

The recorder template's `gradualScroll(page, { direction, distance, point })` uses small native wheel steps; `pause(page)` defaults to 2.5 seconds. Choose `point` from the actual page's scroll area, especially when nested panels are present. Use the active browser skill's equivalent actions if the standalone Playwright recorder is not permitted.

## Preserve real motion

Prefer actual video capture when the supported browser surface offers it. If it only offers screenshots, take repeated **viewport** captures during the real scrolling and interactions, keeping monotonically increasing capture timestamps. About **10–15 actual frames per second** is a useful fallback; use a higher source rate when available.

Assemble the captured frames according to their recorded timing. A 30 fps export may repeat source frames; disclose the lower capture rate when describing technical quality. Do not claim native 30 fps capture, fabricate intermediate application frames, or pan across a static full-page image as a substitute for real scrolling. Trim dead setup time between meaningful segments, not the movement the user asked to see.

Capture each requested flow against its current implementation. Preserve a successful action and its resulting state before moving to the next actor. For a multi-flow delivery, keep individual chapter files as well as the full walkthrough.

## Crossfades and delivery

Use a **0.4-second true crossfade** between chapters/pages/personas. Preserve continuous footage within a page; do not add a fade to every wheel step or click. `compose.sh crossfade output.mp4 chapter1.mp4 chapter2.mp4 ...` implements this default; `concat` keeps hard cuts for an explicit request.

Normalize matching dimensions, frame rate, sample aspect ratio, time base and presentation timestamps before joining. Calculate transition offsets from the encoded video duration/frame count, allowing for each overlapping fade. The expected joined duration is the sum of the clip durations minus `0.4 × (chapter_count - 1)` seconds. Avoid cumulative drift and black tails. Shift caption cues and chapter markers by those same overlaps.

Export **H.264, yuv420p, 30 fps, faststart MP4**. The bundled crossfade helper stitches video only; remux requested narration and selectable captions after adjusting their timing for the overlaps. Otherwise silent AAC improves compatibility with players that expect an audio track. Use readable English captions by default. Prefer selectable captions when burned-in text would cover the UI.

For multiple flows, deliver the full video plus chapter videos and timestamps. When uploading is authorized, keep the requested earlier media available and provide a verified GitHub video link. The recording settings do not independently authorize publishing or additional application mutations.

## Check before sharing

1. Decode every exported MP4 completely and confirm dimensions, codec, frame rate and duration.
2. Visually inspect representative scroll segments, each transition midpoint and the final frame. Confirm readable desktop content, the claimed final state and no blank tail or unexpected mobile capture.
3. Test actual playback and a chapter seek in the delivery player. For a local HTTP player, support byte-range requests (`206`, `Content-Range`, `Accept-Ranges: bytes`); basic servers without ranges may play from the start but fail when seeking.
4. Offer fullscreen and chapter controls for long walkthroughs. Embed local media using an absolute path, and supply the verified GitHub link when requested.
