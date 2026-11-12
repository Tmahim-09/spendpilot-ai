import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { retrieveProductVariants } from "../src/lib/channel3/variants.ts";
import { setChannel3ClientForTesting } from "../src/lib/channel3/client.ts";
import type { Channel3 } from "@channel3/sdk";

const mockChannel3TestClient = {
  products: {
    retrieve: async ({
      product_id,
      selected_options,
    }: {
      product_id: string;
      selected_options?: Record<string, string>;
    }) => {
      if (product_id === "apple-macbook-air-m3-13") {
        const selRAM = selected_options?.RAM || "16GB Unified Memory";
        const selColor = selected_options?.Color || "Midnight";
        const ramDelta = selRAM.includes("24") ? 200 : selRAM.includes("32") ? 400 : 0;
        return {
          id: "apple-macbook-air-m3-13",
          title: "Apple MacBook Air 13-inch M3",
          variants: {
            options: [
              {
                name: "RAM",
                values: [
                  { label: "16GB Unified Memory", exists: true, available: "InStock" },
                  { label: "24GB Unified Memory", exists: true, available: "InStock" },
                  { label: "32GB Unified Memory", exists: true, available: "InStock" },
                ],
              },
              {
                name: "Color",
                values: [
                  {
                    label: "Midnight",
                    exists: true,
                    available: "InStock",
                    thumbnail_url:
                      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba13-midnight-select-202402?wid=400&hei=400&fmt=jpeg",
                  },
                  {
                    label: "Space Gray",
                    exists: true,
                    available: "InStock",
                    thumbnail_url:
                      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba13-spacegray-select-202402?wid=400&hei=400&fmt=jpeg",
                  },
                  {
                    label: "Silver",
                    exists: true,
                    available: "InStock",
                    thumbnail_url:
                      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba13-silver-select-202402?wid=400&hei=400&fmt=jpeg",
                  },
                  {
                    label: "Starlight",
                    exists: true,
                    available: "InStock",
                    thumbnail_url:
                      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba13-starlight-select-202402?wid=400&hei=400&fmt=jpeg",
                  },
                ],
              },
            ],
            selected: [
              { name: "RAM", label: selRAM },
              { name: "Color", label: selColor },
            ],
          },
          offers: [
            {
              domain: "apple.com",
              url: "https://apple.com/shop/buy-mac/macbook-air/13-inch-m3",
              price: { price: 1099 + ramDelta, currency: "USD" },
              availability: "InStock",
            },
          ],
        };
      }
      if (product_id === "nike-pegasus-41-running-shoe") {
        const selSize = selected_options?.Size || "US 10";
        return {
          id: "nike-pegasus-41-running-shoe",
          title: "Nike Pegasus 41 Running Shoe",
          variants: {
            options: [
              {
                name: "Size",
                values: [
                  { label: "US 9", exists: true, available: "InStock" },
                  { label: "US 9.5", exists: true, available: "InStock" },
                  { label: "US 10", exists: true, available: "InStock" },
                  { label: "US 10.5", exists: true, available: "InStock" },
                  { label: "US 11", exists: true, available: "InStock" },
                ],
              },
            ],
            selected: [{ name: "Size", label: selSize }],
          },
          offers: [
            {
              domain: "nike.com",
              url: "https://nike.com/pegasus-41",
              price: { price: 140, currency: "USD" },
              availability: "InStock",
            },
          ],
        };
      }
      if (product_id === "live-channel3-macbook-no-variants") {
        return {
          id: "live-channel3-macbook-no-variants",
          title: "MacBook Air 13.6-inch M3 Laptop",
          variants: null,
          structured_attributes: {
            ram: ["16 GB"],
            "storage-capacity": ["512 GB"],
            "processor-family": ["Apple M3"],
            "operating-system": ["macOS"],
          },
          colors: [
            { hex: "#060f14", percentage: 0.5 },
            { hex: "#4b4c4e", percentage: 0.3 },
          ],
          offers: [
            {
              domain: "bestbuy.com",
              url: "https://bestbuy.com/macbook-air-m3",
              price: { price: 1099, currency: "USD" },
              availability: "InStock",
            },
          ],
        };
      }
      if (product_id === "live-channel3-gaming-chair") {
        return {
          id: "live-channel3-gaming-chair",
          title: "Ergonomic Gaming Chair with Footrest",
          variants: null,
          structured_attributes: {
            "upholstery-material": ["Breathable Mesh / Fabric", "Premium PU Leather"],
          },
          colors: [
            { hex: "#111111", percentage: 0.6 },
            { hex: "#7d262b", percentage: 0.4 },
          ],
          offers: [
            {
              domain: "bestbuy.com",
              url: "https://bestbuy.com/gaming-chair",
              price: { price: 149.99, currency: "USD" },
              availability: "InStock",
            },
          ],
        };
      }
      if (product_id === "live-channel3-coffee-maker") {
        return {
          id: "live-channel3-coffee-maker",
          title: "Programmable Coffee Maker 12-Cup",
          variants: null,
          structured_attributes: {
            "brew-strength-options": ["Regular", "Bold"],
          },
          colors: [
            { hex: "#3f3f3f", percentage: 0.7 },
          ],
          offers: [
            {
              domain: "target.com",
              url: "https://target.com/coffee-maker",
              price: { price: 59.99, currency: "USD" },
              availability: "InStock",
            },
          ],
        };
      }
      return null;
    },
    lookup: async () => null,
    search: async () => ({ response: { products: [] } }),
  },
} as unknown as Channel3;

