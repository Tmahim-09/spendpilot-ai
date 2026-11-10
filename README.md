# SpendPilot AI

> **Conversational product discovery, grounded specification comparisons, and multi-seller checkout powered by Google Gemini, Channel3, and PayPal Sandbox.**

---

## 1. Product Overview

SpendPilot AI is an autonomous, open-category shopping companion designed for the **PayPal AI Hackathon 2026**. Instead of forcing shoppers through rigid filter menus or generating hallucinated product recommendations, SpendPilot combines natural-language conversational reasoning via Google Gemini, live multi-merchant product and pricing data via Channel3, and server-authoritative multi-seller split checkout via the PayPal Orders v2 REST API.

---

## 2. The Real Shopping Problem

Online shopping today suffers from three fundamental bottlenecks:

1. **Rigid Filter Tax**: Finding the right product requires clicking through dozens of dropdowns, checkboxes, and technical specs that shoppers often do not fully understand.
2. **AI Hallucinations in Commerce**: Generic AI shopping chatbots frequently invent non-existent models, state outdated prices, or recommend products without verified retailer stock.
3. **Fragmented Multi-Merchant Purchasing**: When purchasing complementary items (e.g. A laptop from one specialist and headphones from another), shoppers must execute separate checkout flows across multiple websites, repeatedly entering payment details.

---

## 3. SpendPilot's Solution

SpendPilot AI delivers an integrated, verified shopping experience:

- **Goal-Oriented Dialogue**: Shoppers express requirements in natural language (e.g., *"I need a laptop for professional web development under $1,200"*). SpendPilot extracts categories, purposes, and budget limits automatically.
- **Grounded Retail Discovery**: Powered by Channel3, SpendPilot queries live merchant catalogs, retrieving actual retailer offers with live pricing, stock availability, and merchant links.
- **Structured Specification Comparison**: Canonicalizes conflicting technical spec sheets across different retailers into clean, objective comparison tables highlighting critical trade-offs.
- **Multi-Task Workspace & Persistent Cart**: Maintains distinct shopping tasks without context leakage, preserving selections across refreshes.
- **PayPal Multi-Seller Split Checkout**: Demonstrates multi-merchant split checkout where a single buyer approval captures payments across multiple independent sellers using PayPal Orders v2.

---

## 4. Application Screenshots

### Conversational Discovery & Shopping Workspace
![SpendPilot Chat Workspace](docs/assets/initial-chat-workspace.png)
*SpendPilot's natural-language dialogue workspace with real-time streaming, goal extraction, and contextual quick replies.*

### Persistent Multi-Item Cart & Shopping List
![SpendPilot Cart Workspace](docs/assets/cart-workspace.png)
*Persistent shopping cart tracking multi-item budgets, verified retailer prices, and item status.*

### PayPal Multi-Seller Sandbox Checkout
![PayPal Multi-Seller Checkout Demo](docs/assets/paypal-multi-seller-demo.png)
*Server-authoritative multi-seller checkout demonstrating split captures across independent Sandbox merchants.*

---

## 5. Key Implemented Features

- **Open-Category Conversational Engine**: Dynamic slot-filling for any product category (electronics, furniture, laboratory equipment, apparel, tools) without hardcoded question trees.
- **Intelligent Delegation**: Responds naturally when shoppers say *"u suggest"*, *"you choose"*, or *"no preference"*, transitioning to thinking mode (`SpendPilot is thinking...`) and presenting top-rated options within budget.
- **Question-Search Mutual Exclusion**: Strict architectural gate guaranteeing product search never executes while the assistant is asking a clarification question.
- **Channel3 Live Offer Grounding**: Retrieves real-time offers from major retailers (Apple, Best Buy, B&H, etc.) with exact prices, shipping availability, and direct retailer links.
- **Objective Spec Comparisons**: Contrasts up to 4 candidate products across standardized attribute rows (Display, Processor, Memory, Storage, Battery Life, Materials).
- **Product Variant Selection**: Visual configurator for selecting colorways, storage tiers, and sizes with dynamic image switching.
- **Task Isolation**: Strict scoping of shopping briefs so attributes from earlier searches (e.g., leather gaming chairs) never contaminate subsequent searches (e.g., headphones).
- **Server-Authoritative PayPal Orders v2**: Constructs multi-purchase-unit orders with distinct payee merchant accounts and verifies separate capture transactions.

---

## 6. How the Shopping Workflow Works

