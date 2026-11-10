import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { retrieveProductVariants } from "../src/lib/channel3/variants.ts";

describe("SpendPilot AI: See Options Dropdown UI, Retailer Options & Budget Reminder", () => {
  test("1. MacBook options fetch alternative retailer options (RAM 16/24/32GB, Storage, Colors) with accurate pricing", async () => {
    const variantState = await retrieveProductVariants(
      "apple-macbook-air-m3-13",
      { RAM: "16GB Unified Memory" },
      "USD",
      "https://apple.com/shop/buy-mac/macbook-air/13-inch-m3"
    );

    assert.ok(variantState.options.length >= 2, "Should return genuine retailer dimensions");

    const ramDim = variantState.options.find((o) => o.name.toLowerCase() === "ram");
    assert.ok(ramDim, "RAM dimension must be present");
    assert.ok(ramDim.values.some((v) => v.label.includes("16GB")), "16GB RAM must be available");
    assert.ok(ramDim.values.some((v) => v.label.includes("24GB")), "24GB RAM must be available");
    assert.ok(ramDim.values.some((v) => v.label.includes("32GB")), "32GB RAM must be available");

    const colorDim = variantState.options.find((o) => o.name.toLowerCase() === "color");
    assert.ok(colorDim, "Color dimension must be present");
    assert.ok(colorDim.values.some((v) => v.label.toLowerCase().includes("midnight")), "Midnight color must be available");
    assert.ok(colorDim.values.some((v) => v.label.toLowerCase().includes("space gray")), "Space Gray color must be available");

    // Check pricing: 24GB should be higher than 16GB
    const ram16 = ramDim.values.find((v) => v.label.includes("16GB"));
    const ram24 = ramDim.values.find((v) => v.label.includes("24GB"));
    assert.ok(ram16 && ram24, "Both RAM tiers must be defined");
    if (ram16.priceMinor && ram24.priceMinor) {
      assert.ok(ram24.priceMinor > ram16.priceMinor, "24GB RAM should reflect retailer upgrade price delta");
    }
  });

  test("2. Shoes options fetch sizing and color options", async () => {
    const variantState = await retrieveProductVariants(
      "nike-pegasus-41-running-shoe",
      { Size: "US 10" },
      "USD"
    );

    assert.ok(variantState.options.length >= 1, "Should return shoe options");
    const sizeDim = variantState.options.find((o) => o.name.toLowerCase() === "size");
    assert.ok(sizeDim, "Size dimension must be present");
    assert.ok(sizeDim.values.some((v) => v.label.includes("10")), "Size 10 should be available");
  });

  test("3. Component contract: ProductVariantConfigurator renders dropdown UI, color swatches/thumbnails, and gentle reminder", () => {
    const componentPath = path.join(
      process.cwd(),
      "src/components/guided-shopping/ProductVariantConfigurator.tsx"
    );
    const content = fs.readFileSync(componentPath, "utf-8");

    // Dropdown UI check
    assert.ok(content.includes("OptionDropdown"), "Must use dropdown component for options");
    assert.ok(content.includes("role=\"listbox\""), "Must use accessible listbox for dropdown options");
    assert.ok(content.includes("role=\"option\""), "Must have option role inside dropdown");

    // Visual thumbnail / color swatches check
    assert.ok(content.includes("COLOR_SWATCH_MAP"), "Must support color swatches");
    assert.ok(content.includes("thumbnailUrl"), "Must support thumbnail images for visual options");

    // Budget exceeded gentle reminder check
    assert.ok(
      content.includes("Gentle Reminder: Confirmed Budget Exceeded"),
      "Must have gentle reminder banner when budget is exceeded"
    );
    assert.ok(
      content.includes("Proceed with Exceeded Budget"),
      "Must provide a proceed button when the user wants to proceed with an exceeded budget"
    );
    assert.ok(
      content.includes("isOverBudget"),
      "Must calculate whether selection exceeds budget"
    );
    assert.ok(
      content.includes("currentImageUrl"),
      "Must track currentImageUrl for dynamic color image placement"
    );
  });

  test("4. Color selection automatically resolves and places the selected color image", async () => {
    // When Space Gray color is selected, the returned variantState must carry the Space Gray image
    const variantStateSpaceGray = await retrieveProductVariants(
      "apple-macbook-air-m3-13",
      { Color: "Space Gray" },
      "USD"
    );

    assert.ok(variantStateSpaceGray.imageUrl, "Must have an image URL for Space Gray");
    assert.ok(
      variantStateSpaceGray.imageUrl.includes("spacegray"),
      `Expected spacegray in URL: ${variantStateSpaceGray.imageUrl}`
    );

    // When Starlight color is selected, the returned variantState must carry the Starlight image
    const variantStateStarlight = await retrieveProductVariants(
      "apple-macbook-air-m3-13",
      { Color: "Starlight" },
      "USD"
    );

    assert.ok(variantStateStarlight.imageUrl, "Must have an image URL for Starlight");
    assert.ok(
      variantStateStarlight.imageUrl.includes("starlight"),
      `Expected starlight in URL: ${variantStateStarlight.imageUrl}`
    );
  });

  test("5. User selected options are strictly preserved and not overwritten by server defaults", async () => {
    const variantState = await retrieveProductVariants(
      "apple-macbook-air-m3-13",
      { Color: "Silver", RAM: "24GB Unified Memory" },
      "USD"
    );

    const colorDim = variantState.options.find((o) => o.name.toLowerCase() === "color");
    assert.ok(colorDim, "Color dimension must exist");
    assert.equal(colorDim.selectedValue, "Silver", "Selected value must reflect user's chosen color");

    const ramDim = variantState.options.find((o) => o.name.toLowerCase() === "ram");
    assert.ok(ramDim, "RAM dimension must exist");
    assert.equal(ramDim.selectedValue, "24GB Unified Memory", "Selected value must reflect user's chosen RAM");

    assert.equal(variantState.effectiveSelected["Color"], "Silver");
    assert.equal(variantState.effectiveSelected["RAM"], "24GB Unified Memory");
  });

  test("6. Comparison priority refinement buttons strictly keep ONLY Close to Budget, Best Budget, and Best Quality", () => {
    const comparisonWorkspacePath = path.join(
      process.cwd(),
      "src/components/comparison/AiComparisonWorkspace.tsx"
    );
    const content = fs.readFileSync(comparisonWorkspacePath, "utf-8");

    // Extract refinementPresets array block
    const presetMatch = content.match(/const refinementPresets = \[([\s\S]*?)\];/);
    assert.ok(presetMatch, "refinementPresets definition must exist");

    const presetBlock = presetMatch[1];
    assert.ok(presetBlock.includes('"Close to Budget"'), "Must include Close to Budget");
    assert.ok(presetBlock.includes('"Best Budget"'), "Must include Best Budget");
    assert.ok(presetBlock.includes('"Best Quality"'), "Must include Best Quality");

    // Must NOT contain removed buttons
    assert.ok(!presetBlock.includes('"Lowest Price"'), "Must remove Lowest Price button");
    assert.ok(!presetBlock.includes('"Comfort & Quality"'), "Must remove Comfort & Quality button");
    assert.ok(!presetBlock.includes('"Battery & Efficiency"'), "Must remove Battery & Efficiency button");
    assert.ok(!presetBlock.includes('"Best Budget Saver"'), "Must rename/clean Best Budget Saver");

    // Exactly 3 presets
    const labels = presetBlock.match(/label:\s*"([^"]+)"/g) || [];
    assert.equal(labels.length, 3, "Must strictly have exactly 3 priority refinement buttons");
  });

  test("7. UI Polish: No navbar-hero dividing line, no floating cart, no money beside navbar cart, and anti-flash scrollbars", () => {
    // 1. Verify SiteHeader has no border-b between navbar and hero, and has seamless bg-transparent
    const headerPath = path.join(process.cwd(), "src/components/layout/SiteHeader.tsx");
    const headerContent = fs.readFileSync(headerPath, "utf-8");

    assert.ok(headerContent.includes("border-b-0"), "SiteHeader must have border-b-0");
    assert.ok(!headerContent.includes("border-b border-orange-200"), "SiteHeader must not have dividing line border-b");
    assert.ok(headerContent.includes("bg-transparent"), "SiteHeader must be bg-transparent to match hero gradient seamlessly");

    // 2. Verify navbar has 3D buttons for Assistant, How It Works, and Transparency, and navigates from subpages
    assert.ok(headerContent.includes("btn-3d-secondary px-3.5 py-1.5"), "Navbar items must use 3D buttons");
    assert.ok(headerContent.includes("router.push(`/#${id}`)"), "Navbar must navigate to home anchor when on /cart or subpages");

    // 3. Verify no money display beside Cart button in navbar
    const cartButtonSection = headerContent.slice(headerContent.indexOf('href="/cart"'), headerContent.indexOf('</Link>'));
    assert.ok(!cartButtonSection.includes("totalSelectedMinor"), "Cart button in navbar must not show money amount");
    assert.ok(!cartButtonSection.includes("formatCurrency"), "Cart button in navbar must not format or display currency");

    // 4. Verify MyShoppingList drawer is completely removed from page.tsx
    const homePagePath = path.join(process.cwd(), "src/app/page.tsx");
    const homePageContent = fs.readFileSync(homePagePath, "utf-8");
    assert.ok(!homePageContent.includes("<MyShoppingList"), "MyShoppingList component must not be rendered on page.tsx");
    assert.ok(!homePageContent.includes("isShoppingListOpen"), "isShoppingListOpen state must not exist on page.tsx");

    // 5. Verify globals.css defines non-flashing scrollbar-color and root webkit scrollbar
    const cssPath = path.join(process.cwd(), "src/app/globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");
    assert.ok(cssContent.includes("scrollbar-color:"), "globals.css must specify scrollbar-color");
    assert.ok(cssContent.includes("html.dark::-webkit-scrollbar-thumb"), "globals.css must explicitly style root html dark scrollbar thumb");

    // 6. Verify dark mode buttons have 3D bottom borders matching light mode (not invisible #000000)
    assert.ok(cssContent.includes(".dark .btn-3d-secondary"), "globals.css must style dark mode secondary 3D buttons");
    assert.ok(!cssContent.includes(".dark .btn-3d-secondary,\n[data-theme=\"dark\"] .btn-3d-secondary {\n  background: linear-gradient(180deg, #1A130E 0%, #0E0906 100%);\n  color: #FFA564;\n  font-weight: 800;\n  border: 1px solid rgba(255, 106, 0, 0.35);\n  border-top: none;\n  border-bottom: 4px solid #000000;"), "Dark mode secondary button must not have black #000000 bottom border");
    assert.ok(cssContent.includes("border-bottom: 4px solid #993800"), "Dark mode secondary button must have visible amber/orange 3D border");
  });
});

