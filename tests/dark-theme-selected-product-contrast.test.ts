import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Dark Theme Selected Comparison Product Background & Contrast Verification", () => {
  const productCardPath = path.join(process.cwd(), "src/components/product-results/ProductCard.tsx");
  const comparisonWorkspacePath = path.join(process.cwd(), "src/components/comparison/AiComparisonWorkspace.tsx");
  const liveResultsPath = path.join(process.cwd(), "src/components/product-results/LiveProductResults.tsx");

  const productCardCode = fs.readFileSync(productCardPath, "utf-8");
  const comparisonWorkspaceCode = fs.readFileSync(comparisonWorkspacePath, "utf-8");
  const liveResultsCode = fs.readFileSync(liveResultsPath, "utf-8");

  test("1. ProductCard does not contain muddy brownish/orange dark backgrounds", () => {
    assert.strictEqual(
      productCardCode.includes("#18130e"),
      false,
      "ProductCard must not use muddy brownish #18130e background"
    );
    assert.strictEqual(
      productCardCode.includes("#0f0d0a"),
      false,
      "ProductCard must not use muddy brownish #0f0d0a background"
    );
  });

  test("2. ProductCard top pick uses clean dark gradient with high contrast border and glow", () => {
    assert.ok(
      productCardCode.includes("dark:from-[#161618] dark:to-[#0e0e10]"),
      "ProductCard top pick must use clean neutral dark gradient matching app dark theme"
    );
    assert.ok(
      productCardCode.includes("dark:border-[#FF6A00]/60"),
      "ProductCard top pick must have distinct high-visibility orange border"
    );
  });

  test("3. ProductCard text elements use high-contrast dark classes", () => {
    assert.ok(
      productCardCode.includes("dark:text-[#D4D4D8]"),
      "ProductCard must use bright readable text for labels and secondary details"
    );
    assert.ok(
      productCardCode.includes("dark:text-[#F5F5F5]"),
      "ProductCard must use crisp white/silver text for titles, prices, and insights"
    );
  });

  test("4. AiComparisonWorkspace top recommendation does not use muddy dark brown backgrounds", () => {
    assert.strictEqual(
      comparisonWorkspaceCode.includes("#14110e"),
      false,
      "Top recommendation verdict panel must not use muddy #14110e background"
    );
    assert.strictEqual(
      comparisonWorkspaceCode.includes("#100e0c"),
      false,
      "Top recommendation product hero must not use muddy #100e0c background"
    );
    assert.strictEqual(
      comparisonWorkspaceCode.includes("#161310"),
      false,
      "SpendPilot recommendation rationale box must not use muddy #161310 background"
    );
  });

  test("5. AiComparisonWorkspace top recommendation verdict panel uses clean dark styling and readable text", () => {
    assert.ok(
      comparisonWorkspaceCode.includes("dark:from-[#161618] dark:to-[#0e0e10]"),
      "Verdict panel must use sleek dark gradient"
    );
    assert.ok(
      comparisonWorkspaceCode.includes("dark:bg-[#141414]"),
      "Product hero card must use clean #141414 surface"
    );
    assert.ok(
      comparisonWorkspaceCode.includes("dark:bg-[#161616]"),
      "Rationale box must use clean #161616 surface"
    );
    assert.ok(
      comparisonWorkspaceCode.includes("dark:text-[#F5F5F5] leading-relaxed bg-orange-50/60 dark:bg-[#161616]"),
      "Rationale text must be crisp #F5F5F5 for maximum readability"
    );
  });

  test("6. AiComparisonWorkspace side-by-side comparison table winner column uses sleek dark styling and high contrast text", () => {
    assert.strictEqual(
      comparisonWorkspaceCode.includes("dark:bg-[#181410]"),
      false,
      "Winner column header must not use muddy #181410"
    );
    assert.ok(
      comparisonWorkspaceCode.includes("dark:bg-[#181818] border-t-2 border-t-[#FF6A00]"),
      "Winner column header must use sleek #181818 with top orange accent border"
    );
    assert.ok(
      comparisonWorkspaceCode.includes("dark:bg-[#151515]"),
      "Winner column cells must have unified subtle column styling"
    );
  });

  test("7. Mathematical WCAG AA contrast ratio verification for dark theme text on dark surfaces", () => {
    // Relative luminance calculation according to WCAG 2.1 specifications
    function sRGBtoLin(colorChannel: number): number {
      const c = colorChannel / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    function hexToLuminance(hex: string): number {
      const cleanHex = hex.replace("#", "");
      const r = parseInt(cleanHex.substring(0, 2), 16);
      const g = parseInt(cleanHex.substring(2, 4), 16);
      const b = parseInt(cleanHex.substring(4, 6), 16);
      return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
    }

    function contrastRatio(hex1: string, hex2: string): number {
      const l1 = hexToLuminance(hex1);
      const l2 = hexToLuminance(hex2);
      const brightest = Math.max(l1, l2);
      const darkest = Math.min(l1, l2);
      return (brightest + 0.05) / (darkest + 0.05);
    }

    const darkSurfaces = ["#0e0e10", "#141414", "#161616", "#151515", "#181818"];
    const textColors = [
      { name: "Primary Title / Price (#F5F5F5)", hex: "#F5F5F5" },
      { name: "Specs & Body Text (#E4E4E7)", hex: "#E4E4E7" },
      { name: "Secondary Details (#D4D4D8)", hex: "#D4D4D8" },
      { name: "Muted Labels (#A1A1AA)", hex: "#A1A1AA" },
    ];

    for (const surface of darkSurfaces) {
      for (const text of textColors) {
        const ratio = contrastRatio(text.hex, surface);
        // WCAG AA requires at least 4.5:1 for normal text (and 3:1 for large text / secondary labels)
        assert.ok(
          ratio >= 4.5,
          `Text ${text.name} on surface ${surface} must satisfy WCAG AA contrast (got ${ratio.toFixed(2)}:1)`
        );
      }
    }
  });
});