```
1. Express Need  -->  Shopper types query (e.g. "laptop for web development under $1200")
2. Clarification -->  SpendPilot asks at most 1 essential question with clickable options
3. Delegation    -->  Shopper can pick an option or say "u suggest" to proceed
4. Live Search   -->  Channel3 fetches verified retailer offers within budget
5. Comparison    -->  Side-by-side spec matrix contrasts trade-offs across 2-4 products
6. Selection     -->  Selected product is added to My Shopping List in persistent cart
7. Multi-Task    -->  Shopper can add more items (e.g. "now I need headphones under $200")
8. PayPal Demo   -->  Multi-seller checkout executes independent split captures across registered merchants
```

---

## 7. System Architecture

SpendPilot AI separates client presentation, server-side orchestration, and external service gateways:

```mermaid
flowchart TD
    subgraph Browser ["Client (Next.js 16 App Router)"]
        Chat["ContinuousChatWorkspace\n(Real-Time SSE Dialogue)"]
        Results["LiveProductResults\n(Verified Retailer Cards)"]
        Compare["AiComparisonWorkspace\n(Side-by-Side Spec Matrix)"]
        Cart["Persistent Cart Workspace\n(Local Storage + Server Brief)"]
        PayPalBtn["PayPal JS SDK Buttons\n(@paypal/paypal-js)"]
    end

    subgraph Server ["Next.js Server-Side Engine (Node.js)"]
        StreamAPI["/api/shopping/chat/stream"]
        SearchAPI["/api/products/search"]
        PayPalAPI["/api/paypal/create-order\n/api/paypal/capture-order"]
        Orchestrator["Central Orchestrator & Brief State"]
        PayPalService["PayPal Orders v2 Service"]
    end

    subgraph Providers ["External Services"]
        Gemini["Google Gemini API\n(@google/genai)"]
        Channel3["Channel3 API\n(@channel3/sdk)"]
        PayPalSandbox["PayPal Sandbox API\n(api-m.sandbox.paypal.com)"]
    end

    Chat -->|SSE| StreamAPI
    Results -->|Search| SearchAPI
    PayPalBtn -->|Create / Capture| PayPalAPI

    StreamAPI --> Orchestrator
    Orchestrator --> Gemini
    SearchAPI --> Channel3
    PayPalAPI --> PayPalService
    PayPalService --> PayPalSandbox
```

For detailed architectural specifications and data flow documentation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 8. How Google Gemini is Used

SpendPilot uses the official `@google/genai` SDK on the server-side with priority routing:
- **Primary Model**: `gemini-3.1-flash-lite` (low latency, high reasoning fidelity).
- **Automatic Failover Chain**: Fails over to `gemini-3.5-flash-lite` and `gemini-2.5-flash-lite` on upstream capacity spikes.
- **Structured Orchestration**: Analyzes user input to construct and update an authoritative `ShoppingBrief` schema containing product category, constraints, and budget limits.
- **Streaming Concierge**: Uses `generateContentStream` to stream natural assistant dialogue in real time via Server-Sent Events.
- **Specification Contrast**: Analyzes technical attribute vectors to generate objective trade-off summaries between competing products.

---

## 9. How Channel3 is Used

Channel3 powers SpendPilot's real-time product discovery via `@channel3/sdk`:
- **Live Catalog Queries**: Executes grounded product retrieval against real e-commerce retailer inventories.
- **Offer Normalization**: Extracts multi-retailer offers, price minor units, currency codes, merchant domains, and in-stock statuses.
- **Specification Normalization**: Standardizes non-uniform retailer product specifications into canonical attributes (e.g. Battery capacity, weight, materials, dimensions).
- **Direct Merchant Links**: Provides direct retailer links so shoppers can purchase directly from external merchants.

---

## 10. How PayPal Sandbox Integration Works

SpendPilot demonstrates multi-seller e-commerce checkout using the official PayPal Orders v2 REST API:
- **Server-Authoritative Intent**: The server builds the order payload with `intent: "CAPTURE"` and multiple `purchase_units`, each assigned a specific demo merchant payee (`SpendPilot Audio Lab`, `SpendPilot Workspace Gear`).
- **One-Click Buyer Approval**: The shopper logs into PayPal Sandbox once through the official PayPal JavaScript SDK popup window.
- **Multi-Seller Split Capture**: On the backend (`/api/paypal/capture-order`), SpendPilot captures the order, generating separate PayPal capture IDs and payment allocations for each merchant.
- **Receipt Transparency**: Renders a verified receipt displaying the breakdown of funds allocated to each independent seller.

> [!NOTE]
> All PayPal transactions run strictly on `https://api-m.sandbox.paypal.com` with virtual sandbox currency. No real payment methods are charged.

---

## 11. Technology Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide React
- **AI & Reasoning**: Google GenAI SDK (`@google/genai`), Google Gemini Flash models
- **Product Retrieval**: Channel3 SDK (`@channel3/sdk`)
- **Payments**: PayPal Orders v2 REST API, `@paypal/paypal-js`
- **Validation & Math**: Zod, custom currency minor-unit arithmetic
- **Testing**: Node.js native test runner (`node:test`, `node:assert`)
- **Deployment**: Vercel (Serverless Node.js runtime)

