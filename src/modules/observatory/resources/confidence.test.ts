import { describe, expect, it } from "vitest";
import { isMathGarbled, textConfidence } from "./confidence";

describe("isMathGarbled", () => {
  it("flags equations pdf.js flattened into stray symbols", () => {
    expect(isMathGarbled("show that ∫ b 1 ( ) ∑n n(n + 1) xdx = b2 − a2 . Recall that i = . a 2 2 i=1 ∫ 2")).toBe(true);
    expect(isMathGarbled("Evaluate ∫ 1 0 ( ) dx and simplify")).toBe(true);
    expect(isMathGarbled("Compute exdx using the definition of the definite integral in terms of a Riemann 0 ∑n r − rn+1 sum. Recall that ri = for r 6= 1.")).toBe(true);
  });

  it("leaves prose, plain formulas and clean LaTeX alone", () => {
    expect(isMathGarbled("Find the area between the curves and explain why the integral converges.")).toBe(false);
    expect(isMathGarbled("Let x = 2 + y and solve for y when x is a positive integer.")).toBe(false);
    expect(isMathGarbled("Show that $\\int_a^b x\\,dx = \\frac{b^2 - a^2}{2}$. Recall that $\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$.")).toBe(false);
    expect(isMathGarbled("$$\n\\int_0^1 x^2 \\, dx\n$$")).toBe(false);
  });
});

const clean = `Practice Problem Set 1
1. Identify and sketch the following conic sections:
(a) y = x^2 + 2x + 2
2. Determine the possible values of d. Answer: d = 6 or d = 10
3. Find f(4). Answer: f(4) = 13/2`;

describe("textConfidence", () => {
  it("keeps clean text at 1", () => {
    expect(textConfidence(clean)).toEqual({ confidence: 1, reasons: [], needsOcr: false });
  });

  it("flags pages with no or almost no text for OCR", () => {
    expect(textConfidence("")).toEqual({ confidence: 0, reasons: ["no text layer"], needsOcr: true });
    expect(textConfidence("  12 \n  ").needsOcr).toBe(true);
  });

  it("lowers confidence for replacement and private-use characters", () => {
    const r = textConfidence(`${clean}\n(c) hyperbola, asymptotes y = �x/ 2 and `);
    expect(r.confidence).toBeCloseTo(0.75);
    expect(r.reasons).toEqual(["1 replacement characters", "1 private-use glyphs"]);
  });

  it("detects lost math symbols like the ProblemSet1 text layer", () => {
    const garbled = `5. For the function f (x) =            1    , find:
1 + e-x
(a) the domain of f (x), D(f ),
Answer: (a) D(f ) = (-, ) , (b) R(f ) = (0, 1)
6. Determine whether gg, g  f are even, odd or neither.
x
2
9. Let f (x) = ex with domain x  [-2, 2]
f ( ) =
= =`;
    const r = textConfidence(garbled);
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.reasons.join("; ")).toMatch(/empty brackets/);
    expect(r.reasons.join("; ")).toMatch(/orphan equals/);
    expect(r.reasons.join("; ")).toMatch(/gaps where symbols were lost/);
    expect(r.reasons.join("; ")).toMatch(/lines of single characters/);
    expect(r.reasons.join("; ")).toMatch(/1 broken numbering/);
  });

  it("does not count code braces as single-character lines", () => {
    const code = "int main() {\n    return 0;\n}\nvoid f() {\n}\nint x = 1;";
    expect(textConfidence(code).confidence).toBe(1);
  });

  it("never goes below 0", () => {
    expect(textConfidence("�".repeat(40) + "".repeat(40) + "( ) ".repeat(20)).confidence).toBeGreaterThanOrEqual(0);
  });
});
