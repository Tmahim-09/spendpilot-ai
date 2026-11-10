# SpendPilot AI: Devpost Hackathon Submission Draft

## Project Title
**SpendPilot AI: Conversational Shopping Assistant with Grounded Comparisons and PayPal Multi-Seller Sandbox Checkout**

## Elevator Pitch
SpendPilot AI is an intelligent conversational shopping companion that transforms complex buying goals into verified product options, provides side-by-side spec comparisons, and demonstrates unified multi-seller checkout with PayPal Sandbox.

---

## Inspiration & Problem Statement
E-commerce shopping today is overwhelmed with friction:
1. **Endless Filter Grids**: Finding products requires navigating rigid dropdowns, checkboxes, and fragmented review blogs.
2. **Hallucinated or Outdated Specs**: Traditional AI chatbots frequently invent specifications, hallucinate non-existent products, or quote fictional prices.
3. **Fragmented Multi-Item Checkout**: When assembling a complete setup (e.g. A home office with a laptop, monitor, and chair), shoppers must jump across different sellers, manage separate baskets, and repeatedly enter payment credentials.

---

## What SpendPilot AI Does
SpendPilot AI bridges conversational intelligence, verified retail data, and multi-merchant payment infrastructure:
- **Conversational Needs Analysis**: Shoppers speak naturally (e.g., *"I need a lightweight laptop for web development under $1,200"*). SpendPilot extracts hard requirements and preferences without interrogating the user with unnecessary questionnaires.
- **Grounded Retrieval via Channel3**: Queries real-time e-commerce catalogs to retrieve verified merchant offers, exact prices, stock availability, and retailer direct links.
- **Side-by-Side Spec Comparison**: Canonicalizes conflicting technical specs across retailers into clean comparison tables, highlighting trade-offs and best-match recommendations.
- **Persistent Shopping Workspace**: Enables multi-task shopping, isolating different product categories (e.g., chairs vs. headphones) so previous specifications don't contaminate new searches.
- **PayPal Multi-Seller Sandbox Checkout**: Demonstrates server-authoritative multi-seller split orders where a buyer approves one purchase and separate payments are captured across multiple independent merchants.

---

## How We Built It

### 1. Conversational Engine & Google Gemini
- **Model Architecture**: Utilizes `@google/genai` with a primary model chain (`gemini-3.1-flash-lite`, with failovers to `3.5-flash-lite` and `2.5-flash-lite`).
- **Structured Orchestration**: Analyzes user turns to extract task intent, maintain an authoritative `ShoppingBrief`, track answered questions, and ensure strict mutual exclusion (a clarifying question turn never prematurely fires a product search).
- **Real-Time Streaming**: Real-time Server-Sent Events (SSE) stream natural responses chunk by chunk to provide immediate conversational feedback.

### 2. Product Discovery & Specification Extraction via Channel3
- Integrates the official `@channel3/sdk` on server-side endpoints.
- Normalizes disparate retail specifications (battery life, display size, processor, weight, material) into unified canonical attributes.
- Filters and ranks products strictly within user budget constraints.

### 3. Server-Authoritative Multi-Seller Checkout via PayPal Orders v2
- Utilizes `@paypal/paypal-js` on the frontend for official PayPal buttons, backed by server-authoritative Next.js API endpoints (`/api/paypal/create-order` and `/api/paypal/capture-order`).
- Implements multiple `purchase_units` with designated payee merchant accounts (`SpendPilot Audio Lab`, `SpendPilot Workspace Gear`).
- Executes split captures from a single buyer authorization, returning independent capture IDs and payment allocations on a verified sandbox receipt.

---

## Challenges We Overcame
- **Conversational Context Contamination**: In complex multi-turn shopping, earlier product attributes (e.g., leather gaming chairs) tended to leak into subsequent queries (e.g., headphones). We built an isolated `ShoppingBrief` orchestrator that strictly scopes attributes per task.
- **Eliminating Question-Search Collisions**: Fixed race conditions where an AI question and product search would trigger simultaneously by implementing strict deterministic gating: if the assistant's response asks a question, search execution is strictly blocked until confirmed.
- **Multi-Merchant Payment Isolation**: Ensured that the PayPal demo clearly separates controlled sandbox demo merchants from external Channel3 retailer links, guaranteeing complete transparency for judges and users.

---

## What We Learned
- How to orchestrate generative models with external API tools while maintaining low latency and avoiding hallucinations.
- The depth and flexibility of the PayPal Orders v2 multi-seller architecture, specifically structuring multi-purchase units with split captures.
- How to design resilient streaming interfaces with graceful recovery from network interruptions.

---

## Built With
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide Icons
- **AI & Reasoning**: Google Gemini API (`@google/genai`), Server-Sent Events (SSE)
- **Catalog & Pricing**: Channel3 SDK (`@channel3/sdk`)
- **Payments**: PayPal Developer Platform (Orders v2 REST API, `@paypal/paypal-js`)
- **Deployment**: Vercel (Edge-ready Node.js runtime)

