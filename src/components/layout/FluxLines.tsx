import { useEffect, useRef } from "react";
import { useAppActivity } from "@/lib/appActivity";

const MAX_DPR = 1.5;
const STILL_TIME = 6;

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uLine;
uniform float uMaxHalf;
out vec4 outColor;

float hash(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float smin(float a, float b, float k) {
  float r = exp2(-a / k) + exp2(-b / k);
  return -k * log2(r);
}

float sinlerp(float a, float b, float w) {
  return mix(a, b, (sin(w * 3.14159265 - 3.14159265 / 2.0) + 1.0) / 2.0);
}

float vn(vec2 p, float s, float seed) {
  vec2 cellp = floor(p / s);
  vec2 relp = mod(p, s);
  float g1 = hash(vec3(cellp, seed));
  float g2 = hash(vec3(cellp.x + 1.0, cellp.y, seed));
  float g3 = hash(vec3(cellp.x + 1.0, cellp.y + 1.0, seed));
  float g4 = hash(vec3(cellp.x, cellp.y + 1.0, seed));
  float bx = sinlerp(g1, g2, relp.x / s);
  float tx = sinlerp(g4, g3, relp.x / s);
  return sinlerp(bx, tx, relp.y / s);
}

float dbn(vec2 p, float s, float seed) {
  float o = s / 2.0;
  float n0 = vn(p, s, seed);
  float n1 = vn(p + vec2(o, o), s, seed + 0.1);
  float n2 = vn(p + vec2(-o, o), s, seed + 0.2);
  float n3 = vn(p + vec2(o, -o), s, seed + 0.3);
  float n4 = vn(p + vec2(-o, -o), s, seed + 0.4);
  return (2.0 * n0 + 1.5 * n1 + 1.25 * n2 + 1.125 * n3 + n4) / 7.0;
}

void main() {
  float ref = 700.0 / 1.6;
  vec2 p = gl_FragCoord.xy / uResolution.y * ref;
  float spd = 100.0;
  float t = uTime;
  vec2 dir = vec2(0.0, -1.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float distort1 = vn(p + perp * (t * spd), 60.0, 10.0) * 50.0;
  float distort2 = vn(p - perp * (t * spd), 120.0, 15.0) * 100.0;
  float peaks = dbn(p + distort1 + dir * (t * spd * 0.5), 40.0, 1.0);
  float peaks2 = dbn(p + distort2 - dir * (t * spd * 0.5), 40.0, 0.0);
  float field = smin(peaks, peaks2, 0.1);

  float slope = length(vec2(dFdx(field), dFdy(field)));
  float gap = abs(field - 0.4);
  float pixels = gap / max(slope, 1e-6);
  float halfBand = 0.1;
  float across = max(gap / halfBand, pixels / uMaxHalf);
  float band = 1.0 * (1.0 - across);
  float shimmer = vn(p + dir * (t * spd * 0.5), 60.0, 12.0) * 1.5;
  float lit = clamp(band - shimmer, 0.0, 1.0);
  float glow = pow(lit, 2.5) * 2.0;
  float core = smoothstep(uLine + 0.75, uLine - 0.75, pixels) * smoothstep(0.08, 0.6, glow);
  float shine = clamp(glow, 0.0, 1.0);
  float energy = max(shine * shine, core * 0.85) * 0.55;
  outColor = vec4(vec3(energy), energy);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

export default function FluxLines() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wakeRef = useRef<() => void>(() => undefined);
  const { visible, backdropStill } = useAppActivity();
  const activity = useRef({ visible, backdropStill });
  activity.current = { visible, backdropStill };

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!canvas || !gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, "aPosition");
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }
    const uResolution = gl.getUniformLocation(program, "uResolution");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uLine = gl.getUniformLocation(program, "uLine");
    const uMaxHalf = gl.getUniformLocation(program, "uMaxHalf");

    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    let time = STILL_TIME;
    let raf = 0;
    let last = 0;

    const render = () => {
      const ratio = canvas.width / Math.max(1, canvas.clientWidth);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uLine, ratio * 0.5);
      gl.uniform1f(uMaxHalf, 28 * ratio);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = (now: number) => {
      raf = 0;
      const { visible: shown, backdropStill: still } = activity.current;
      if (!shown || still) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      time += dt;
      render();
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      const { visible: shown, backdropStill: still } = activity.current;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      if (!shown) return;
      if (still) {
        time = STILL_TIME;
        render();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    wakeRef.current = wake;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    wake();

    return () => {
      wakeRef.current = () => undefined;
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  useEffect(() => {
    wakeRef.current();
  }, [visible, backdropStill]);

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 -z-10 h-full w-full pointer-events-none" />;
}
