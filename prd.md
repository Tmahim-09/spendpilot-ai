# SpendPilot AI
## Product Requirements Document (PRD)

**Project type:** AI-powered commerce prototype for the PayPal AI Hackathon 2026  
**Document status:** Build specification  
**Prepared:** 29 October 2026  
**Target submission deadline:** 12 November 2026, 12:00 PM Pacific Time (13 November, 2:00 AM Bangladesh time)  
**Primary build environment:** Antigravity with Gemini coding models  
**Runtime AI:** Gemini API  
**Product discovery:** Channel3 API  
**Payment integration:** PayPal Developer Sandbox

---

## 1. Executive Summary

SpendPilot AI is a budget-aware shopping assistant that helps a shopper turn a natural-language request into a clear, evidence-based purchase plan. It combines Gemini for understanding and explanations, Channel3 for real product discovery, deterministic application rules for spending limits, and PayPal Sandbox for a working checkout demonstration.

The core promise is:

> **Find what fits. Understand the choice. Stay in control.**

SpendPilot is not a generic shopping chatbot and must not behave like an unrestricted autonomous buyer. Its defining feature is a **Purchase Policy Engine** that checks a basket against user-defined limits before checkout. The AI can interpret intent and explain options, but it cannot invent trusted prices, bypass policy, or declare a payment successful.

The product experience should feel like a dependable shopping partner: calm, transparent, well-organized, and respectful of the user's money. The AI request interface is the primary hero element on the landing page. The visual language uses a predominantly black and gray palette, with orange reserved for the main action and a small supporting set of semantic colors.

This is a hackathon MVP. Scope must prioritize a complete, testable end-to-end journey over a large feature list.

## 2. Hackathon Alignment

The project is designed to demonstrate meaningful use of both the PayPal Developer Platform and an AI model, with Channel3 as a functional product-data integration.

### Intended judging strengths

1. **Technological implementation:** Real Gemini API requests, real Channel3 product searches, server-enforced purchase policies, and PayPal Sandbox order creation and capture.
2. **Design:** A coherent, responsive product experience from request to recommendation to checkout.
3. **Potential impact:** Help budget-conscious shoppers find suitable products and understand the trade-offs before spending.
4. **Innovation:** Combine conversational shopping with explicit, enforceable spending rules and explainable recommendations.
5. **Presentation:** Demonstrate the complete product working end to end in a short, clear demo.

### Submission readiness requirements

The release must include:

- A publicly accessible and functional hosted demo, or complete and accurate local run instructions.
- A public source repository containing the code, required assets, and setup documentation.
- An open-source license file in the repository.
- A written project description explaining the problem, solution, features, and technology.
- A public YouTube demo video shorter than three minutes, showing the project functioning on the device for which it was built. The official rules require this.
- Correct attribution and compliance with the terms of all third-party APIs, SDKs, data, and assets.

The team must re-check the official rules and the live submission form before submitting. Channel3 is a potential sponsor-prize target only if its API or MCP server is meaningfully used as part of the product experience; simply naming the service is not sufficient. The current event page advertises 20,000 free Channel3 API credits for participants using promo code `PAYPAL-HACKATHON-2026`, subject to the provider applying the offer to the participant account. The specification does not guarantee an award or eligibility for any particular prize.

## 3. Problem Statement

Shopping across multiple retailers often requires a shopper to translate a vague need into specific requirements, search across products, compare prices and specifications, understand trade-offs, and check whether the total fits a budget. A general-purpose AI answer may be convenient but can contain outdated or invented facts. An attractive recommendation is not enough when the user needs to control what they spend.

SpendPilot addresses this gap by connecting AI-assisted discovery to verified product data and explicit spending rules. It should help a shopper make a better-informed decision, not pressure them to purchase.

## 4. Product Vision and Positioning

### Vision

Make AI-assisted shopping useful and trustworthy by giving people understandable recommendations and control over the final purchase.

### Positioning

SpendPilot AI is a budget-aware shopping partner that searches real product data, explains its recommendations, and checks purchase rules before the user proceeds.

### Primary audience

A person who knows what they need but wants help comparing options and keeping the total within a budget. The core demo persona is a student assembling a practical study setup.

### Brand characteristics

- Trustworthy, not pushy.
- Intelligent, not theatrical.
- Modern, not futuristic for its own sake.
- Helpful, not overfamiliar.
- Transparent about product data, estimates, limitations, and payment status.
- Premium and minimal, with clear typography and restrained motion.

### Brand asset

The project owner will supply the logo. **Use the supplied logo asset exactly as provided.** Do not generate a replacement logo, redraw the mark, change its proportions, or add an unapproved symbol. Preserve the aspect ratio and clear space. If a light or dark variant is necessary, ask for or use only a supplied approved variant. Until the asset is provided, use a text-only placeholder in development and keep the logo integration replaceable.

