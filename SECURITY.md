# Security Policy

## Supported Versions

SpendPilot AI is currently an active hackathon demonstration project. Security updates are applied to the `main` branch.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security and responsible disclosure seriously. If you discover a potential vulnerability in SpendPilot AI:

1. **Do not** disclose the vulnerability publicly via GitHub Issues, Discussions, or social media.
2. Please open a private security advisory through the GitHub repository's **Security** tab (`Security` > `Advisories` > `New draft security advisory`), or contact the maintainers directly via private repository channels.
3. Include detailed steps to reproduce the issue, along with sample requests, affected endpoints, or environment details.

We will acknowledge receipt of your vulnerability report within 48 hours and work diligently to validate and address any confirmed concerns.

## Security Practices in SpendPilot AI

- **Server-Side API Execution**: All Gemini API keys, Channel3 API keys, and PayPal REST Client Secrets are strictly stored and accessed server-side in Node.js runtime environments. They are never exposed in browser client bundles or public API responses.
- **Authoritative Payment Verification**: Product pricing and merchant recipient IDs are calculated and validated strictly on the server before dispatching orders to the PayPal Orders v2 API.
- **PayPal Sandbox Only**: The application defaults to and enforces PayPal Sandbox mode (`https://api-m.sandbox.paypal.com`). Live credentials and live transactions are never executed.
- **Input Validation**: All incoming API requests are validated with schema checks to reject unexpected inputs, malformed types, and parameter manipulation.

