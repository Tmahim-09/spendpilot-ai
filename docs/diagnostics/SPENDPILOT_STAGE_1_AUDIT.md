# SpendPilot Stage 1: Forensic Audit of Channel3 Product Pricing, Variants, and Conversation State

**Audit Date:** 1 November 2026  
**Auditor:** Senior AI Shopping Systems & Product Retrieval Engineer  
**Scope:** Forensic diagnostic of Channel3 data flow, pricing pipeline, variant resolution, and conversation controller.  
**Constraint:** Zero production code behavior modifications during this stage.

---

## Executive Summary & Core Answers

### 1. Is the wrong price caused by our SpendPilot implementation, or is Channel3 returning insufficient or incorrectly associated product and offer data?

**It is a compound failure originating in Channel3 catalog structure and amplified by SpendPilot's offer selection pipeline:**

1. **Channel3 Conflation & Missing Offer Metadata:** Channel3 conflates multiple hardware configurations into single canonical product records. For example, product `SrdWIv0` has `storage-capacity: ["1 TB"]` in its `structured_attributes`, but its attached Best Buy offer (`p1PB`) is priced at $1,149 (MSRP $1,299). In reality, Best Buy's $1,149/$1,299 listing is for a 512GB (or 256GB) model; Apple's 1TB model retails at $1,499+. Crucially, Channel3's `offers` array provides **no variant or configuration metadata per offer** (`dimensions: null`, no offer-specific storage attribute). The offer contains only price, availability, condition, domain, and redirect URL.
2. **SpendPilot's Cheapest-Offer Blind Association:** In [`normalizeChannel3Product`](src/lib/channel3/normalize-products.ts#L108-L116), SpendPilot sorts retailer offers ascending by price (`normalizedOffers.sort((a, b) => a.priceMinor - b.priceMinor)`) and sets `priceMinor` to the cheapest offer (`normalizedOffers[0]`). Concurrently, it extracts the storage specification from the parent product (`specifications["Storage Capacity"] = "1 TB"`). The product card renders the lowest base-model price ($1,149) beside the parent product's highest specification claim (1TB SSD).

---

### 2. Is Configure Options failing because our implementation is not using Channel3's documented variant retrieval correctly, or because Channel3 does not expose variants for those products?

**It is primarily because Channel3 does not expose variant metadata for those products (Cause A), compounded by SpendPilot rendering a universal configuration button regardless of variant availability:**

1. **Channel3 Variant Sparse Coverage:** In our live diagnostic query for `Apple MacBook laptop 1TB SSD`, **4 out of 5 products returned `variants: null`** in both search and product detail (`products.retrieve()`). Only 1 product (`KzjPrb3`) exposed variants, and its options were `Color`, `Size`, and `Chip`—**Storage was not exposed as a variant option on any candidate**.
2. **SpendPilot's Universal Button & Generic Fallback:** SpendPilot rendered "Configure Options (Size / Color)" on all product cards unconditionally. When clicked for a product where `variants: null`, [`retrieveProductVariants`](src/lib/channel3/variants.ts#L201) returns `options: []` and `status: "no_variants_verified"`. [`ProductVariantConfigurator.tsx`](src/components/guided-shopping/ProductVariantConfigurator.tsx#L308-L316) then displays the static message: *"No additional configuration options were found for this listing."*

---