## 5. Goals and Non-Goals

### Goals

1. Let a user describe a shopping need in natural language.
2. Parse the request into validated, structured shopping requirements using Gemini.
3. Search Channel3 for real products and display source-backed product facts and retailer links.
4. Explain product fit using retrieved product information, with no fabricated specifications or prices.
5. Enforce an overall budget and per-item spending rule in deterministic server-side code.
6. Make the distinction between external retailer offers and the app's sample checkout catalog clear.
7. Complete a genuine PayPal Sandbox checkout for items from the controlled sample merchant catalog.
8. Provide robust loading, empty, error, cancellation, and success states.
9. Deploy the app so judges can use it and follow the source repository setup instructions.
10. Keep the app simple enough for a first-time builder to understand, test, and maintain with AI-assisted coding.

### Non-goals for the hackathon MVP

- A production payment service or real-money payment processing.
- Directly buying arbitrary Channel3 retailer products from within SpendPilot.
- A general-purpose wallet, credit product, investment assistant, or financial advisor.
- Unrestricted autonomous purchasing or background purchases without user confirmation.
- A multi-agent architecture.
- Full merchant inventory management, seller onboarding, or merchant analytics suite.
- Mandatory user accounts, social features, or a complex database.
- A comprehensive mobile application.
- Product scraping that violates retailer terms.
- Claims that the app guarantees the lowest price, product quality, delivery, or savings.

## 6. Product Principles

1. **User approval stays in control.** The shopper reviews the final basket and explicitly approves checkout.
2. **Facts come from data sources.** Product prices, availability, titles, images, links, and specifications must come from Channel3 or the controlled sample catalog, not AI invention.
3. **Policy enforcement is deterministic.** The backend enforces budgets and purchase constraints independently of Gemini.
4. **Payment status is verified.** The UI shows success only after the server verifies a successful PayPal capture.
5. **Retailer links and checkout are different flows.** Channel3-discovered products link to their retailers. PayPal Sandbox checkout is for the app's own clearly labelled sample merchant catalog only.
6. **Transparency over persuasion.** Explain why a product fits, highlight trade-offs, and disclose missing data.
7. **Fail safely.** On uncertain prices, missing product identifiers, failed APIs, invalid model output, or payment errors, stop the affected action and explain the issue.
8. **Minimize data.** Do not collect sensitive data the project does not need.
9. **Build for a judge's first visit.** The central use case should be understandable without a tutorial.
10. **Use dependencies deliberately.** Choose current stable, compatible releases and verify them before implementation and submission.

## 7. Primary User Journey

### Scenario

A student enters: “Help me build a study setup for programming under $300. I prefer reliable products and a simple design.”

1. The landing page presents a prominent AI shopping request interface in the hero section.
2. The user enters a request and an optional budget.
3. Gemini converts the request into structured categories, constraints, preferences, and budget values.
4. The server validates the model output and sends appropriate searches to Channel3.
5. Channel3 results are normalized and shown in product cards with actual product information, prices where available, and retailer links.
6. The application ranks the results against the user's constraints using deterministic logic. Gemini can explain the trade-offs using the retrieved facts.
7. The user adds products to a planning basket. External retailer products are labelled “Buy from retailer” and open the actual retailer link. They are not charged by SpendPilot.
8. For a PayPal checkout demonstration, the user switches to the clearly labelled SpendPilot Demo Store catalog, which has fixed server-controlled items and prices.
9. The user sets or confirms the budget and sees the basket's calculated total.
10. The Purchase Policy Engine checks all spending rules on the server.
11. If rules pass, the user reviews and approves the PayPal Sandbox checkout.
12. The server creates the PayPal order, processes the approved capture according to the current official SDK/API flow, and verifies the result.
13. The user sees a confirmed, cancelled, or failed result with an accurate explanation.

## 8. Information Architecture and Page Layout

The MVP may use a single main route with clear sections and a small number of supporting routes. Do not create unnecessary pages.

### Main route: `/`

#### Header

- Use the supplied logo on the left.
- Keep navigation minimal: “How it works”, “Spending rules”, and a primary “Start shopping” action are sufficient.
- On small screens, prevent crowded navigation and horizontal overflow.
- Clearly identify SpendPilot as a demo where appropriate.
- Do not add a large navigation menu, fake account avatar, or non-functional links.

#### Hero section: AI interface is the main element

The AI shopping input must be immediately visible in the first viewport. The hero should resemble a polished, familiar AI assistant interface, not a generic marketing hero with an oversized slogan and the actual product hidden below the fold.

Recommended composition:

