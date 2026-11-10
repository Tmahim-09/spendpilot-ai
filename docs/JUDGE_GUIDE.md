# SpendPilot AI: Hackathon Judge Evaluation Guide

Welcome judges! This guide enables you to evaluate the SpendPilot AI application and its core technical innovations in under five minutes.

---

## 1. What SpendPilot AI Does

SpendPilot AI is a conversational shopping companion built for the **PayPal AI Hackathon 2026**. It solves three major pain points in online shopping:

1. **Conversational Understanding**: Shoppers express complex multi-attribute needs in natural language without filling out rigid filter forms.
2. **Grounded Product Discovery & Comparison**: Powered by Channel3, SpendPilot retrieves genuine multi-merchant offers, extracts technical specs, and generates side-by-side trade-off comparisons without hallucinations.
3. **Multi-Seller Checkout**: SpendPilot demonstrates multi-merchant cart checkout where a single buyer approval pays multiple independent sellers via the PayPal Orders v2 API.

---

## 2. Where to Access the Demo

- **Hosted Web Demo**: [Live Vercel Deployment](https://spendpilot-ai.vercel.app) *(or your deployed Vercel URL)*
- **PayPal Multi-Seller Sandbox Demo**: [Live Demo Checkout Page](https://spendpilot-ai.vercel.app/paypal-demo)
- **Local Run**: If evaluating locally, see [Running Locally](#7-running-locally-optional).

---

## 3. Recommended 5-Minute Evaluation Walkthrough

### Step 1: Open-Category Shopping Query (0:00 - 1:00)
1. In the chat input, type a natural shopping request:
   > *"I need a laptop for professional web development under $1,200"*
2. **Observe**:
   - SpendPilot identifies the category (`laptop`), purpose (`web development`), and budget limit (`$1,200`).
   - It asks a relevant clarification question (e.g. Preferred Operating System) with clickable options.

### Step 2: Test Conversational Flexibility & Delegation (1:00 - 2:00)
1. Instead of picking an option, type:
   > *"u suggest"* (or *"you choose"*)
2. **Observe**:
   - SpendPilot enters the thinking state (`SpendPilot is thinking...` with bouncing dots).
   - It warmly explains that it will recommend top all-around options for your need, and reminds you that you can refine anytime.
   - It queries Channel3 and returns verified laptops matching your budget.

### Step 3: Spec Comparison & Product Selection (2:00 - 3:00)
1. View the retrieved laptops. Click **"Compare"** on 2 to 4 products.
2. **Observe**:
   - The side-by-side comparison workspace displays structured spec rows (Display, Processor, Memory, Storage, Battery Life).
   - SpendPilot highlights key trade-offs and best-match recommendations.
3. Click **"Select Product"** on your preferred laptop.
4. **Observe**:
   - The laptop is added to **My Shopping List** in the persistent cart workspace.

### Step 4: Multi-Item Shopping & Task Switching (3:00 - 3:45)
1. In the chat, type a second, completely different request:
   > *"I also need noise-cancelling headphones under $200"*
2. **Observe**:
   - SpendPilot creates a new shopping task, preserving your selected laptop in the cart without cross-contaminating attributes (the laptop's specs do not leak into headphones).
   - Select a pair of headphones to add them to your cart.

### Step 5: PayPal Multi-Seller Sandbox Demonstration (3:45 - 5:00)
1. Click **Cart** in the navigation bar (or navigate directly to `/paypal-demo`).
2. You will see a multi-seller cart with demo products from two distinct merchants:
   - **Seller A**: `SpendPilot Audio Lab` ($149.00)
   - **Seller B**: `SpendPilot Workspace Gear` ($89.00)
   - **Order Subtotal**: $238.00
3. Click the yellow **PayPal Checkout** button.
4. When the PayPal Sandbox window opens:
   - Log in with the Judge Sandbox Buyer Account *(provided in the hackathon submission portal)*:
     - **Email**: `sb-buyer@business.example.com` *(or your configured Sandbox Personal Buyer test account)*
     - **Password**: *(Sandbox buyer password)*
   - Click **Complete Purchase**.
5. **Observe**:
   - SpendPilot's server captures the split purchase units for each merchant.
   - The verified receipt displays separate capture transactions for Seller A and Seller B, proving genuine multi-seller split execution.

---

## 4. What the PayPal Multi-Seller Demo Proves

- **Server-Authoritative Orders v2**: The frontend never calculates totals or names payees. The server derives prices from catalog records and formats multiple `purchase_units` with designated `payee` merchant IDs.
- **Split Payment Capture**: Both sellers receive independent transaction IDs from PayPal with zero manual reconciliation.
- **Production Resilience**: Handles timeouts, captures verification, and status reconciliation safely.

---

## 5. What It Does Not Do & Demo Disclaimers

- **Channel3 Retailer Purchases**: Channel3 product cards link directly to external merchants (e.g. Best Buy, Apple, B&H). SpendPilot does **not** process bank payments for external retail sites; users check out directly on retailer sites.
- **Sandbox Funds**: The PayPal checkout demonstration runs exclusively on `api-m.sandbox.paypal.com` using mock virtual currency. No real bank accounts or credit cards are debited.

---

## 6. Known Demo Limitations

- **Channel3 API Rate Limits**: In peak hackathon evaluation, Channel3 live crawl queries may occasionally experience slight delays. SpendPilot provides cached fallback specifications if Channel3 rate limits are reached.
- **Sandbox Processing Speeds**: PayPal Sandbox API response times are subject to PayPal Sandbox server availability.

---

## 7. Running Locally (Optional)

If you prefer to run and audit SpendPilot locally:

```bash
# 1. Clone the repository
git clone https://github.com/Tmahim-09/spendpilot-ai.git
cd spendpilot-ai

# 2. Install dependencies with clean lockfile
npm ci

# 3. Configure local environment variables
cp .env.example .env.local
# Add your GEMINI_API_KEY, CHANNEL3_API_KEY, PAYPAL_CLIENT_ID, and PAYPAL_CLIENT_SECRET

# 4. Run tests and typecheck
npm run typecheck
npm run lint
npm test

# 5. Start development server
npm run dev
# Open http://localhost:3000 in your browser
```