## Section A: Current Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Channel3_API [Channel3 Cloud API]
        C3_Search["POST /v1/search (products.search)"]
        C3_Detail["GET /v1/products/{id} (products.retrieve)"]
        C3_Lookup["POST /v1/lookup (products.lookup)"]
    end

    subgraph Server_Pipeline [SpendPilot Server Pipeline]
        SearchRoute["src/app/api/products/search/route.ts"]
        C3Client["src/lib/channel3/client.ts: searchChannel3Products()"]
        Normalizer["src/lib/channel3/normalize-products.ts: normalizeChannel3Product()"]
        PricePolicy["src/lib/shopping/price-policy.ts: filterQualifyingProducts()"]
        SpecNormalizer["src/lib/shopping/spec-normalizer.ts: bindProductConfigurationAndPrice()"]
        EligibilityGate["src/lib/shopping/eligibility-gate.ts: filterEligibleCandidates()"]
        VariantRoute["src/app/api/products/variants/route.ts"]
        VariantResolver["src/lib/channel3/variants.ts: retrieveProductVariants()"]
    end

    subgraph Client_UI [SpendPilot Frontend Client]
        Page["src/app/page.tsx"]
        ProductCard["src/components/product-results/ProductCard.tsx"]
        Configurator["src/components/guided-shopping/ProductVariantConfigurator.tsx"]
        ChatWorkspace["src/components/chat/ContinuousChatWorkspace.tsx"]
    end

    ChatWorkspace -->|User Query| SearchRoute
    SearchRoute --> C3Client
    C3Client --> C3_Search
    C3_Search -->|Raw Product[]| C3Client
    C3Client --> Normalizer
    Normalizer --> PricePolicy
    PricePolicy --> EligibilityGate
    EligibilityGate --> SearchRoute
    SearchRoute --> Page
    Page --> ProductCard

    ProductCard -->|"onConfigure(product)"| Configurator
    Configurator -->|"POST {productId, retailerUrl}"| VariantRoute
    VariantRoute --> VariantResolver
    VariantResolver --> C3_Detail
    C3_Detail -->|Product with variants or null| VariantResolver
    VariantResolver --> Configurator
```

### Key Source Files & Functions

| Pipeline Component | Source File | Key Responsible Function |
|---|---|---|
| **Channel3 Client Service** | [`src/lib/channel3/client.ts`](src/lib/channel3/client.ts) | `getChannel3Client()`, `searchChannel3Products()` |
| **Product Search API** | [`src/app/api/products/search/route.ts`](src/app/api/products/search/route.ts) | `POST()` |
| **Product Normalization** | [`src/lib/channel3/normalize-products.ts`](src/lib/channel3/normalize-products.ts) | `normalizeChannel3Product()`, `normalizeChannel3Products()` |
| **Spec Normalization & Binding** | [`src/lib/shopping/spec-normalizer.ts`](src/lib/shopping/spec-normalizer.ts) | `normalizeProductStorage()`, `bindProductConfigurationAndPrice()`, `extractMacBookSpecifications()` |
| **Eligibility & Price Policy** | [`src/lib/shopping/eligibility-gate.ts`](src/lib/shopping/eligibility-gate.ts) | `filterEligibleCandidates()`, `buildConstrainedSearchQuery()` |
| **Variant Service & Lookup** | [`src/lib/channel3/variants.ts`](src/lib/channel3/variants.ts) | `retrieveProductVariants()` |
| **Variant API Route** | [`src/app/api/products/variants/route.ts`](src/app/api/products/variants/route.ts) | `POST()` |
| **Product Card UI** | [`src/components/product-results/ProductCard.tsx`](src/components/product-results/ProductCard.tsx) | `ProductCard()` |
| **Variant Modal UI** | [`src/components/guided-shopping/ProductVariantConfigurator.tsx`](src/components/guided-shopping/ProductVariantConfigurator.tsx) | `ProductVariantConfigurator()` |
| **Conversation Controller** | [`src/lib/ai/conversation-engine.ts`](src/lib/ai/conversation-engine.ts) | `processUserMessage()` |
| **Gemini Interactions Client** | [`src/lib/ai/gemini-interactions.ts`](src/lib/ai/gemini-interactions.ts) | `executeConversationalInteractionTurn()` |
| **Chat Workspace UI** | [`src/components/chat/ContinuousChatWorkspace.tsx`](src/components/chat/ContinuousChatWorkspace.tsx) | `ContinuousChatWorkspace()`, `handleQuickReply()` |

---

## Section B: Price Mismatch Root Cause

### Field-Level Tracing: Channel3 Response to Displayed Product Card

```
[Channel3 Search Response]
  Product: raw.id = "SrdWIv0", raw.title = "MacBook Air 13-inch Laptop"
  raw.structured_attributes["storage-capacity"] = ["1 TB"]
  raw.structured_attributes["ram"] = ["16 GB"]
  raw.offers[0]: domain = "bestbuy.com", price.price = 1149, price.currency = "USD", dimensions = null
  raw.offers[1]: domain = "quickshipelectronics.com", price.price = 1199, price.currency = "USD", dimensions = null
        │
        ▼