- Compact eyebrow label: “AI shopping, with your budget in control”.
- Main heading: “Find what fits. Stay in control.”
- Short supporting sentence explaining that SpendPilot compares product options and checks spending rules.
- A large, accessible prompt composer with a clear placeholder such as: “What are you shopping for, and what is your budget?”
- Optional budget control and a small set of example prompt chips.
- Primary orange action: “Find my options”.
- A subtle trust note: “Product details come from product data sources. You approve every checkout.”
- A restrained product preview or compact example cards can sit beside or beneath the input on desktop, but must not compete with the composer.

The hero must look functional before any user action. Avoid a blank, oversized empty box or an interface that looks like a static mockup. On mobile, stack the content, keep the prompt input prominent, and ensure the main action is visible without awkward clipping.

#### Results section

- Search summary showing the user's parsed needs and budget.
- Clear loading state while Gemini or Channel3 is working.
- Product grid with consistent cards.
- Source and retailer information.
- Filters or chips for categories and relevant constraints only if supported by available data.
- Comparison indicators based on known facts.
- A clear distinction between verified product facts and AI-generated explanations.

#### Basket and spending-rules panel

- Selected items and quantities.
- Price per item and subtotal.
- Shipping/tax status when known. Never imply they are included if unavailable.
- Overall budget and remaining amount.
- Item-level and total-limit status.
- Remove and quantity controls.
- Explicit notice when the basket contains external retailer products that cannot be checked out through the app.

#### Demo Store / PayPal checkout section

- Clear “Demo Store” label; do not disguise it as an external merchant.
- Product name, description, amount, and currency must come from the server-controlled catalog.
- A final review before checkout.
- PayPal Sandbox checkout component using the current documented integration.
- Visible sandbox/demo disclosure so nobody mistakes a test payment for a real purchase.
- Accurate pending, approved, capture, failure, and cancellation states supported by the integration.

#### How it works / trust section

Use three concise steps:

1. Tell SpendPilot what you need.
2. Compare source-backed product options.
3. Check your spending rules and approve checkout.

Add a short explanation that AI recommendations are assistance, not a guarantee of product quality or availability.

#### Footer

- About the demo.
- Privacy note.
- Source repository link when public.
- API/data attribution where required by the providers' terms.
- No fabricated partner badges, certifications, reviews, user counts, or security seals.

### Optional supporting routes

- `/privacy`: concise privacy and demo-data explanation.
- `/terms`: prototype limitations and third-party links, if time permits.
- `/not-found`: graceful not-found experience.

Do not prioritize supporting routes above the working core journey.

## 9. Visual Design System

### Palette ratio

The overall visual balance must be approximately:

- **60% black and near-black surfaces**
- **30% gray and neutral surfaces**
- **5% orange accents**
- **5% all other colors combined**

The percentages describe the approximate visual footprint across the interface, not a strict pixel-level measurement. Black and gray should dominate the page. Orange is reserved for actions and a few high-value highlights. Other colors are primarily semantic states and small supporting details.

### Core palette

| Role | Suggested value | Use |
|---|---|---|
| Primary background | `#080808` | Main page background; strongest black surface |
| Secondary black | `#101010` | Sections, header, hero support areas |
| Elevated black | `#171717` | Cards, dialogs, input backgrounds |
| Primary gray | `#A3A3A3` | Secondary copy, muted content, metadata |
| Border gray | `#303030` | Dividers, card borders, subtle outlines |
| Light gray | `#D4D4D4` | Main body text where white would feel too harsh |
| Off-white | `#F5F5F5` | Main headings, key labels, high-contrast text |
| Primary orange | `#FF6A00` | Main CTA, focused accent, selected state, limited highlights |
| Orange hover | `#FF8126` | Hover and interactive state; do not use as a second accent theme |
| Success | `#35C979` | Verified success or passing policy state, used sparingly |
| Warning | `#F5B942` | Missing data, pending state, or caution |
| Error | `#F05B5B` | Failure, blocked action, or invalid input |
| Information | `#69A8FF` | Small informational state only when needed |

Off-white and the semantic colors must remain within the collective “other colors” allowance as far as practical. Gray text and borders should be used for most information states. Do not add purple, cyan, gradients, or multiple decorative accent colors unless a real usability need exists.

### Palette usage rules

- Black is the dominant canvas and should cover approximately 60% of the visual impression.
- Gray neutrals provide card separation, borders, metadata, and secondary content across approximately 30%.
- Orange is the visual action color, not a background theme. Reserve it for primary CTA, selected controls, and a small number of focal points.
- Use semantic colors only for state. Do not use green just to decorate success-looking cards.
- Keep gradients rare or absent. Avoid neon glow, excessive glassmorphism, rainbow gradients, and crypto dashboard styling.
- Avoid pure-black-on-black layers with no separation. Use subtle gray borders and surface differences.
- Maintain accessible text and interactive contrast. Never use color alone to communicate success, warnings, errors, or policy decisions; add text or icons.

### Typography

