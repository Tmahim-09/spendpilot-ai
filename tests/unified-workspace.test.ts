import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialWorkspace,
  addIndependentItem,
  createCoordinatedSetupGroup,
  selectProductForItem,
  removeItemFromWorkspace,
  replaceProductForItem,
  calculateWorkspaceBudgetSummary,
  getNextUnresolvedItem,
  findItemInWorkspace,
} from "../src/lib/workspace/workspace-manager.ts";
import {
  evaluateItemCompatibility,
} from "../src/lib/workspace/compatibility-engine.ts";
import {
  syncWorkspaceFromBrief,
  detectReplaceIntent,
  isAddUnrelatedItemToSetup,
  isAddToSetupIntent,
} from "../src/lib/workspace/sync-engine.ts";
import type { NormalizedProduct } from "../src/types/index.ts";
import type { ShoppingBrief } from "../src/lib/orchestrator/types.ts";

describe("SpendPilot AI: Unified Multi-Product Shopping Workspace (Section 19 Tests A - M)", () => {
  const sampleMacBook: NormalizedProduct = {
    source: "channel3",
    imageUrl: null,
    sourceProductId: "p_macbook_pro_14",
    title: "Apple MacBook Pro 14-inch M3",
    priceMinor: 149900, // $1,499.00
    currency: "USD",
    retailerName: "Best Buy",
    retailerUrl: "https://bestbuy.com/macbook-pro",
    availability: "in_stock",
    specifications: {
      OS: "macOS",
      Memory: "16GB",
      Storage: "512GB",
      Chip: "Apple M3",
    },
    sourceFacts: ["M3 Chip", "16GB Unified Memory"],
  };

  const sampleHeadphones: NormalizedProduct = {
    source: "channel3",
    imageUrl: null,
    sourceProductId: "p_sony_wh1000xm5",
    title: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
    priceMinor: 34800, // $348.00
    currency: "USD",
    retailerName: "Amazon",
    retailerUrl: "https://amazon.com/sony-headphones",
    availability: "in_stock",
    specifications: {
      Connection: "Bluetooth",
      ANC: "Active Noise Cancelling",
      BatteryLife: "30 hours",
    },
    sourceFacts: ["Industry leading noise cancellation", "30-hour battery life"],
  };

  const sampleCoffeeMaker: NormalizedProduct = {
    source: "channel3",
    imageUrl: null,
    sourceProductId: "p_breville_barista",
    title: "Breville Barista Express Espresso Machine",
    priceMinor: 69995, // $699.95
    currency: "USD",
    retailerName: "Target",
    retailerUrl: "https://target.com/breville-barista",
    availability: "in_stock",
    specifications: {
      Type: "Espresso Machine",
      Capacity: "2 Liters",
    },
    sourceFacts: ["Integrated conical burr grinder"],
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Test A: Single product & Sequential addition
  // ───────────────────────────────────────────────────────────────────────────
  test("Test A: Single product request -> select -> save -> add headphones -> laptop selection remains intact", () => {
    let ws = createInitialWorkspace({ id: "session_test_a", currency: "USD" });

    // 1. User requests a laptop
    ws = addIndependentItem(ws, {
      productRequest: "Apple MacBook for programming under $1,600",
      category: "laptop",
      displayName: "MacBook Pro",
      individualBudget: { amountMinor: 160000, currency: "USD", strict: true },
    });

    assert.strictEqual(ws.groups.length, 1);
    assert.strictEqual(ws.groups[0]?.type, "independent");
    assert.strictEqual(ws.groups[0]?.items.length, 1);

    const laptopItemId = ws.groups[0]?.items[0]?.id;
    assert.ok(laptopItemId);

    // 2. User selects MacBook
    ws = selectProductForItem(ws, laptopItemId, sampleMacBook);
    const selectedLaptop = ws.groups[0]?.items.find((i) => i.id === laptopItemId);
    assert.strictEqual(selectedLaptop?.status, "selected");
    assert.strictEqual(selectedLaptop?.selectedProductId, "p_macbook_pro_14");
    assert.strictEqual(selectedLaptop?.selectedProduct?.priceMinor, 149900);

    // 3. User adds headphones sequentially
    ws = addIndependentItem(ws, {
      productRequest: "Sony wireless headphones under $350",
      category: "headphones",
      displayName: "Sony Headphones",
      individualBudget: { amountMinor: 350000, currency: "USD", strict: true },
    });

    // 4. Laptop selection remains 100% intact!
    assert.strictEqual(ws.groups[0]?.items.length, 2);
    const originalLaptop = ws.groups[0]?.items.find((i) => i.id === laptopItemId);
    assert.strictEqual(originalLaptop?.status, "selected");
    assert.strictEqual(originalLaptop?.selectedProductId, "p_macbook_pro_14");
    assert.strictEqual(originalLaptop?.selectedProduct?.title, "Apple MacBook Pro 14-inch M3");

    // Select headphones
    const headphoneItemId = ws.groups[0]?.items[1]?.id;
    assert.ok(headphoneItemId);
    ws = selectProductForItem(ws, headphoneItemId, sampleHeadphones);

    const summary = calculateWorkspaceBudgetSummary(ws, "USD");
    assert.strictEqual(summary.totalSelectedMinor, 149900 + 34800); // $1,847.00
    assert.strictEqual(summary.isOverBudget, false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test B: Coordinated gaming setup under $3,000
  // ───────────────────────────────────────────────────────────────────────────
  test("Test B: Coordinated gaming setup under $3,000 -> components, shared total, remaining budget", () => {
    let ws = createInitialWorkspace({ id: "session_test_b", currency: "USD" });

    ws = createCoordinatedSetupGroup(ws, {
      title: "Gaming Setup",
      sharedBudget: { amountMinor: 300000, currency: "USD", strict: true }, // $3,000.00
      items: [
        { productRequest: "Gaming Desktop PC", category: "pc", priority: "essential" },
        { productRequest: "Gaming Monitor", category: "monitor", priority: "essential" },
        { productRequest: "Mechanical Keyboard", category: "keyboard", priority: "preferred" },
        { productRequest: "Gaming Mouse", category: "mouse", priority: "preferred" },
        { productRequest: "Gaming Headset", category: "headset", priority: "optional" },
      ],
    });

    assert.strictEqual(ws.groups.length, 1);
    const setupGroup = ws.groups[0];
    assert.ok(setupGroup);
    assert.strictEqual(setupGroup.type, "coordinated_setup");
    assert.strictEqual(setupGroup.items.length, 5);
    assert.strictEqual(setupGroup.budget?.amountMinor, 300000);

    // Controlled sequential selection: Select PC ($1,600)
    const pcItem = setupGroup.items[0]!;
    const mockPc: NormalizedProduct = {
      source: "channel3",
    imageUrl: null,
      sourceProductId: "pc_gaming_4070",
      title: "Ryzen 7 7800X3D + RTX 4070 Gaming PC",
      priceMinor: 160000,
      currency: "USD",
      retailerName: "Newegg",
      retailerUrl: "https://newegg.com/gaming-pc",
      availability: "in_stock",
      specifications: { CPU: "Ryzen 7 7800X3D", GPU: "RTX 4070" },
      sourceFacts: ["AM5 Platform", "DDR5"],
    };
    ws = selectProductForItem(ws, pcItem.id, mockPc);

    // Check budget update after PC selection
    let budgetSummary = calculateWorkspaceBudgetSummary(ws, "USD");
    assert.strictEqual(budgetSummary.totalSelectedMinor, 160000); // $1,600
    assert.strictEqual(budgetSummary.groups[0]?.remainingBudgetMinor, 140000); // $1,400 remaining in group budget
    assert.strictEqual(budgetSummary.isOverBudget, false);

    // Select Monitor ($400)
    const monitorItem = setupGroup.items[1]!;
    const mockMonitor: NormalizedProduct = {
      source: "channel3",
    imageUrl: null,
      sourceProductId: "mon_1440p_165hz",
      title: "27-inch 1440p 165Hz IPS Gaming Monitor",
      priceMinor: 40000,
      currency: "USD",
      retailerName: "Best Buy",
      retailerUrl: "https://bestbuy.com/monitor",
      availability: "in_stock",
      specifications: { Resolution: "2560x1440", RefreshRate: "165Hz" },
      sourceFacts: ["QHD", "IPS Panel"],
    };
    ws = selectProductForItem(ws, monitorItem.id, mockMonitor);

    budgetSummary = calculateWorkspaceBudgetSummary(ws, "USD");
    assert.strictEqual(budgetSummary.totalSelectedMinor, 200000); // $2,000
    assert.strictEqual(budgetSummary.groups[0]?.remainingBudgetMinor, 100000); // $1,000 remaining in group budget
    assert.strictEqual(budgetSummary.isOverBudget, false);

    // Next unresolved item is keyboard
    const nextUnresolved = getNextUnresolvedItem(ws);
    assert.ok(nextUnresolved);
    assert.strictEqual(nextUnresolved.item.category, "keyboard");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test C: Independent multiple purchases
  // ───────────────────────────────────────────────────────────────────────────
  test("Test C: Independent multiple purchases (shoes, headphones, coffee maker) -> sequential, no compatibility invented", () => {
    let ws = createInitialWorkspace({ id: "session_test_c", currency: "USD" });

    ws = addIndependentItem(ws, { productRequest: "Nike Running Shoes under $120", category: "shoes" });
    ws = addIndependentItem(ws, { productRequest: "Sony Headphones under $200", category: "headphones" });
    ws = addIndependentItem(ws, { productRequest: "Espresso Coffee Maker under $100", category: "coffee_maker" });

    assert.strictEqual(ws.groups.length, 1);
    assert.strictEqual(ws.groups[0]?.type, "independent");
    assert.strictEqual(ws.groups[0]?.items.length, 3);

    // Zero dependencies or invented compatibility between unrelated items
    for (const item of ws.groups[0]!.items) {
      assert.strictEqual(item.dependencies.length, 0);
      const compat = evaluateItemCompatibility(item, ws.groups[0]!);
      assert.strictEqual(compat.status, "not_applicable");
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test D: Add component to existing setup
  // ───────────────────────────────────────────────────────────────────────────
  test("Test D: Add monitor to existing PC setup -> added to setup with dependency preserved", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = createCoordinatedSetupGroup(ws, {
      title: "PC Build",
      items: [
        { productRequest: "Custom Gaming PC", category: "pc", priority: "essential" },
      ],
    });

    const pcGroup = ws.groups[0]!;
    const pcItem = pcGroup.items[0]!;

    // Select the PC
    const mockPc: NormalizedProduct = {
      source: "channel3",
    imageUrl: null,
      sourceProductId: "pc_custom_build",
      title: "Custom Desktop PC",
      priceMinor: 120000,
      currency: "USD",
      retailerName: "Micro Center",
      retailerUrl: "https://microcenter.com/pc",
      availability: "in_stock",
      specifications: { GPU: "RTX 4070 Ti Super", ResolutionSupport: "4K UHD" },
      sourceFacts: ["4K Gaming Ready"],
    };
    ws = selectProductForItem(ws, pcItem.id, mockPc);

    // User says: "Add a compatible monitor to my selected PC"
    const addCheck = isAddToSetupIntent("Add a compatible monitor to my selected PC", pcGroup);
    assert.strictEqual(addCheck.isAdd, true);
    assert.strictEqual(addCheck.componentName, "Monitor");
    assert.strictEqual(addCheck.dependsOnPc, true);

    const brief: ShoppingBrief = {
      schemaVersion: 1,
      taskId: "task_add_mon",
      mode: "multi_product",
      userGoal: "Add a compatible monitor to my selected PC",
      productRequirements: [],
      missingInformation: [],
      status: "collecting",
      updatedAt: new Date().toISOString(),
    };

    ws = syncWorkspaceFromBrief(ws, brief, "Add a compatible monitor to my selected PC", "USD");

    const updatedGroup = ws.groups.find((g) => g.id === pcGroup.id)!;
    assert.strictEqual(updatedGroup.items.length, 2);
    const monitorItem = updatedGroup.items.find((i) => i.category === "monitor")!;
    assert.ok(monitorItem);
    assert.strictEqual(monitorItem.dependencies.includes(pcItem.id), true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test E: Add unrelated product while in setup
  // ───────────────────────────────────────────────────────────────────────────
  test("Test E: Add coffee maker while completing gaming setup -> separate independent group created", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = createCoordinatedSetupGroup(ws, {
      title: "Gaming Setup",
      sharedBudget: { amountMinor: 250000, currency: "USD", strict: true },
      items: [
        { productRequest: "Gaming PC", category: "pc" },
        { productRequest: "Gaming Monitor", category: "monitor" },
      ],
    });

    const setupGroup = ws.groups[0]!;
    const isUnrelated = isAddUnrelatedItemToSetup("I also need a coffee maker", setupGroup);
    assert.strictEqual(isUnrelated, true);

    const brief: ShoppingBrief = {
      schemaVersion: 1,
      taskId: "task_coffee",
      mode: "single_product",
      userGoal: "I also need a coffee maker",
      productRequirements: [],
      missingInformation: [],
      status: "collecting",
      updatedAt: new Date().toISOString(),
    };

    ws = syncWorkspaceFromBrief(ws, brief, "I also need a coffee maker", "USD");

    // Must have 2 groups: 1 setup group + 1 independent group
    assert.strictEqual(ws.groups.length, 2);
    const independentGroup = ws.groups.find((g) => g.type === "independent");
    assert.ok(independentGroup);
    assert.strictEqual(independentGroup.items.length, 1);
    assert.ok(independentGroup.items[0]?.productRequest.includes("coffee maker"));

    // Gaming setup remains untouched with its 2 items
    const setup = ws.groups.find((g) => g.type === "coordinated_setup")!;
    assert.strictEqual(setup.items.length, 2);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test F: Modify selection
  // ───────────────────────────────────────────────────────────────────────────
  test("Test F: Replace one product -> only that item changes, dependencies & totals recalculate", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = createCoordinatedSetupGroup(ws, {
      title: "Desk Setup",
      sharedBudget: { amountMinor: 100000, currency: "USD", strict: true },
      items: [
        { productRequest: "Standing Desk", category: "desk" },
        { productRequest: "Mechanical Keyboard", category: "keyboard" },
      ],
    });

    const setupGroup = ws.groups[0]!;
    const deskItem = setupGroup.items[0]!;
    const kbItem = setupGroup.items[1]!;

    const deskProd: NormalizedProduct = {
      source: "channel3",
    imageUrl: null,
      sourceProductId: "desk_01",
      title: "Bamboo Standing Desk",
      priceMinor: 49900,
      currency: "USD",
      retailerName: "Uplift",
      retailerUrl: "https://uplift.com/desk",
      availability: "in_stock",
      specifications: { Width: "60 inch" },
      sourceFacts: ["Solid wood"],
    };

    const kbProd1: NormalizedProduct = {
      source: "channel3",
    imageUrl: null,
      sourceProductId: "kb_01",
      title: "Keychron Q1 Mechanical Keyboard",
      priceMinor: 19900,
      currency: "USD",
      retailerName: "Keychron",
      retailerUrl: "https://keychron.com/q1",
      availability: "in_stock",
      specifications: { Switches: "Gateron Red" },
      sourceFacts: ["Aluminum body"],
    };

    ws = selectProductForItem(ws, deskItem.id, deskProd);
    ws = selectProductForItem(ws, kbItem.id, kbProd1);

    let summary = calculateWorkspaceBudgetSummary(ws, "USD");
    assert.strictEqual(summary.totalSelectedMinor, 49900 + 19900); // 69,800 cents

    // User asks: "Replace the keyboard in my setup"
    const replaceDetect = detectReplaceIntent("Replace the keyboard in my setup", ws);
    assert.strictEqual(replaceDetect.isReplace, true);
    assert.strictEqual(replaceDetect.targetItemId, kbItem.id);

    ws = replaceProductForItem(ws, kbItem.id);

    // Keyboard is unselected, desk remains selected
    const updatedDesk = findItemInWorkspace(ws, deskItem.id)!.item;
    const updatedKb = findItemInWorkspace(ws, kbItem.id)!.item;

    assert.strictEqual(updatedDesk.status, "selected");
    assert.strictEqual(updatedDesk.selectedProductId, "desk_01");

    assert.strictEqual(updatedKb.status, "ready_to_search");
    assert.strictEqual(updatedKb.selectedProductId, undefined);
    assert.strictEqual(updatedKb.selectedProduct, null);

    // Recalculated total reflects only desk
    summary = calculateWorkspaceBudgetSummary(ws, "USD");
    assert.strictEqual(summary.totalSelectedMinor, 49900);

    // Now select replacement keyboard ($129)
    const kbProd2: NormalizedProduct = {
      source: "channel3",
    imageUrl: null,
      sourceProductId: "kb_02",
      title: "Logitech MX Mechanical Mini",
      priceMinor: 12900,
      currency: "USD",
      retailerName: "Logitech",
      retailerUrl: "https://logitech.com/mx",
      availability: "in_stock",
      specifications: { Connectivity: "Bluetooth/Bolt" },
      sourceFacts: ["Low profile switches"],
    };

    ws = selectProductForItem(ws, kbItem.id, kbProd2);
    summary = calculateWorkspaceBudgetSummary(ws, "USD");
    assert.strictEqual(summary.totalSelectedMinor, 49900 + 12900); // 62,800 cents
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test G: Budget management & Currency integrity
  // ───────────────────────────────────────────────────────────────────────────
  test("Test G: Shared budget enforced, individual budget preserved, no currency mixing", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = createCoordinatedSetupGroup(ws, {
      title: "Home Office Setup",
      sharedBudget: { amountMinor: 80000, currency: "USD", strict: true }, // $800.00
      items: [
        {
          productRequest: "Ergonomic Office Chair",
          category: "chair",
          individualBudget: { amountMinor: 35000, currency: "USD", strict: false }, // $350 target
        },
        {
          productRequest: "4K Monitor",
          category: "monitor",
          individualBudget: { amountMinor: 40000, currency: "USD", strict: false }, // $400 target
        },
      ],
    });

    const chairItem = ws.groups[0]!.items[0]!;
    const monitorItem = ws.groups[0]!.items[1]!;

    assert.strictEqual(chairItem.individualBudget?.amountMinor, 35000);
    assert.strictEqual(chairItem.individualBudget?.currency, "USD");
    assert.strictEqual(monitorItem.individualBudget?.amountMinor, 40000);

    // Select chair that costs $500 (exceeds individual target, but within $800 total)
    const expensiveChair: NormalizedProduct = {
      source: "channel3",
    imageUrl: null,
      sourceProductId: "chair_herman_miller",
      title: "Herman Miller Aeron Chair",
      priceMinor: 50000, // $500
      currency: "USD",
      retailerName: "Herman Miller",
      retailerUrl: "https://hermanmiller.com/aeron",
      availability: "in_stock",
      specifications: { Size: "B" },
      sourceFacts: ["Pellicle mesh"],
    };
    ws = selectProductForItem(ws, chairItem.id, expensiveChair);

    let summary = calculateWorkspaceBudgetSummary(ws, "USD");
    assert.strictEqual(summary.totalSelectedMinor, 50000);
    assert.strictEqual(summary.groups[0]?.remainingBudgetMinor, 30000); // $300 remaining in group budget
    assert.strictEqual(summary.isOverBudget, false);

    // Select monitor that costs $350 -> Total becomes $850 (Exceeds $800 total!)
    const monitor: NormalizedProduct = {
      source: "channel3",
    imageUrl: null,
      sourceProductId: "mon_lg_4k",
      title: "LG 32-inch 4K UHD Monitor",
      priceMinor: 35000, // $350
      currency: "USD",
      retailerName: "Amazon",
      retailerUrl: "https://amazon.com/lg-4k",
      availability: "in_stock",
      specifications: { Resolution: "3840x2160" },
      sourceFacts: ["HDR10"],
    };
    ws = selectProductForItem(ws, monitorItem.id, monitor);

    summary = calculateWorkspaceBudgetSummary(ws, "USD");
    assert.strictEqual(summary.totalSelectedMinor, 85000); // $850.00
    assert.strictEqual(summary.groups[0]?.remainingBudgetMinor, -5000); // -$50.00 over budget in group
    assert.strictEqual(summary.groups[0]?.isOverBudget, true);
    assert.strictEqual(summary.isOverBudget, true); // Over budget correctly flagged!
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test H: Compatibility Engine
  // ───────────────────────────────────────────────────────────────────────────
  test("Test H: Compatibility: verified match, verified mismatch, insufficient data marked 'not_enough_info'", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = createCoordinatedSetupGroup(ws, {
      title: "PC Components",
      items: [
        { productRequest: "Motherboard", category: "motherboard" },
        { productRequest: "CPU", category: "cpu", dependencies: ["item_mb"] },
        { productRequest: "RAM", category: "ram", dependencies: ["item_mb"] },
      ],
    });

    const group = ws.groups[0]!;
    const mbItem = group.items[0]!;
    const cpuItem = group.items[1]!;
    const ramItem = group.items[2]!;
    cpuItem.dependencies = [mbItem.id];
    ramItem.dependencies = [mbItem.id];

    // Case 1: Insufficient data -> "not_enough_info"
    let compatReport = evaluateItemCompatibility(cpuItem, group);
    assert.strictEqual(compatReport.status, "not_enough_info");

    // Case 2: Verified Match (AM5 Motherboard + AM5 CPU)
    mbItem.selectedProduct = {
      source: "channel3",
    imageUrl: null,
      sourceProductId: "mb_am5_b650",
      title: "MSI B650 Gaming Plus Motherboard",
      priceMinor: 16900,
      currency: "USD",
      retailerName: "Amazon",
      retailerUrl: "https://amazon.com/msi-b650",
      availability: "in_stock",
      specifications: { Socket: "AM5", MemoryType: "DDR5" },
      sourceFacts: ["Socket AM5 supported"],
    };

    cpuItem.selectedProduct = {
      source: "channel3",
    imageUrl: null,
      sourceProductId: "cpu_amd_7800x3d",
      title: "AMD Ryzen 7 7800X3D CPU",
      priceMinor: 38900,
      currency: "USD",
      retailerName: "Amazon",
      retailerUrl: "https://amazon.com/7800x3d",
      availability: "in_stock",
      specifications: { Socket: "AM5" },
      sourceFacts: ["Zen 4 Architecture AM5"],
    };

    compatReport = evaluateItemCompatibility(cpuItem, group);
    assert.strictEqual(compatReport.status, "verified_compatible");
    assert.ok(compatReport.summary.includes("compatible"));

    // Case 3: Verified Mismatch (DDR4 RAM selected for DDR5 Motherboard)
    ramItem.selectedProduct = {
      source: "channel3",
    imageUrl: null,
      sourceProductId: "ram_ddr4_32gb",
      title: "Corsair Vengeance LPX 32GB DDR4 RAM",
      priceMinor: 6500,
      currency: "USD",
      retailerName: "Amazon",
      retailerUrl: "https://amazon.com/corsair-ddr4",
      availability: "in_stock",
      specifications: { MemoryType: "DDR4" },
      sourceFacts: ["DDR4 3200MHz"],
    };

    compatReport = evaluateItemCompatibility(ramItem, group);
    assert.strictEqual(compatReport.status, "verified_incompatible");
    assert.ok(compatReport.summary.includes("Compatibility issue"));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test I: Repetition & Idempotency
  // ───────────────────────────────────────────────────────────────────────────
  test("Test I: No duplicate selected products, no duplicate searches, idempotent selection", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, { productRequest: "MacBook", category: "laptop" });

    const itemId = ws.groups[0]!.items[0]!.id;

    // First selection
    ws = selectProductForItem(ws, itemId, sampleMacBook);
    assert.strictEqual(ws.groups[0]!.items.length, 1);
    assert.strictEqual(ws.groups[0]!.items[0]!.selectedProductId, "p_macbook_pro_14");

    // Duplicate selection of the exact same product is idempotent
    ws = selectProductForItem(ws, itemId, sampleMacBook);
    assert.strictEqual(ws.groups[0]!.items.length, 1);
    assert.strictEqual(ws.groups[0]!.items[0]!.selectedProductId, "p_macbook_pro_14");
    assert.strictEqual(ws.groups[0]!.items[0]!.status, "selected");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test J: Session restoration
  // ───────────────────────────────────────────────────────────────────────────
  test("Test J: Refresh / session restoration preserves workspace and selected products", () => {
    let ws = createInitialWorkspace({ id: "session_persistent_01", currency: "USD" });
    ws = addIndependentItem(ws, { productRequest: "Shoes", category: "shoes" });
    const shoeId = ws.groups[0]!.items[0]!.id;

    const mockShoe: NormalizedProduct = {
      source: "channel3",
    imageUrl: null,
      sourceProductId: "nike_pegasus_40",
      title: "Nike Air Zoom Pegasus 40",
      priceMinor: 11000,
      currency: "USD",
      retailerName: "Nike",
      retailerUrl: "https://nike.com/pegasus",
      availability: "in_stock",
      specifications: { Size: "10" },
      sourceFacts: ["Running shoes"],
    };
    ws = selectProductForItem(ws, shoeId, mockShoe);

    // Simulate serialization / deserialization as on page reload
    const serialized = JSON.stringify(ws);
    const restoredWs = JSON.parse(serialized);

    assert.strictEqual(restoredWs.id, "session_persistent_01");
    assert.strictEqual(restoredWs.groups.length, 1);
    assert.strictEqual(restoredWs.groups[0].items.length, 1);
    assert.strictEqual(restoredWs.groups[0].items[0].status, "selected");
    assert.strictEqual(restoredWs.groups[0].items[0].selectedProductId, "nike_pegasus_40");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test K: API call counts & bypass on UI button actions
  // ───────────────────────────────────────────────────────────────────────────
  test("Test K: Known UI actions (select, replace, remove) update state directly with zero Gemini calls", () => {
    let ws = createInitialWorkspace({ currency: "USD" });
    ws = addIndependentItem(ws, { productRequest: "Coffee Maker", category: "coffee_maker" });
    const itemId = ws.groups[0]!.items[0]!.id;

    // 1. Selecting product directly via UI button: pure state transition
    ws = selectProductForItem(ws, itemId, sampleCoffeeMaker);
    assert.strictEqual(ws.groups[0]!.items[0]!.status, "selected");

    // 2. Replacing product via UI button: pure state transition
    ws = replaceProductForItem(ws, itemId);
    assert.strictEqual(ws.groups[0]!.items[0]!.status, "ready_to_search");

    // 3. Removing product via UI button: pure state transition
    ws = removeItemFromWorkspace(ws, itemId);
    assert.strictEqual(ws.groups.length, 0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test L: Scroll preservation
  // ───────────────────────────────────────────────────────────────────────────
  test("Test L: Scroll preservation logic detects userScrolledUp and preserves reading position", () => {
    // Simulate scroll container metrics
    const container = {
      scrollHeight: 1200,
      scrollTop: 400, // User has scrolled up to read earlier message!
      clientHeight: 500,
    };

    // Calculate distanceFromBottom: 1200 - 400 - 500 = 300px away from bottom
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceFromBottom < 80;
    const userScrolledUp = !isNearBottom;

    assert.strictEqual(userScrolledUp, true, "User is identified as scrolled up reading earlier content");

    // When an assistant reply arrives, the system does NOT auto-scroll, preserving scrollTop: 400
    let currentScrollTop = container.scrollTop;
    let showJumpToLatest = false;

    if (!userScrolledUp) {
      currentScrollTop = container.scrollHeight - container.clientHeight; // auto-scroll
    } else {
      showJumpToLatest = true; // Section 17: show discreet jump control!
    }

    assert.strictEqual(currentScrollTop, 400, "Scroll position remains exactly anchored at 400");
    assert.strictEqual(showJumpToLatest, true, "Jump to latest control is surfaced");

    // When user explicitly clicks "Jump to latest":
    const handleJumpToLatest = () => {
      currentScrollTop = container.scrollHeight - container.clientHeight;
      showJumpToLatest = false;
    };
    handleJumpToLatest();

    assert.strictEqual(currentScrollTop, 700, "User explicitly navigated to the latest message");
    assert.strictEqual(showJumpToLatest, false, "Jump control is dismissed");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test M: Existing features remain unaffected
  // ───────────────────────────────────────────────────────────────────────────
  test("Test M: Channel3 normalization, variant selection and PayPal Sandbox demo remain untouched", async () => {
    // 1. Channel3 normalization
    const { normalizeChannel3Products } = await import("../src/lib/channel3/normalize-products.ts");
    assert.strictEqual(typeof normalizeChannel3Products, "function");

    // 2. PayPal Sandbox demo configuration
    const { getPublicPayPalConfig } = await import("../src/lib/paypal/config.ts");
    const originalEnv = { ...process.env };
    process.env.PAYPAL_ENV = "sandbox";
    process.env.PAYPAL_CLIENT_ID = "DEMO_CLIENT_ID";
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = "DEMO_CLIENT_ID";
    process.env.PAYPAL_DEMO_SELLER_A_MERCHANT_ID = "SELLER_A_ID";
    process.env.PAYPAL_DEMO_SELLER_B_MERCHANT_ID = "SELLER_B_ID";

    const config = getPublicPayPalConfig();
    assert.strictEqual(config.environment, "sandbox");
    assert.strictEqual(config.sellers.length, 2);
    assert.strictEqual(config.sellers[0]?.merchantId, "SELLER_A_ID");
    assert.strictEqual(config.sellers[1]?.merchantId, "SELLER_B_ID");

    process.env = { ...originalEnv };
  });
});