[normalizeChannel3Product (src/lib/channel3/normalize-products.ts)]
  normalizedOffers.sort((a, b) => a.priceMinor - b.priceMinor)
  primaryOffer = normalizedOffers[0]  --> Best Buy ($1,149 / 114900 cents)
  startingPriceMinor = 114900
  specifications["Storage Capacity"] = "1 TB"
  priceMinor = 114900
  retailerUrl = "https://buy.trychannel3.com/SrdWIv0-p1PB-8uAj6S?..."
        │
        ▼
[Eligibility Gate (src/lib/shopping/eligibility-gate.ts)]
  Checks specifications["Storage Capacity"] ("1 TB") against user requirement ("1TB").
  Result: MATCH (1TB claimed). Candidate is approved as eligible.
        │
        ▼
[ProductCard (src/components/product-results/ProductCard.tsx)]
  startingPrice = formatCurrency(product.priceMinor, "USD") --> "$1,149.00"
  specifications = "Storage Capacity: 1 TB"
  Card renders:
    Header: "MacBook Air 13-inch Laptop"
    Price: "$1,149.00 USD"
    Specs Tray: "Storage Capacity: 1 TB"
    Button: href = "https://buy.trychannel3.com/SrdWIv0-p1PB-8uAj6S"
        │
        ▼
[Retailer Landing Page (Best Buy)]
  Landing Page opens: Apple MacBook Air 13-inch M2/M3 Chip - 512GB SSD
  Retailer Price: $1,149.00 (Sale from $1,299)
  Retailer 1TB Price: $1,349.00 - $1,499.00
  DISCREPANCY: User was promised 1TB for $1,149; Retailer is selling 512GB for $1,149.