- Use a modern, highly legible sans-serif. Prefer the framework's supported font optimization with a stable font provider, or a system fallback if remote font access fails.
- Suggested direction: Geist, Inter, or another restrained contemporary UI family, subject to current compatibility and licensing checks.
- Use a clear scale: strong headline, readable body, compact metadata.
- Avoid excessively wide headings, tiny gray text, all-caps paragraphs, and too many font weights.
- Use tabular numerals where possible for prices and totals so amounts align clearly.

### Shape, spacing, and motion

- Use a consistent spacing scale and a centered content container with generous breathing room.
- Use moderate rounded corners, not oversized pill shapes for every component.
- Inputs, buttons, cards, and dialogs must share consistent corner and border rules.
- Motion should communicate state: progress, expansion, selection, or confirmation.
- Keep animations short and subtle, respect reduced-motion preferences, and avoid movement that delays the main task.
- Do not place important product facts inside decorative animation.

### Trust-focused UI rules

- Always show where product facts come from when relevant.
- Display currency labels explicitly.
- Keep budget, basket total, and policy status easy to scan.
- Explain what cannot be verified.
- Do not present “recommended” as “best” unless the ranking basis is shown.
- Avoid fake testimonials, fake purchase counts, fabricated ratings, and unsubstantiated claims such as “guaranteed lowest price”.
- Use realistic demo labels for sandbox payments and seeded data.

## 10. Functional Requirements

### FR-01: Shopping request composer

- Accept free-text user requests.
- Support an optional budget and supported currency.
- Offer a small set of clickable example prompts.
- Validate empty or excessively long requests.
- Provide loading and error feedback.

**Acceptance criteria:** A user can submit a request with a clear budget and receive a visible progress state without refreshing the page.

### FR-02: Gemini intent parsing

- Use the official Google Gen AI JavaScript/TypeScript SDK (`@google/genai`) unless Google's current documentation recommends a replacement at implementation time.
- Use structured output with a runtime schema for fields such as query, categories, budget, currency, preferences, exclusions, and maximum item price.
- Treat model output as untrusted input and validate every field server-side.
- Do not let Gemini call PayPal payment or capture functions.
- If parsing fails, ask the user to clarify or use a safe fallback rather than guessing critical constraints.

**Acceptance criteria:** The app can parse the primary demonstration request into valid structured data and handles malformed or incomplete model responses gracefully.

### FR-03: Channel3 product discovery

- Use Channel3's official API or supported MCP implementation only where appropriate and authorized.
- Prefer server-side API calls so the API key is not exposed to the browser.
- Search for product options using the validated request.
- Use lookup/enrichment when necessary and supported by the current API.
- Normalize provider results into an internal product type.
- Preserve source identifiers and original retailer URLs.
- Display only fields actually returned by the provider.
- Handle empty results, rate limits, timeouts, unavailable values, and provider errors.
- Do not scrape websites or invent prices/specifications as a fallback.

**Acceptance criteria:** At least three useful searches return live Channel3 results when the provider has matching data, and every product card links to its actual retailer or supported source URL.

### FR-04: Product comparison and explanations

- Rank products using deterministic factors that are available in the data, such as explicit budget fit, required specifications, and requested features.
- Use Gemini to explain the comparison using retrieved facts only.
- Mark unknown details as unknown; do not fill missing specifications from model memory.
- Do not fabricate review scores, ratings, availability, shipping fees, stock, delivery times, or discounts.
- Keep explanations short, specific, and helpful.

**Acceptance criteria:** The user can see why a product is considered a match and distinguish a source-backed fact from an AI explanation.

### FR-05: Budget and purchase policies

- Support an overall maximum budget.
- Support an optional per-item cap.
- Support item quantities and basket calculations.
- Use integer minor currency units for monetary calculation where the currency supports that model; account for currencies with different minor-unit rules.
- Keep all authoritative calculations on the server.
- Reject invalid quantities, unknown catalog IDs, altered prices, unsupported currencies, and baskets above allowed limits.
- Recalculate the amount immediately before creating a PayPal order.
- Clearly disclose when tax or shipping cannot be determined.
- Keep policy logic separate from the LLM.

**Acceptance criteria:** A malicious or accidental client-side price change cannot lower the amount charged. An over-budget basket is rejected by the backend even if the UI is bypassed.

### FR-06: Separate external products from the demo checkout catalog

- Channel3-discovered products are for research, comparison, and retailer referral unless a verified authorized checkout integration is available.
- The PayPal checkout demonstration must use a separate, controlled sample merchant catalog.
- Sample checkout product IDs, prices, currency, and availability are server-controlled.
- External Channel3 offers must not be silently substituted with demo catalog items.
- Explain the difference in the UI.

**Acceptance criteria:** A judge can tell whether a product opens a retailer website or can be paid for through the SpendPilot demo checkout.

