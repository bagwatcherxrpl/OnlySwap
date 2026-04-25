# OnlySwap

OnlySwap is a minimal XRPL swap MVP focused on one flow: select assets, quote best route, review, sign, and track result.

## Tech Stack

- Next.js App Router
- React + TypeScript (strict)
- Tailwind CSS
- Zustand
- XRPL JavaScript library
- Vitest

## Architecture

- `app/`: page shell and API route handlers
- `components/`: reusable presentational UI
- `features/swap/`: swap state machine, flow components, transaction preparation
- `features/wallet/`: wallet adapter interfaces and implementations
- `lib/assets/`: XRPL asset modeling/parsing and curated token list
- `lib/fees/`: fee and drops math utilities
- `lib/xrpl/`: quote and route classification services
- `lib/format/`: display formatting helpers

## Environment Variables

Copy `.env.example` to `.env.local` and set:

- `XRPL_RPC_URL`: XRPL endpoint (defaults to `wss://xrplcluster.com`)
- `ONLYSWAP_TREASURY_WALLET`: fee recipient wallet
- `ONLYSWAP_SOURCE_TAG`: numeric source tag attached to prepared swap payments
- `XAMAN_API_KEY`: Xaman developer API key (server-side only)
- `XAMAN_API_SECRET`: Xaman developer API secret (server-side only)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: Reown WalletConnect project id used by Joey

## Wallet Integration Approach

Wallet logic is isolated behind adapter interfaces:

- `connect()`
- `disconnect()`
- `getAccount()`
- `signAndSubmitBundle(...)`
- `signAndSubmit(...)`
- `getCapabilities()`

Current adapters:

- Xaman (server-side payload flow via backend routes)
- Joey Wallet

Joey uses a provider-bridge strategy and calls injected wallet providers when available.
Xaman uses backend-created payloads, opens the deep-link, and polls signing status through API routes.

## Fee Model

OnlySwap fee is always in XRP:

`feeXRP = max(0.005 XRP, 0.1% of input volume in XRP terms)`

Rules implemented:

- Convert XRP to drops with ceiling
- Never undercharge from rounding
- Use XRP-equivalent estimate for non-XRP input

## Asset Parsing Rules

Supported identifiers:

- `XRP`
- `currency.issuer`
- `currency.issuer_xrp` (suffix stripped before parsing)

Validation:

- trims whitespace
- validates issuer as XRPL classic address
- validates currency as 3-6 uppercase letters or 40-char hex
- fails safely with explicit parse errors

## Security Considerations

- Server-side API input validation via Zod
- Defensive parsing and fail-safe responses
- No secret exposure to client
- Fee and transaction-critical values recomputed server-side in prepare route
- Duplicate submission prevention through transaction state handling

## What Is Still Mocked / TODO

- Some wallet providers expose non-standard method names; add explicit per-wallet SDK wrappers for guaranteed compatibility across all environments.
- Quote routing currently uses safe live signals (network fee + AMM rate hints) plus deterministic fallback; add full pathfinding/DEX depth aggregation for production-grade best execution.
- Add end-to-end integration tests with real wallet-provider mocks and XRPL testnet transaction replay.

The architecture is prepared for these integrations and keeps trust boundaries server-side for transaction preparation.

## Development

- `npm run dev`
- `npm run lint`
- `npm run test`
