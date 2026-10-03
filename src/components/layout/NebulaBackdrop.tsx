import { useCallback, useEffect, useRef, useState } from "react";
import { appActivity, useAppActivity } from "@/lib/appActivity";
import type { NebulaTheme } from "@/lib/harness/types";

const MAX_FPS = 30;
const MAX_DPR = 1.5;
const STARS_PER_PIXEL = 1 / 2600;

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Domain-warped fbm noise blends the three colours; the swirl angle grows
// toward the centre so the cloud slowly turns around it.
const FRAGMENT = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02 + 3.1; a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float r = length(uv);
  float angle = uTime * 0.035 * (1.4 - clamp(r, 0.0, 1.2));
  float c = cos(angle);
  float s = sin(angle);
  vec2 p = mat2(c, -s, s, c) * uv * 2.2;
  vec2 q = vec2(fbm(p + uTime * 0.01), fbm(p + vec2(5.2, 1.3) - uTime * 0.012));
  vec2 w = vec2(fbm(p + 3.5 * q + vec2(1.7, 9.2)), fbm(p + 3.5 * q + vec2(8.3, 2.8)));
  float n = fbm(p + 3.0 * w);
  vec3 col = mix(uA, uB, clamp(n * 1.6, 0.0, 1.0));
  col = mix(col, uC, clamp(length(w) * 0.9 - 0.25, 0.0, 1.0));
  float density = smoothstep(0.25, 0.95, n) * (1.0 - smoothstep(0.35, 1.25, r) * 0.55);
  vec3 base = vec3(0.012, 0.008, 0.035);
  gl_FragColor = vec4(base + col * density * 0.95, 1.0);
}
`;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}


function Nebula({ theme, onFail }: { theme: NebulaTheme; onFail: () => void }) {
  const { still } = useAppActivity();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const redrawRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let shaders: WebGLShader[] = [];
    let buffer: WebGLBuffer | null = null;
    let uniforms: Record<string, WebGLUniformLocation | null> = {};
    let frame = 0;
    let last = 0;
    // Time advances by the swirl speed, so changing speed never jumps.
    let clock = 0;
    let lastNow = performance.now();

    const initGl = () => {
      gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
      if (!gl) return false;
      const compile = (type: number, source: string) => {
        const shader = gl!.createShader(type)!;
        gl!.shaderSource(shader, source);
        gl!.compileShader(shader);
        shaders.push(shader);
        return gl!.getShaderParameter(shader, gl!.COMPILE_STATUS) ? shader : null;
      };
      const vs = compile(gl.VERTEX_SHADER, VERTEX);
      const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
      if (!vs || !fs) return false;
      program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, "aPos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(["uRes", "uTime", "uA", "uB", "uC"].map((name) => [name, gl!.getUniformLocation(program!, name)]));
      return true;
    };

    const disposeGl = () => {
      if (!gl) return;
      shaders.forEach((s) => gl!.deleteShader(s));
      if (program) gl.deleteProgram(program);
      if (buffer) gl.deleteBuffer(buffer);
      shaders = [];
      program = null;
      buffer = null;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl?.viewport(0, 0, width, height);
    };

    const draw = () => {
      if (!gl || !program || gl.isContextLost()) return;
      const [a, b, c] = themeRef.current.colors.map(hexToRgb);
      gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
      gl.uniform1f(uniforms.uTime, clock);
      gl.uniform3fv(uniforms.uA, a);
      gl.uniform3fv(uniforms.uB, b);
      gl.uniform3fv(uniforms.uC, c);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden || now - last < 1000 / MAX_FPS) return;
      clock += ((now - lastNow) / 1000) * themeRef.current.swirlSpeed;
      lastNow = now;
      last = now;
      draw();
    };

    const start = () => {
      cancelAnimationFrame(frame);
      resize();
      clock = clock || 40;
      draw();
      if (!still && appActivity.getState().visible) {
        lastNow = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };

    redrawRef.current = draw;

    if (!initGl()) {
      disposeGl();
      onFail();
      return;
    }
    start();

    let resizeQueued = false;
    const observer = new ResizeObserver(() => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => {
        resizeQueued = false;
        resize();
        draw();
      });
    });
    observer.observe(canvas);

    const onVisibility = () => {
      if (!document.hidden) lastNow = performance.now();
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frame);
    };
    const onRestored = () => {
      shaders = [];
      if (initGl()) start();
      else onFail();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Stop the loop entirely while the window is hidden (tray or minimised),
    // instead of waking every frame to skip drawing.
    const onActivity = () => {
      cancelAnimationFrame(frame);
      if (!still && appActivity.getState().visible) {
        lastNow = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const unsubscribe = appActivity.subscribe(onActivity);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      disposeGl();
      // Release the GPU context now instead of waiting for garbage collection.
      (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [onFail, still]);

  // Without animation (reduced motion) the frame must be redrawn when the colours change.
  useEffect(() => {
    redrawRef.current();
  }, [theme.colors]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

/** Twinkling four-point stars over the nebula. */
function Stars({ density }: { density: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { still } = useAppActivity();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let stars: { x: number; y: number; size: number; phase: number; speed: number; hue: number }[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      const count = Math.round(canvas.clientWidth * canvas.clientHeight * STARS_PER_PIXEL * density * 2);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: (1.2 + Math.random() ** 3 * 5) * dpr,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 1.6,
        hue: Math.random() < 0.2 ? 210 : Math.random() < 0.1 ? 40 : 0,
      }));
    };

    const star = (x: number, y: number, size: number, alpha: number, hue: number) => {
      const color = hue ? `hsl(${hue} 90% 88% / ${alpha})` : `rgb(255 255 255 / ${alpha})`;
      ctx.fillStyle = color;
      ctx.beginPath();
      const w = size * 0.18;
      ctx.moveTo(x, y - size);
      ctx.quadraticCurveTo(x + w, y - w, x + size, y);
      ctx.quadraticCurveTo(x + w, y + w, x, y + size);
      ctx.quadraticCurveTo(x - w, y + w, x - size, y);
      ctx.quadraticCurveTo(x - w, y - w, x, y - size);
      ctx.fill();
      ctx.fillStyle = hue ? `hsl(${hue} 90% 80% / ${alpha * 0.25})` : `rgb(255 255 255 / ${alpha * 0.25})`;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.35, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        const wave = 0.5 + 0.5 * Math.sin((now / 1000) * s.speed + s.phase);
        // Sharp peaks read as blinks rather than a slow pulse.
        const twinkle = still ? 0.55 : 0.15 + 0.85 * wave ** 6;
        star(s.x, s.y, s.size * (0.6 + 0.4 * twinkle), twinkle, s.hue);
      }
    };

    resize();
    draw(0);
    const observer = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    observer.observe(canvas);
    if (still) return () => observer.disconnect();

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden || now - last < 1000 / MAX_FPS) return;
      last = now;
      draw(now);
    };
    // The loop only runs while the window can be seen.
    const run = () => {
      cancelAnimationFrame(frame);
      if (appActivity.getState().visible) frame = requestAnimationFrame(tick);
    };
    run();
    const unsubscribe = appActivity.subscribe(run);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [density, still]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

/**
 * Full-screen backdrop for the Nebula tab: a slowly swirling three-colour
 * nebula (WebGL, CSS gradient fallback) with optional twinkling stars.
 * Sits behind the page; the parent must create a stacking context.
 */
export default function NebulaBackdrop({ theme }: { theme: NebulaTheme }) {
  const [webglFailed, setWebglFailed] = useState(false);
  const fail = useCallback(() => setWebglFailed(true), []);
  const [a, b, c] = theme.colors;
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden bg-[#030209]" aria-hidden>
      {webglFailed ? (
        <div
          className="nebula-fallback absolute inset-0"
          style={{ ["--nebula-a" as string]: a, ["--nebula-b" as string]: b, ["--nebula-c" as string]: c }}
        />
      ) : (
        <Nebula theme={theme} onFail={fail} />
      )}
      {theme.stars.enabled && theme.stars.density > 0 && <Stars density={theme.stars.density} />}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(0_0_0/0.55)_100%)]" />
    </div>
  );
}