### FR-07: PayPal Sandbox checkout

- Follow the official PayPal developer documentation current at implementation time.
- Prefer the current supported PayPal JavaScript SDK flow, including SDK v6 if it is the documented stable option for the needed flow; do not copy an old integration blindly.
- Configure sandbox mode explicitly.
- Create orders on the server using trusted product IDs and server-calculated totals.
- Allow the user to approve the PayPal checkout.
- Capture the approved order on the server using the documented flow.
- Verify the response and order/payment state before displaying success.
- Handle cancellation, errors, repeated capture attempts, and network interruptions.
- Prevent arbitrary client-supplied prices and quantities from controlling the order amount.
- Keep the PayPal client secret server-side.
- Clearly label all transactions as sandbox/demo transactions.

**Acceptance criteria:** A test buyer can complete a sandbox transaction for a sample catalog item, and the app displays success only after successful verification. A cancelled or failed payment is not recorded or shown as successful.

### FR-08: Basket and checkout review

- Show quantity, unit price, subtotal, and known shipping/tax information.
- Show total budget, basket total, and remaining budget.
- Explain why a basket is blocked.
- Require an explicit user action to proceed.
- Make cart edits recalculate the total and re-run policy validation.

**Acceptance criteria:** Users can understand the total and reason for a block before they reach PayPal.

### FR-09: Accessibility and responsiveness

- Support mobile, tablet, and desktop viewports.
- Provide visible keyboard focus indicators.
- Use semantic HTML, appropriate labels, and accessible names.
- Provide accessible validation and error messages.
- Respect reduced-motion preferences.
- Meet WCAG contrast expectations for essential text and controls where practical.
- Prevent horizontal overflow at narrow viewport sizes.

**Acceptance criteria:** The entire primary journey is usable at 360px width and with keyboard navigation.

### FR-10: Privacy and data minimization

- Do not request or store PayPal passwords, full card details, or sensitive payment credentials.
- Let PayPal handle protected checkout details.
- Do not store raw payment secrets in client state or local storage.
- Store only the minimum data needed for a demo; browser storage may be used for non-sensitive preferences and cart state.
- Do not send unnecessary personal data to Gemini or Channel3.
- Explain that this is a hackathon prototype and avoid claiming production-grade financial compliance.

**Acceptance criteria:** Secret keys remain server-side, no sensitive payment credentials are stored by SpendPilot, and the README explains data handling.

## 11. API and Data Contracts

The final contract must follow the actual provider documentation and responses. The following are internal conceptual types, not claims about exact provider response fields.

### ShoppingIntent

- `query`: string
- `categories`: string array
- `budgetMinor`: integer or null
- `currency`: supported ISO currency code
- `maxItemPriceMinor`: integer or null
- `mustHave`: string array
- `preferences`: string array
- `excluded`: string array

Validate request length, allowed currency, positive budget values, array sizes, and output shape before using it.

### NormalizedProduct

- `source`: provider identifier
- `sourceProductId`: original source identifier when available
- `title`: string
- `imageUrl`: validated HTTP(S) URL or null
- `priceMinor`: integer or null
- `currency`: currency code or null
- `retailerName`: string or null
- `retailerUrl`: validated HTTP(S) URL
- `availability`: source-provided value or unknown
- `specifications`: known source-provided attributes only
- `sourceFacts`: minimal record of facts used for the recommendation

Do not assume every provider response includes all fields. Use null or “Not provided” when absent.

### DemoCatalogItem

- `id`: server-controlled stable identifier
- `title`: string
- `description`: string
- `unitAmountMinor`: server-controlled integer
- `currency`: configured currency
- `active`: boolean
- `imageUrl`: local/approved asset or validated URL

The client submits catalog item IDs and quantities, not trusted monetary values.

### PayPal order flow

- Request contains validated demo catalog IDs and quantities.
- Server calculates the total from the server-controlled catalog.
- Server checks user-approved budget policy.
- Server creates the PayPal order according to current documentation.
- The browser receives only the response fields necessary for checkout.
- After approval, server performs the documented capture flow.
- Server validates the final order/capture state and amount before confirming.
- Handle duplicate requests safely and avoid double capture or duplicate confirmation.

## 12. Security, Reliability, and Error Handling

### API key handling

The owner will add credentials later. Never invent, generate, or request the user to paste secrets into source files.

Use environment variables and create a `.env.example` file containing blank placeholders only. Suggested names, to be used consistently across the app:

```dotenv
GEMINI_API_KEY=
CHANNEL3_API_KEY=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENV=sandbox
```

Only expose a PayPal client ID to the browser if required by the official SDK. Never expose `PAYPAL_CLIENT_SECRET`, `GEMINI_API_KEY`, or `CHANNEL3_API_KEY` to client components. Ignore `.env*` files that contain secrets, except the safe example template.

### Required safeguards

