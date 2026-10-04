/**
 * A draw loop capped at `fps` for the backdrop canvases.
 *
 * A plain requestAnimationFrame loop that skips frames until enough time has
 * passed still wakes on every display refresh, which is 144 times a second on
 * a 144 Hz monitor for a 30 fps loop. Here the loop sleeps on a timer between
 * frames and only asks for an animation frame shortly before the next one is
 * due, so drawing stays in step with the display but the page wakes two or
 * three times per drawn frame instead of five.
 */

/** How long before a frame is due the timer hands over to requestAnimationFrame. */
const LEAD_MS = 8;
/** A frame this close to due is drawn rather than pushed to the next refresh. */
const SLACK_MS = 2;

/** Starts the loop; `onFrame` gets the animation-frame timestamp. Returns a stop function. */
export function startFrameLoop(fps: number, onFrame: (now: number) => void): () => void {
  const interval = 1000 / fps;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = -Infinity;
  let stopped = false;

  const onAnimationFrame = (now: number) => {
    frame = 0;
    // The timer can land a refresh early on fast displays; wait one more.
    if (now - last < interval - SLACK_MS) {
      frame = requestAnimationFrame(onAnimationFrame);
      return;
    }
    last = now;
    onFrame(now);
    if (stopped) return;
    timer = setTimeout(wake, Math.max(0, last + interval - LEAD_MS - performance.now()));
  };

  const wake = () => {
    timer = undefined;
    frame = requestAnimationFrame(onAnimationFrame);
  };

  frame = requestAnimationFrame(onAnimationFrame);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
}