---

## 12. Prerequisites

- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **Package Manager**: `npm` (v10+)
- **API Keys**:
  - Google Gemini API Key ([Google AI Studio](https://aistudio.google.com/))
  - Channel3 API Key ([Channel3 Portal](https://trychannel3.com/))
  - PayPal Developer Sandbox Account ([PayPal Developer](https://developer.paypal.com/))

---

## 13. Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Tmahim-09/spendpilot-ai.git
   cd spendpilot-ai
   ```

2. **Install dependencies**:
   ```bash
   npm ci
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your credentials (see [Environment Variables](#14-environment-variables)).

---

## 14. Environment Variables

| Variable | Description | Required | Scope |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API Key | **Yes** | Server-Only |
| `GEMINI_MODEL` | Primary model (`gemini-3.1-flash-lite`) | Optional | Server-Only |
| `GEMINI_FALLBACK_MODELS` | Fallback models list | Optional | Server-Only |
| `CHANNEL3_API_KEY` | Channel3 Product Discovery API key | **Yes** | Server-Only |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | PayPal Sandbox REST Client ID | **Yes** | Public / Client |
| `PAYPAL_CLIENT_ID` | PayPal Sandbox REST Client ID | **Yes** | Server-Only |
| `PAYPAL_CLIENT_SECRET` | PayPal Sandbox REST Client Secret | **Yes** | Server-Only |
| `PAYPAL_CHECKOUT_SIGNING_SECRET` | Cryptographic secret for signing server-authoritative checkout tokens | **Yes** | Server-Only |
| `PAYPAL_ENV` | Environment (`sandbox`) | **Yes** | Server-Only |
| `PAYPAL_API_BASE` | PayPal API endpoint (`https://api-m.sandbox.paypal.com`) | **Yes** | Server-Only |
| `PAYPAL_DEMO_SELLER_A_MERCHANT_ID` | Demo Seller A Merchant ID | Optional | Server-Only |
| `PAYPAL_DEMO_SELLER_B_MERCHANT_ID` | Demo Seller B Merchant ID | Optional | Server-Only |

---

## 15. Local Development Commands

- **Start dev server**:
  ```bash
  npm run dev
  ```
  Open [http://localhost:3000](http://localhost:3000) to use the shopping interface, or [http://localhost:3000/paypal-demo](http://localhost:3000/paypal-demo) to test multi-seller checkout directly.

---

## 16. Testing and Verification Commands

- **Typecheck**:
  ```bash
  npm run typecheck
  ```
- **Lint**:
  ```bash
  npm run lint
  ```
- **Run automated test suite**:
  ```bash
  npm test
  ```
- **Build production bundle**:
  ```bash
  npm run build
  ```

---

## 17. Security & Sandbox Safety

- **No Secrets in Browser Bundles**: All Gemini, Channel3, and PayPal Client Secrets are restricted strictly to server-side Node.js routes.
- **Authoritative Server Pricing**: The client never passes order prices to the server. Pricing is validated and calculated on the server before dispatching to PayPal.
- **Sandbox Enforcement**: Hardcoded to PayPal Sandbox endpoints. Production live credentials cannot be used.
- **Security Headers**: Configured with `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Frame-Options: SAMEORIGIN`.
- See [SECURITY.md](SECURITY.md) for vulnerability disclosure procedures.

---

## 18. Current Limitations

- **Channel3 Retailer Purchases**: External retailer cards link directly to merchant sites; SpendPilot does not process credit cards for external retailers.
- **Sandbox Demo Merchants**: The PayPal multi-seller checkout demonstration executes across mock demo merchants (`SpendPilot Audio Lab`, `SpendPilot Workspace Gear`).

---

## 19. Hackathon Documentation Links

- **[Judge Evaluation Guide (5-Minute Walkthrough)](docs/JUDGE_GUIDE.md)**
- **[System Architecture & Data Flows](docs/ARCHITECTURE.md)**
- **[Devpost Submission Draft](docs/DEVPOST_DRAFT.md)**
- **[Video Demonstration Script](docs/DEMO_SCRIPT.md)**
- **[Third-Party Notices & Licenses](THIRD_PARTY_NOTICES.md)**

---

## 20. Team & Acknowledgements

Created for the **PayPal AI Hackathon 2026**. Special thanks to Google Cloud & Gemini for conversational AI models, Channel3 for real-time commerce data indexing, and PayPal for Orders v2 multi-seller developer APIs.

---

## 21. License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

