export interface ViewportTransformMatrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

const IDENTITY_MATRIX: ViewportTransformMatrix = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
const NUMBER_SOURCE = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
const SEPARATOR_SOURCE = String.raw`(?:\s*,\s*|\s+)`;
const matrixPattern = new RegExp(
  String.raw`^matrix\(\s*(${NUMBER_SOURCE})${SEPARATOR_SOURCE}(${NUMBER_SOURCE})${SEPARATOR_SOURCE}(${NUMBER_SOURCE})${SEPARATOR_SOURCE}(${NUMBER_SOURCE})${SEPARATOR_SOURCE}(${NUMBER_SOURCE})${SEPARATOR_SOURCE}(${NUMBER_SOURCE})\s*\)$`,
  "i"
);
const translateScalePattern = new RegExp(
  String.raw`^translate\(\s*(${NUMBER_SOURCE})(?:${SEPARATOR_SOURCE}(${NUMBER_SOURCE}))?\s*\)\s+scale\(\s*(${NUMBER_SOURCE})(?:${SEPARATOR_SOURCE}(${NUMBER_SOURCE}))?\s*\)$`,
  "i"
);

function finiteValues(values: readonly string[]): number[] {
  const parsed = values.map(Number);
  if (!parsed.every(Number.isFinite)) {
    throw new Error(`[ViewportTransform] Non-finite viewport transform: ${values.join(", ")}`);
  }
  return parsed;
}

/**
 * Parses the transform forms emitted by MapViewport without touching SVGTransformList.
 * Keeping this read-only prevents Firefox MutationObserver feedback loops.
 */
export function parseViewportTransform(value: string | null | undefined): ViewportTransformMatrix {
  const normalized = value?.trim() ?? "";
  if (!normalized) return IDENTITY_MATRIX;

  const matrixMatch = matrixPattern.exec(normalized);
  if (matrixMatch) {
    const [a, b, c, d, e, f] = finiteValues(matrixMatch.slice(1));
    return { a, b, c, d, e, f };
  }

  const translateScaleMatch = translateScalePattern.exec(normalized);
  if (translateScaleMatch) {
    const [, translateXRaw, translateYRaw, scaleXRaw, scaleYRaw] = translateScaleMatch;
    const [translateX, translateY, scaleX, scaleY] = finiteValues([
      translateXRaw,
      translateYRaw ?? "0",
      scaleXRaw,
      scaleYRaw ?? scaleXRaw
    ]);
    return { a: scaleX, b: 0, c: 0, d: scaleY, e: translateX, f: translateY };
  }

  throw new Error(`[ViewportTransform] Unsupported viewport transform: ${normalized}`);
}