describe("SpendPilot AI: See Options Dropdown UI, Retailer Options & Budget Reminder", () => {
  before(() => {
    setChannel3ClientForTesting(mockChannel3TestClient);
  });

  after(() => {
    setChannel3ClientForTesting(null);
  });
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

  test("8. Live Channel3 MacBook with null variants generates RAM, Storage, and Color options with pricing deltas", async () => {
    const variantState = await retrieveProductVariants(
      "live-channel3-macbook-no-variants",
      undefined,
      "USD",
      "https://bestbuy.com/macbook-air-m3"
    );

    assert.equal(variantState.status, "variants_found", "Status must be variants_found instead of no_variants_verified");
    assert.ok(variantState.options.length >= 3, "Must have at least RAM, Storage, and Color dimensions");

    const ramDim = variantState.options.find((o) => o.name.toLowerCase() === "ram");
    assert.ok(ramDim, "RAM dimension must exist");
    assert.ok(ramDim.values.some((v) => v.label.includes("16GB")), "16GB RAM must exist");
    assert.ok(ramDim.values.some((v) => v.label.includes("24GB")), "24GB RAM must exist");
    assert.ok(ramDim.values.some((v) => v.label.includes("36GB")), "36GB RAM must exist");

    const storageDim = variantState.options.find((o) => o.name.toLowerCase() === "storage");
    assert.ok(storageDim, "Storage dimension must exist");
    assert.ok(storageDim.values.some((v) => v.label.includes("512 GB")), "512 GB SSD must exist");
    assert.ok(storageDim.values.some((v) => v.label.includes("1 TB")), "1 TB SSD must exist");
    assert.ok(storageDim.values.some((v) => v.label.includes("2 TB")), "2 TB SSD must exist");

    const colorDim = variantState.options.find((o) => o.name.toLowerCase() === "color");
    assert.ok(colorDim, "Color dimension must exist");
    assert.ok(colorDim.values.some((v) => v.label === "Midnight"), "Midnight color must exist");
    assert.ok(colorDim.values.some((v) => v.label === "Space Gray"), "Space Gray color must exist");
    assert.ok(colorDim.values.some((v) => v.label === "Silver"), "Silver color must exist");
    assert.ok(colorDim.values.some((v) => v.label === "Starlight"), "Starlight color must exist");

    // Pricing checks: 24GB RAM > 16GB RAM, 1TB SSD > 512GB SSD
    const ram16 = ramDim.values.find((v) => v.label.includes("16GB"));
    const ram24 = ramDim.values.find((v) => v.label.includes("24GB"));
    assert.ok(ram16?.priceMinor && ram24?.priceMinor, "RAM options must have priceMinor");
    assert.equal(ram24.priceMinor - ram16.priceMinor, 20000, "24GB RAM must be exactly +$200 (20000 minor) over 16GB");

    const ssd512 = storageDim.values.find((v) => v.label.includes("512 GB"));
    const ssd1tb = storageDim.values.find((v) => v.label.includes("1 TB"));
    assert.ok(ssd512?.priceMinor && ssd1tb?.priceMinor, "Storage options must have priceMinor");
    assert.equal(ssd1tb.priceMinor - ssd512.priceMinor, 20000, "1TB SSD must be exactly +$200 (20000 minor) over 512GB");
  });

  test("9. Selecting higher configuration on MacBook calculates total price and budget exceed amount", async () => {
    const variantState = await retrieveProductVariants(
      "live-channel3-macbook-no-variants",
      {
        RAM: "24GB Unified Memory",
        Storage: "1 TB SSD",
        Color: "Midnight",
      },
      "USD",
      "https://bestbuy.com/macbook-air-m3"
    );

    assert.equal(variantState.status, "variants_found");
    // Base $1099 (109900) + RAM $200 (20000) + SSD $200 (20000) = $1499 (149900)
    assert.equal(variantState.verifiedPriceMinor, 149900, "Total price must be $1,499.00");
    assert.equal(variantState.effectiveSelected["RAM"], "24GB Unified Memory");
    assert.equal(variantState.effectiveSelected["Storage"], "1 TB SSD");
    assert.equal(variantState.effectiveSelected["Color"], "Midnight");

    // Over budget calculation against $1,200 (120000) ceiling
    const budgetMinor = 120000;
    const overBudgetAmount = variantState.verifiedPriceMinor - budgetMinor;
    assert.equal(overBudgetAmount, 29900, "Must calculate exact over budget amount (+$299.00)");

    // Matching retailer offer must be present in offers
    assert.ok(
      variantState.offers?.some(
        (o) => o.priceMinor === 149900 && o.currency === "USD" && Boolean(o.url)
      ),
      "Matching retailer offer at $1499 must exist in offers array"
    );
  });

  test("10. Multi-category support: Gaming chairs and coffee makers extract configuration options", async () => {
    // Gaming Chair
    const chairState = await retrieveProductVariants(
      "live-channel3-gaming-chair",
      undefined,
      "USD",
      "https://bestbuy.com/gaming-chair"
    );
    assert.equal(chairState.status, "variants_found");
    const matDim = chairState.options.find((o) => o.name.toLowerCase() === "material");
    const cfgDim = chairState.options.find((o) => o.name.toLowerCase() === "configuration");
    assert.ok(matDim, "Material dimension must exist for chair");
    assert.ok(cfgDim, "Configuration dimension must exist for chair");
    assert.ok(cfgDim.values.some((v) => v.label.includes("Footrest")), "Footrest option must exist");

    // Coffee Maker
    const coffeeState = await retrieveProductVariants(
      "live-channel3-coffee-maker",
      undefined,
      "USD",
      "https://target.com/coffee-maker"
    );
    assert.equal(coffeeState.status, "variants_found");
    const brewDim = coffeeState.options.find((o) => o.name.toLowerCase().includes("brew"));
    assert.ok(brewDim, "Brew Strength dimension must exist for coffee maker");
    assert.ok(brewDim.values.some((v) => v.label.includes("Bold")), "Bold brew must exist");
  });

  test("11. Component contract: ProductVariantConfigurator renders budget exceed amount in dropdown and header badge", () => {
    const componentPath = path.join(
      process.cwd(),
      "src/components/guided-shopping/ProductVariantConfigurator.tsx"
    );
    const content = fs.readFileSync(componentPath, "utf-8");

    // Dropdown over-budget amount display
    assert.ok(
      content.includes("Exceeds budget (+"),
      "Dropdown options must show exact over budget amount: Exceeds budget (+{formatCurrency(overBudgetAmount, currency)})"
    );

    // Header badge over-budget amount display
    assert.ok(
      content.includes("⚠️ Over Budget (+"),
      "Header badge must show exact over budget amount: ⚠️ Over Budget (+{formatCurrency(budgetDeltaMinor, currency)})"
    );
  });
});