- Server-side schema validation for all inputs.
- Reasonable request limits and payload-size limits.
- Timeouts and user-friendly handling for third-party requests.
- No arbitrary shell commands or uncontrolled database queries generated by the LLM.
- No direct model access to payment capture operations.
- Do not render untrusted HTML from model output.
- Validate all external URLs before making them clickable.
- Do not log API keys, full secrets, or unnecessarily detailed personal data.
- Provide useful server logs without exposing stack traces to end users.
- Make error states truthful and specific without leaking internals.

### Core error states

- Gemini rate limit, timeout, or invalid response.
- Channel3 rate limit, timeout, empty results, or missing product facts.
- Unsupported or missing currency data.
- Invalid or over-budget basket.
- PayPal order creation failure.
- User cancellation.
- Capture failure or incomplete verification.
- Hosting environment misconfiguration.

The UI must never pretend an operation succeeded when the backend reports failure or uncertainty.

## 13. Dependency and Package Freshness Policy

**Every dependency and package used in the project must be checked for current stable status, compatibility, and known security issues before it is installed and again before final submission.** This is a requirement, not a suggestion.

### Required process

1. At project initialization, check current stable versions using official documentation and package registry metadata.
2. Use stable releases only. Do not use canary, nightly, beta, or release-candidate packages unless a required integration has no stable alternative and the reason is documented.
3. Confirm that the chosen Next.js, React, TypeScript, Node.js, Tailwind CSS, component libraries, Google Gen AI SDK, and PayPal SDK versions are mutually compatible.
4. Select a supported Node.js LTS/runtime version compatible with the installed Next.js release and hosting platform.
5. Use one package manager consistently. For this project, use npm unless the repository already has a deliberate, working alternative.
6. Commit the lockfile (`package-lock.json`) and use reproducible installs such as `npm ci` for validation/deployment where supported.
7. Do not blindly run package-wide major upgrades late in the hackathon. Review changelogs and breaking changes before updating.
8. At minimum, run `npm outdated`, `npm audit`, the project's lint/type-check/test commands, and a production build before submission. Review audit results; do not ignore critical or high-severity vulnerabilities without a documented, justified mitigation.
9. Verify the most current PayPal SDK guidance and Gemini SDK documentation rather than copying tutorials with potentially outdated package names or integration patterns.
10. Re-run the relevant smoke tests after dependency changes.

### Suggested validation commands

Commands depend on the final scripts and supported tooling. Set up suitable scripts in `package.json` and run equivalents of:

```bash
node --version
npm --version
npm outdated
npm audit
npm run lint
npm run typecheck
npm test
npm run build
```

If a script is not configured, add it when useful or document the equivalent check. Do not claim a command passed unless it was actually executed successfully.

### Dependency minimization

- Prefer platform-native APIs and small utilities over installing a library for every minor task.
- Avoid multiple overlapping UI libraries, icon libraries, HTTP clients, schema validators, or animation libraries.
- Install icon packages only if used; do not import a complete icon bundle unnecessarily.
- Do not add a vector database or background task queue for the MVP unless a demonstrated requirement justifies it.
- Document each essential third-party package and its purpose in the README.

## 14. Recommended Repository Structure

Use the structure below as a starting point. Adjust only when the actual implementation requires it, and explain substantial changes.

```text
spendpilot-ai/
├── public/
│   ├── logo/                 # Supplied logo asset(s), unchanged
│   └── images/               # Approved local assets only
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ai/           # Gemini intent parsing / explanation
│   │   │   ├── products/     # Channel3 search and normalization
│   │   │   └── paypal/       # Server-side create/capture endpoints
│   │   ├── privacy/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── layout/
│   │   ├── ai-shopping/
│   │   ├── product-results/
│   │   ├── basket/
│   │   ├── policy/
│   │   └── paypal-checkout/
│   ├── lib/
│   │   ├── ai/
│   │   ├── channel3/
│   │   ├── paypal/
│   │   ├── policy/
│   │   ├── validation/
│   │   └── money/
│   └── types/
├── tests/
├── .env.example
├── .gitignore
├── LICENSE
├── README.md
├── package.json
├── package-lock.json
└── prd.md
```

The repository may vary according to framework conventions. Never create empty abstractions merely to match this diagram.

## 15. Implementation Phases and Milestones

The schedule is intentionally risk-first. The exact work order may change if integration setup takes longer, but a working PayPal flow and live product search must be tested early.

### Phase 0: Preparation and access

- Confirm Devpost registration and read the current rules.
- Obtain Channel3 API access. The current event page advertises 20,000 free API credits with promo code `PAYPAL-HACKATHON-2026`; confirm the credits are applied in the Channel3 dashboard before relying on them.
- Obtain Gemini API access and check remaining credits/quotas.
- Create PayPal Sandbox business and buyer accounts.
- Create the GitHub repository and set up environment variables locally.
- Add the supplied logo when available.

