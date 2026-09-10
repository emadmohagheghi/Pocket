import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

const DEFAULT_SIZE = 240;
const DEFAULT_COLOR = "#1a73f2";
const DEFAULT_HIGHLIGHT_COLOR = "#fcffff";
const DEFAULT_SPEED = 1;
const DEFAULT_TURBULENCE = 1.2;
const DEFAULT_DETAIL = 1;
const DEFAULT_CONTRAST = 0.8;
const DEFAULT_EDGE_SOFTNESS = 0.01;

// WebGL2 port of the Skia WGSL shader from reacticx "nebula-orb". Skia feeds
// shaders y-down coordinates while gl_FragCoord is y-up, so the original's
// `1.0 - uv.y` flip must not be repeated here. Outside the circle the shader
// outputs premultiplied alpha, matching the canvas default.
const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uHighlight;
uniform float uTurbulence;
uniform float uScale;
uniform float uContrast;
uniform float uEdgeSoftness;
uniform float uLevel;

out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 seed) {
  vec2 p = seed;
  float v = 0.0;
  float a = 0.6;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 guv = uv;

  float t = uTime * 0.22;
  vec2 drift = vec2(
    sin(t) + 0.6 * sin(t * 1.7 + 1.3),
    cos(t * 0.8) + 0.6 * cos(t * 1.3 + 2.1));
  vec2 p = vec2(guv.x * 1.8, guv.y) * uScale + drift * 0.7;
  vec2 q = vec2(fbm(p + drift), fbm(p + vec2(3.2, 1.5) - drift));
  float f = fbm(p + uTurbulence * q);

  float g = clamp(1.0 - guv.y, 0.0, 1.0);
  float anchor = smoothstep(0.0, 0.3, guv.y);
  float shade = clamp(g + (f - 0.5) * uContrast * anchor, 0.0, 1.0);

  vec3 light = mix(uHighlight, uColor, 0.5);
  vec3 col = uHighlight;
  col = mix(col, light, smoothstep(0.28, 0.52, shade));
  col = mix(col, uColor, smoothstep(0.58, 0.88, shade));

  // The original calls smoothstep with reversed edges (undefined per spec);
  // 1 - smoothstep(min, max, d) is the exact defined-behavior equivalent.
  // uLevel (0..1, audio loudness) gently swells and brightens the orb. The
  // idle radius keeps 7% headroom inside the canvas so the swell never
  // touches the edge and gets clipped into a flat side.
  float breathe = 1.0 + uLevel * 0.065;
  float d = distance(uv, vec2(0.5)) * 1.07 / breathe;
  float edge = 1.0 - smoothstep(0.5 - max(uEdgeSoftness, 1e-4), 0.5, d);
  col *= 0.95 + uLevel * 0.18;
  fragColor = vec4(col * edge, edge);
}`;

// One oversized triangle covering the whole viewport, no index buffer needed.
const FULLSCREEN_TRIANGLE = new Float32Array([-1, -1, 3, -1, -1, 3]);

interface NebulaOrbProps {
  /** Diameter of the orb in CSS pixels. */
  readonly size?: number;
  readonly color?: string;
  readonly highlightColor?: string;
  /** Playback rate of the drift animation; 0 renders a frozen frame. */
  readonly speed?: number;
  readonly turbulence?: number;
  readonly detail?: number;
  readonly contrast?: number;
  readonly edgeSoftness?: number;
  /**
   * Live loudness (0..1) read every frame, e.g. a mic meter. Drives how
   * lively the drift is, a slight swell and a brightness lift.
   */
  readonly levelRef?: RefObject<number>;
  readonly paused?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
}

let colorParserContext: CanvasRenderingContext2D | null | undefined;

// Lets the browser parse any CSS color (hex, rgb(), named colors) the way
// Skia.Color parses RN color strings. Invalid strings fall back to black.
function toRgb(color: string): [number, number, number] {
  colorParserContext ??= document.createElement("canvas").getContext("2d");
  const ctx = colorParserContext;
  if (!ctx) return [0, 0, 0];

  ctx.fillStyle = "#000000";
  ctx.fillStyle = color; // ignored by the canvas when the value is invalid
  const normalized = ctx.fillStyle;

  let r = 0;
  let g = 0;
  let b = 0;
  if (normalized.startsWith("#")) {
    r = parseInt(normalized.slice(1, 3), 16);
    g = parseInt(normalized.slice(3, 5), 16);
    b = parseInt(normalized.slice(5, 7), 16);
  } else {
    const parts = normalized.match(/[\d.]+/g);
    if (parts && parts.length >= 3) {
      r = Number(parts[0]);
      g = Number(parts[1]);
      b = Number(parts[2]);
    }
  }
  return [r / 255, g / 255, b / 255];
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("NebulaOrb: shader compile failed", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vs || !fs) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("NebulaOrb: program link failed", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function NebulaOrbBase({
  size = DEFAULT_SIZE,
  color = DEFAULT_COLOR,
  highlightColor = DEFAULT_HIGHLIGHT_COLOR,
  speed = DEFAULT_SPEED,
  turbulence = DEFAULT_TURBULENCE,
  detail = DEFAULT_DETAIL,
  contrast = DEFAULT_CONTRAST,
  edgeSoftness = DEFAULT_EDGE_SOFTNESS,
  levelRef,
  paused = false,
  className,
  style,
}: NebulaOrbProps) {
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const drawRef = useRef<() => void>(() => {});

  const colorRgb = useMemo(() => toRgb(color), [color]);
  const highlightRgb = useMemo(() => toRgb(highlightColor), [highlightColor]);

  const uniformsRef = useRef({
    colorRgb,
    highlightRgb,
    speed,
    turbulence,
    detail,
    contrast,
    edgeSoftness,
    levelRef,
  });

  // Declared before the setup effect so a mount draw always sees fresh props.
  useEffect(() => {
    uniformsRef.current = {
      colorRgb,
      highlightRgb,
      speed,
      turbulence,
      detail,
      contrast,
      edgeSoftness,
      levelRef,
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
    });
    if (!gl) {
      setFailed(true);
      return;
    }

    const program = createProgram(gl);
    if (!program) {
      setFailed(true);
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_TRIANGLE, gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const locations = {
      uResolution: gl.getUniformLocation(program, "uResolution"),
      uTime: gl.getUniformLocation(program, "uTime"),
      uColor: gl.getUniformLocation(program, "uColor"),
      uHighlight: gl.getUniformLocation(program, "uHighlight"),
      uTurbulence: gl.getUniformLocation(program, "uTurbulence"),
      uScale: gl.getUniformLocation(program, "uScale"),
      uContrast: gl.getUniformLocation(program, "uContrast"),
      uEdgeSoftness: gl.getUniformLocation(program, "uEdgeSoftness"),
      uLevel: gl.getUniformLocation(program, "uLevel"),
    };

    drawRef.current = () => {
      const u = uniformsRef.current;
      const level = Math.min(1, u.levelRef?.current ?? 0);
      // speed is applied when time accumulates (rAF loop), not here —
      // multiplying here would make the phase jump when speed changes.
      gl.uniform2f(locations.uResolution, canvas.width, canvas.height);
      gl.uniform1f(locations.uTime, timeRef.current);
      gl.uniform3fv(locations.uColor, u.colorRgb);
      gl.uniform3fv(locations.uHighlight, u.highlightRgb);
      gl.uniform1f(locations.uTurbulence, u.turbulence * (0.85 + level * 0.3));
      gl.uniform1f(locations.uScale, u.detail);
      gl.uniform1f(locations.uContrast, u.contrast * (0.95 + level * 0.15));
      gl.uniform1f(locations.uEdgeSoftness, u.edgeSoftness);
      gl.uniform1f(locations.uLevel, level);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // One static frame so a paused orb is never blank.
    drawRef.current();

    return () => {
      drawRef.current = () => {};
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixels = Math.max(1, Math.round(size * (window.devicePixelRatio || 1)));
    canvas.width = pixels;
    canvas.height = pixels;
    drawRef.current();
  }, [size]);

  useEffect(() => {
    if (paused) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      // speed (and loudness) scale the rate going forward, so changing them
      // mid-animation never jumps the phase. The level band is deliberately
      // narrow (0.8x..1.8x) — loudness should feel like a slow swell, not a
      // twitch.
      const u = uniformsRef.current;
      const level = Math.min(1, u.levelRef?.current ?? 0);
      timeRef.current += ((now - last) / 1000) * u.speed * (0.8 + level);
      last = now;
      drawRef.current();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  if (failed) {
    return <div className={className} style={{ width: size, height: size, ...style }} />;
  }

  return (
    <div className={className} style={{ width: size, height: size, ...style }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
}

const NebulaOrb = memo(NebulaOrbBase);

export { NebulaOrb };
export type { NebulaOrbProps };
export default NebulaOrb;