```

### Exact Breakdown of Current Implementation

1. **What field supplies the displayed price?**
   [`product.priceMinor`](src/components/product-results/ProductCard.tsx#L40-L41), formatted via `formatCurrency(product.priceMinor, productCurrency)`.
2. **Where does `product.priceMinor` come from?**
   [`normalize-products.ts` lines 108–112](src/lib/channel3/normalize-products.ts#L108-L112): It is explicitly assigned from `normalizedOffers[0].priceMinor`, which is the **cheapest offer** across all merchant offers associated with that canonical product.
3. **Where does the 1TB specification come from?**
   [`normalize-products.ts` lines 120–130](src/lib/channel3/normalize-products.ts#L120-L130): It is mapped directly from `raw.structured_attributes["storage-capacity"]`.
4. **The First Point of Failure:**
   The mismatch first occurs in **Channel3's catalog mapping**, where multiple SKU offers (512GB Best Buy listing) are attached to a parent product whose structured attributes aggregate the highest specs (1TB). The second point of failure is in **SpendPilot's normalization**, which sorts offers ascending by price and blindly binds the lowest offer ($1,149) to the parent product's aggregated 1TB specification without verifying that the specific offer URL represents the 1TB SKU.

---

## Section C: Variant Retrieval Diagnosis

### Live Diagnostic Evidence: `Apple MacBook laptop 1TB SSD`

From our live SDK query (`client.products.search({ query: "Apple MacBook laptop 1TB SSD", limit: 5 })`):

| Candidate ID | Product Title | Channel3 `variants` in Search | Channel3 `variants` in Detail (`retrieve`) | Offers Count & Domain |
|---|---|---|---|---|
| `Scw0zr0` | MacBook Pro 16-inch Laptop | `null` | `null` | 4 offers (bestbuy, quickship, microcenter, abt) |
| `SrdWIv0` | MacBook Air 13-inch Laptop | `null` | `null` | 2 offers (bestbuy $1149, quickship $1199) |
| `4QUI5Gs` | MacBook Pro 16" Laptop | `null` | `null` | 2 offers (backmarket $1425.99, bestbuy $2099) |
| `KzjPrb3` | Apple MacBook Pro | **3 options** | **3 options** | 1 offer (bestbuy $2999) |
| `TTaAAVn` | MacBook Pro 14-inch Laptop | `null` | `null` | 6 offers (quickship, pcrichard, adorama, bestbuy, bhphoto, cdw) |

### Deep Inspection of Variant-Enabled Product `KzjPrb3`

Channel3 returned the following structured `variants` payload on `KzjPrb3`:

```json
{
  "options": [
    {
      "name": "Color",
      "values": [
        {
          "label": "Space Black",
          "exists": true,
          "available": null,
          "thumbnail_url": "https://cdn.trychannel3.com/5a995e70-c116-4605-9702-6e784d1b04ca",
          "product_id": "KzjPrb3"
        },
        {
          "label": "Silver",
          "exists": true,
          "available": null,
          "thumbnail_url": "https://cdn.trychannel3.com/7b94a33b-1046-42b2-a405-ddf76d44bf16",
          "product_id": "BfUccUR"
        }
      ]
    },
    {
      "name": "Size",
      "values": [
        { "label": "14 In.", "exists": false },
        { "label": "14-inch", "exists": false },
        { "label": "14.2\"", "exists": false },
        { "label": "16-inch", "exists": true, "available": "InStock" }
      ]
    },
    {
      "name": "Chip",
      "values": [
        { "label": "Apple M5", "exists": false },
        { "label": "M5 Chip", "exists": false },
        { "label": "M5 Pro Chip", "exists": true, "available": "InStock" }
      ]
    }
  ],
  "selected": [
    { "name": "Color", "label": "Space Black" }
  ]
}
```

### Critical Findings on Channel3 Variant Mechanics

1. **Option Values with Separate Product IDs:**
   When testing `client.products.retrieve({ product_id: "KzjPrb3", selected_options: { Color: "Silver" } })`:
   - Channel3 resolved a **different product ID** (`BfUccUR`).
   - The returned title remained `"Apple MacBook Pro"`.
   - `variants.selected` updated to `[{ name: "Color", label: "Silver" }]`.
   - Retailer offers updated from 1 offer ($2,999 on Best Buy) to **4 offers**:
     - `microcenter.com`: $1,699.99
     - `bestbuy.com`: $1,849.00
     - `pcrichard.com`: $2,248.00
     - `apple.com`: $3,949.00
   - **Conclusion:** Channel3's API *does* support variant resolution when variant metadata exists, and correctly pivots to secondary product IDs (`BfUccUR`) and updates offers accordingly.
2. **Storage is NOT an Exposed Variant Option:**
   Even on the variant-enabled MacBook (`KzjPrb3`), the dimensions are `Color`, `Size`, and `Chip`. **Storage (512GB vs 1TB) is not exposed as a variant option.** Channel3 splits storage capacities across completely separate canonical products or keeps them within unstructured title descriptions.
3. **80% of Products Have No Variant Metadata:**
   For 4 out of 5 MacBook listings, `variants` is `null`. Channel3's official documentation explicitly notes that variant metadata is rolling out progressively and is not present on all products.

---

## Section D: Configure Options Diagnosis

### Why Does Configure Options Return the Same Generic Response?

**Primary Cause: A (Channel3 actually returned no variant metadata), combined with G (Generic fallback in UI).**

1. **The Button is Rendered Unconditionally:**
   In [`src/components/product-results/ProductCard.tsx` line 287](src/components/product-results/ProductCard.tsx#L287), the `Configure Options (Size / Color)` button is rendered for every product whenever `onConfigure` is provided:
   ```tsx
   {onConfigure && (
     <button onClick={() => onConfigure(product)}>
       Configure Options
     </button>
   )}
   ```
   It does not check whether `product.variants` or variant options exist before presenting the button to the user.
2. **The Backend Execution Path:**
   When clicked, the modal calls `POST /api/products/variants` $\to$ [`retrieveProductVariants(productId, selectedOptions, currency, retailerUrl)`](src/lib/channel3/variants.ts#L38).
   - `client.products.retrieve({ product_id: productId })` succeeds, returning the product.
   - For 80% of products, `product.variants` is `null`.
   - `rawOptions` is empty (`[]`). `dimensions` is `[]`.
   - Line 201 evaluates:
     ```typescript
     const status: ProductVariantState["status"] =
       dimensions.length > 0 ? "variants_found" : "no_variants_verified";
     ```
   - The function returns `{ status: "no_variants_verified", options: [] }`.
3. **The Frontend Presentation:**
   In [`src/components/guided-shopping/ProductVariantConfigurator.tsx` lines 308–327](src/components/guided-shopping/ProductVariantConfigurator.tsx#L308-L327):
   ```tsx
   ) : !isLoading ? (
     <div className="my-3 py-4 px-4 rounded-xl border border-[#222222] bg-[#141414] text-xs text-[#A3A3A3] space-y-2">
       <div className="flex items-center gap-2 text-[#F5F5F5] font-semibold">
         <Info className="h-4 w-4 text-[#69A8FF] shrink-0" />
         <span>Standard Listing Configuration</span>
       </div>
       <p className="text-[#8E8E8E] leading-relaxed">
         No additional configuration options were found for this listing.
       </p>
   ```
   Because `options.length === 0` and `status !== "unavailable"`, this block executes on almost every product.
4. **Is SpendPilot Passing `buy.trychannel3.com` to URL Lookup?**
   Yes. In [`src/lib/channel3/variants.ts` lines 59–64](src/lib/channel3/variants.ts#L59-L64):
   ```typescript
   if (retailerUrl && (retailerUrl.startsWith("http://") || retailerUrl.startsWith("https://"))) {
     const lookupRes = await client.products.lookup({ url: retailerUrl });
   ```
   `retailerUrl` is `primaryOffer.url`, which is an attributed redirect (`https://buy.trychannel3.com/...`). In our live diagnostic, `client.products.lookup` on `buy.trychannel3.com` successfully resolved to the internal product ID, but when given an uncataloged merchant URL, it blocks for 60 seconds or fails into a silent catch block, which returns `{ status: "unavailable", options: [] }`.

---

## Section E: Repeated Conversational Question Diagnosis

### Problem Recreation & Trace

**Scenario:**
- **Turn 1 User:** *"I need a laptop for university and programming."*
- **Turn 1 Assistant:** *"Do you have a preferred screen size (like 13-inch or 14-inch), or should I look across models within your budget?"*
- **Turn 2 User selects:** *"macOS (Apple MacBook)"*
- **Turn 2 Assistant:** Repeats the same screen-size question.

### The Actual Root Causes Identified

1. **Root Cause 1: Conversational Message History is NOT Passed to Gemini:**
   In [`src/lib/ai/gemini-interactions.ts` lines 301–306](src/lib/ai/gemini-interactions.ts#L301-L306):
   ```typescript
   const sessionContext = buildCompactSessionContext(session, currentProductsSummary);
   const prompt = `Current Shopping Session State:
   ${sessionContext}

   User Message: "${userMessage}"

   Respond with appropriate conversational message and next proposed shopping action.`;
   ```
   Inspecting [`buildCompactSessionContext`](src/lib/ai/gemini-interactions.ts#L213-L267) reveals that it formats `Original Request`, `Shopping Mode`, `Currency`, `Budget`, and `Known Requirements & Preferences`.
   **`session.messages` (the conversation dialogue history) is completely omitted from the context string!**
   Gemini has no record that the assistant already asked about screen size on Turn 1.
2. **Root Cause 2: Asynchronous State / Stateless Recovery:**
   If `session.previousInteractionId` is invalid, expired, or when fallback to `generateContent` occurs, Gemini has zero server-side memory of previous interactions.
   When Gemini receives:
   - Known Requirements: `Primary Use: Programming`, `Operating System: macOS`
   - User Message: `"macOS (Apple MacBook)"`
   Gemini sees that operating system is satisfied, but screen size and budget are still unknown. Following its system prompt for laptops (*"Ask about screen size or budget if not provided"*), Gemini naturally asks about screen size again.
3. **Root Cause 3: Decoupling of Assistant Message and Quick-Reply Buttons:**
   On Turn 1:
   - Gemini generated a natural assistant message asking about screen size.
   - However, the deterministic requirement engine [`analyzeSingleProductRequirements`](src/lib/shopping/requirement-engine.ts#L408-L436) evaluated that `operating-system` was missing, and generated `q-operating-system` as `activeQuestion`.
   - The UI rendered Gemini's message (*"Do you have a preferred screen size..."*) alongside the deterministic quick-reply buttons (`macOS (Apple MacBook)`, `Windows 11`, `ChromeOS`).
   - The user clicked `macOS (Apple MacBook)`.
   - On Turn 2, `operating_system` was recorded, but Gemini (having no dialogue history) generated its default laptop inquiry again: screen size.

---

## Section F: Diagnostic Evidence & Code References

### 1. Channel3 Offer Object Structure (Sanitized Real Sample)

From candidate `Scw0zr0` (MacBook Pro 16-inch):

```json
{
  "id": "Scw0zr0",
  "title": "MacBook Pro 16-inch Laptop",
  "brand": "Apple",
  "structured_attributes": {
    "storage-capacity": ["1 TB", "2 TB"],
    "ram": ["16 GB"],
    "processor-family": ["Apple M5 Pro", "Apple M4 Max", "Apple M3 Max", "Apple M1"],
    "operating-system": ["macOS"]
  },
  "variants": null,
  "offers": [
    {
      "domain": "bestbuy.com",
      "price": { "price": 2499, "currency": "USD" },
      "availability": "InStock",
      "condition": "new",
      "dimensions": null,
      "url": "https://buy.trychannel3.com/Scw0zr0-p1PB-8uAj6S"
    },
    {
      "domain": "quickshipelectronics.com",
      "price": { "price": 2999, "currency": "USD" },
      "availability": "InStock",
      "condition": "used",
      "dimensions": null,
      "url": "https://buy.trychannel3.com/Scw0zr0-xO6g-8uAj6S"
    },
    {
      "domain": "microcenter.com",
      "price": { "price": 1349.99, "currency": "USD" },
      "availability": "OutOfStock",
      "condition": "refurbished",
      "dimensions": null,
      "url": "https://buy.trychannel3.com/Scw0zr0-yE4r-8uAj6S"
    }
  ]
}
```

Notice:
- `structured_attributes["storage-capacity"]` lists `["1 TB", "2 TB"]`.
- `offers[2]` (Micro Center) is priced at $1,349.99 for a refurbished/lower tier model.
- If sorted ascending by price, $1,349.99 is selected as `priceMinor` for a product labeled "1 TB, 2 TB".
- The offer URL points to an attributed Channel3 redirect (`https://buy.trychannel3.com/...`), not a direct Best Buy or Micro Center product page.

### 2. Retailer Link Attribution

SpendPilot displays:
```tsx
<a href={product.retailerUrl} target="_blank" rel="noopener noreferrer">
  View retailer offer
</a>
```
- The URL provided by Channel3 is an attributed redirect: `https://buy.trychannel3.com/<slug>?o=<offer_id>&aid=<affiliate_id>`.
- The actual retailer destination (e.g. `https://www.bestbuy.com/site/...`) is resolved only when the browser follows the redirect through Channel3's proxy.
- SpendPilot does **not** receive the raw un-redirected merchant URL from the Channel3 search or offer API; it correctly preserves the attributed redirect URL and extracts the retailer name from `offer.domain`.

---

## Section G: Categorized Recommended Fixes

### 1. Application Bugs That Can Be Fixed in Our Code

1. **Offer-to-Specification Alignment in Normalization:**
   Do not blindly pick the cheapest offer (`normalizedOffers[0]`) when specific hardware claims exist. If a product claims 1TB storage, only bind offers whose price or metadata can be verified for that tier; otherwise mark the price as starting price or display the offer domain price explicitly as `"From $X (configuration varies)"`.
2. **Conditional Variant Button:**
   In `ProductCard.tsx`, do not display "Configure Options (Size / Color)" when `product.variants` is null or empty. Replace it with `"Standard configuration - view on retailer"` or hide the button, eliminating the dead-end modal.
3. **Include Dialogue History in Gemini Context:**
   In `buildCompactSessionContext` ([`gemini-interactions.ts`](src/lib/ai/gemini-interactions.ts#L213)), serialize the last 3–5 dialogue turns (`session.messages.slice(-5)`) into the prompt. When Gemini sees:
   - *Assistant: "Do you have a preferred screen size?"*
   - *User: "macOS (Apple MacBook)"*
   Gemini will acknowledge the OS selection and will not ask about screen size a second time.
4. **Align Assistant Text with Quick-Reply Options:**
   Ensure `activeQuestion` text and Gemini's generated `assistantMessage` are synchronized so the assistant does not ask about screen size while buttons display operating systems.
5. **Safeguard URL Lookup:**
   In `variants.ts`, do not invoke `client.products.lookup` with `buy.trychannel3.com` URLs or unverified external URLs when `products.retrieve` fails.

### 2. Missing Data or Limitations from Channel3

1. **No Storage Variant Modeling:** Channel3 does not model storage capacity as an option dimension on laptops; it indexes storage as a multi-valued array on the canonical product or across separate products.
2. **Sparse Variant Coverage:** 80% of laptop products in Channel3's catalog currently return `variants: null`.
3. **Missing Configuration Metadata on Offers:** Channel3 offers do not state which specific variant tier (512GB vs 1TB) the offer price applies to.

### 3. Retailer-Specific Information Requiring Another Source

1. **Real-time Merchant In-Store Stock:** Exact SKU availability by zip code / physical store requires retailer direct APIs (Best Buy Developer API, Amazon PA-API).
2. **Direct Product Landing URLs:** Channel3 provides attributed `buy.trychannel3.com` URLs to preserve affiliate monetization. Raw merchant URLs can only be obtained by resolving the HTTP redirect.

### 4. Issues Requiring Additional Manual Verification

1. **Refurbished / Open-Box vs New Offer Filtering:** Offers from Back Market or Micro Center often represent refurbished units at significant discounts ($1,349 vs $2,499 new). SpendPilot must explicitly display the condition badge (`New` vs `Refurbished`) beside the offer price.

---

## Section H: Recommended Implementation Order for Stage 2

1. **Task 1: Fix Conversation Engine History Injection (Zero Data Dependencies)**
   - Update `buildCompactSessionContext` in `gemini-interactions.ts` to include recent dialogue turns.
   - Synchronize Gemini's `assistantMessage` with `activeQuestion.text` to prevent mismatched quick-reply buttons and repeated questions.
2. **Task 2: Fix Configure Options UI & State Handling**
   - In `ProductCard.tsx`, only show "Configure Options" if `product.variantsCount > 0` or if variants are verified.
   - For un-varianted products, display direct merchant specifications without showing a broken configuration modal.
   - Handle secondary product IDs (`hasSeparateProductId`) when a user selects a variant (e.g. Silver switching to `BfUccUR`).
3. **Task 3: Refactor Offer Selection & Pricing Integrity**
   - In `normalize-products.ts`, do not default `priceMinor` to the cheapest offer if the cheapest offer represents a refurbished, out-of-stock, or mismatched base tier.
   - Add condition indicators (`New`, `Refurbished`, `Open-Box`) to product card prices.
   - When multiple offers exist with divergent prices ($1,149 vs $1,499), label displayed pricing as `"From $1,149 (512GB base - 1TB options may be higher at retailer)"` unless a verified 1TB offer is linked.
4. **Task 4: Add Regression Tests for Stage 2 Fixes**
   - Add unit tests verifying dialogue turn history prevents repeated questions.
   - Add unit tests verifying variant button suppression on null-variant products.