**Exit condition:** All provider accounts and credentials are available, with secrets stored outside source control.

### Phase 1: App shell and visual foundation

- Initialize the latest compatible stable Next.js application.
- Build the responsive main route and hero AI composer.
- Define color tokens, type scale, spacing, buttons, inputs, cards, toasts, and loading states.
- Use a temporary text-only logo placeholder until the owner supplies the official file.
- Establish lint, type-check, and production-build commands.

**Exit condition:** App starts locally and the first viewport communicates the product clearly.

### Phase 2: Live Channel3 product search

- Implement a server-side search endpoint.
- Normalize provider responses and validate result fields.
- Display real product cards, prices when present, and actual retailer links.
- Add loading, empty, timeout, and provider-error states.

**Exit condition:** A user can search successfully and see real source-backed results.

### Phase 3: Gemini shopping intent and explanations

- Integrate `@google/genai` or Google's current officially recommended SDK.
- Define and validate structured intent output.
- Connect parsed intent to Channel3 search.
- Generate concise explanations grounded in returned product facts.
- Add model timeout and invalid-output handling.

**Exit condition:** User request → validated intent → real product results → grounded explanation works end to end.

### Phase 4: Purchase Policy Engine

- Add max budget and max per-item controls.
- Add server-side basket calculations and policy validation.
- Test overspend, invalid quantities, altered browser prices, missing catalog IDs, and currency handling.

**Exit condition:** The backend blocks rule violations even when the client is manipulated.

### Phase 5: PayPal Sandbox checkout

- Create a small server-controlled demo catalog.
- Integrate the currently documented stable PayPal checkout flow.
- Create and capture sandbox orders server-side as documented.
- Verify the resulting order state and amount.
- Handle cancellation, failure, retries, and repeated requests.

**Exit condition:** A sandbox buyer can complete a real test flow and only verified captures show success.

### Phase 6: End-to-end polish and QA

- Join the shopping, product, policy, and checkout experiences.
- Complete empty/error/loading states.
- Check responsive layout and accessibility.
- Verify secret handling and repository hygiene.
- Test on the deployed URL.

**Exit condition:** The core flow passes the test matrix in this document.

### Phase 7: Submission package

- Finish README, setup guide, environment template, and open-source license.
- Deploy the demo if possible.
- Prepare and upload a YouTube walkthrough shorter than three minutes, if required by the current submission form.
- Write the Devpost project description and ensure claims match actual functionality.
- Submit before the official deadline, with a safety buffer.

**Exit condition:** All submission fields, source links, demo access, video, and documentation are checked.

## 16. Test Plan and Release Acceptance Criteria

### Functional tests

- Valid natural-language request returns validated intent.
- Missing or unclear requirements are handled gracefully.
- Channel3 returns real results for the main demo prompts when results exist.
- Product card data corresponds to the returned provider data.
- Retailer links point to the real returned destination.
- AI explanations do not invent prices or specifications.
- Budget values and currency are displayed consistently.
- Over-budget basket is blocked server-side.
- Client price manipulation does not change the trusted amount.
- Demo catalog checkout can be approved in PayPal Sandbox.
- Failed or cancelled payment never appears as successful.
- Verified capture produces a coherent confirmation state.

### Visual and UX tests

- The AI request composer is visible in the hero on first load.
- The logo asset is correct and not distorted.
- Primary CTA is clearly identifiable through orange, text, and layout.
- Black/gray dominance is maintained; orange and semantic colors remain restrained.
- Product cards have consistent visual hierarchy.
- Mobile layout works at 360px, 390px, tablet, and desktop widths.
- No horizontal overflow, clipped buttons, or overlapping panels.
- Keyboard focus and error states are visible.
- Reduced-motion preference is respected.
- The interface never uses fake trust badges or invented social proof.

### Security tests

- Secret variables do not appear in client bundles.
- `.env.local` and real environment files are ignored by Git.
- API inputs are validated.
- Server uses trusted catalog data to calculate payment amounts.
- Unauthorized or malformed requests cannot create arbitrary-price orders.
- Payment success is derived from verified server-side response, not the browser's claim.
- Error output does not reveal credentials or sensitive stack traces.

### Release gate

Do not call the project finished until:

- `npm run build` succeeds.
- Lint, type-check, and available tests pass.
- At least one successful end-to-end PayPal Sandbox checkout has been observed.
- At least one Channel3 search and one Gemini request have been tested with real credentials.
- The hosted demo works, or the README gives complete, tested run instructions.
- A clean clone can be installed using the lockfile and documented steps.
- The public repository includes the license and all required source assets.

## 17. Demo Script (Under Three Minutes)

The video should demonstrate the actual working app. Suggested timing:

1. **0:00–0:20 — Problem and promise:** Introduce the frustration of comparing products while trying to stay within a budget.
2. **0:20–0:45 — Natural-language request:** Enter a realistic study-setup request and budget.
3. **0:45–1:15 — Real product discovery:** Show Channel3 results and explain why specific items match, grounded in retrieved facts.
4. **1:15–1:40 — Spending rules:** Show the basket total and deliberately exceed the permitted budget; demonstrate that the policy engine blocks checkout.
5. **1:40–2:25 — PayPal Sandbox:** Use a clearly labelled demo catalog item, approve the sandbox payment, and show the verified result.
6. **2:25–2:50 — Closing value:** Summarize how SpendPilot combines useful AI, real product data, spending controls, and PayPal checkout.

Keep the recording focused. Do not show API keys, secret dashboards, private account information, or unverified claims. The video must match the behavior of the submitted build.

## 18. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Channel3 has no matching results for a query | Use several tested demo queries; show a real empty state rather than invented products. Keep a clearly labelled sample catalog for payment demonstration. |
| Gemini output is malformed or inaccurate | Use structured output, schema validation, grounding in retrieved product data, and deterministic rules. |
| API quotas or credits run low | Cache safe non-sensitive search results for the demo where permitted, avoid duplicate model calls, and monitor quotas. Do not hard-code fake success responses. |
| PayPal integration takes longer than expected | Implement one fixed-price sample item first and prove the entire sandbox flow before adding a cart. |
| Product offer data lacks shipping/tax | Explicitly show that these costs are unknown or excluded. Never claim the budget includes them when not calculated. |
| UI is polished but nonfunctional | Integrate and test each API as its own milestone before heavy visual polish. |
| Dependency changes break the application | Pin working compatible versions in the lockfile, review changes, run audit/build/tests after updates. |
| Credentials leak in source control | Use local environment files, deployment secrets, `.gitignore`, and a pre-submission repository check. |
| Judges confuse sandbox checkout with real payment | Label the demo merchant and sandbox transaction clearly in the UI, video, and README. |
| Scope grows too large | Protect the MVP features and reject nonessential additions until all release criteria pass. |

## 19. Definition of Done

SpendPilot AI is ready for submission when a first-time visitor can:

1. Understand the product's purpose from the hero section.
2. Submit a real shopping request.
3. See Gemini-generated structured intent used safely by the app.
4. Browse genuine Channel3 product data with retailer links.
5. Read explanations based on retrieved facts.
6. Understand their budget and purchase policy status.
7. See an over-budget checkout correctly blocked by the backend.
8. Complete a PayPal Sandbox payment for a controlled demo catalog item.
9. See a verified outcome without false success messages.
10. Access the public demo or follow the repository instructions to run the application.

In addition, all API keys must remain private, the supplied logo must be used correctly, current stable dependencies must be verified, the repository must have an open-source license, and the Devpost materials must accurately describe the project.

## 20. Instructions for Antigravity and AI Coding Agents

Treat this document as the source of truth for product decisions. Work in small phases and preserve working code.

Before each phase:

1. Inspect the repository and current state.
2. Summarize the proposed changes and files.
3. Confirm the latest official integration docs for any SDK being introduced.
4. Implement only the current phase.
5. Run relevant lint, type checks, tests, and a production build as appropriate.
6. Report exactly what was changed, what was tested, and what remains blocked.

Never:

- Claim an API or checkout integration works without testing it.
- invent API credentials or put secrets in source files.
- Substitute mocked responses for real integrations without labelling the fallback as demo data.
- Let Gemini set authoritative product prices, calculate trusted payment totals, or declare a payment successful.
- Use external retailer products as PayPal checkout items without a verified, authorized flow.
- Install unmaintained, incompatible, or unnecessary packages without review.
- Run broad dependency upgrades immediately before submission without regression testing.
- Replace the supplied logo or ignore the black/gray/orange palette.
- Add features that delay the working end-to-end core journey.

## 21. Official References

Verify these sources again before implementation and submission because API specifications, SDK recommendations, prizes, and deadlines can change.

- PayPal AI Hackathon official rules: https://paypalaihackathon.devpost.com/rules
- PayPal AI Hackathon main page and judging criteria: https://paypalaihackathon.devpost.com/
- Channel3 sponsor challenge and event credit details: https://paypalaihackathon.devpost.com/details/channel3
- Channel3 developer resources: https://trychannel3.com/developers
- PayPal developer documentation: https://developer.paypal.com/
- PayPal JavaScript SDK setup: https://developer.paypal.com/sdk/js/set-up/
- PayPal Checkout integration: https://developer.paypal.com/checkout/integrate
- Google Gen AI SDK libraries: https://ai.google.dev/gemini-api/docs/libraries
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Next.js documentation: https://nextjs.org/docs

---

**End of PRD**
