# dmrv_ledger — Solana/Anchor outline (Phase 2 groundwork)

**Status: outline only.** Not compiled (no Rust/Anchor toolchain was available when written), no tests, not
audited, not deployed, program id is a placeholder. Chain choice is still formally deferred until after the
pilot; this is here so the data model is ready if Solana is picked.

## What it does
- `initialize` — creates the global `LedgerState` PDA (`["ledger"]`) with a fixed authority.
- `log_receipt(user, co2_avoided_grams, receipt_hash)` — authority only. Creates a `ReceiptRecord` PDA
  (`["receipt", receipt_hash]`) so a hash can be logged once; adds to the global total; emits `CarbonDisplaced`.

## How it maps to the off-chain data
| On-chain | Source in Postgres |
|---|---|
| `receipt_hash` (32 bytes) | `receipts.image_sha256` (hex → bytes) |
| `co2_avoided_grams` | `round(receipts.co2e_kg * 1000)` |
| `user` | **no equivalent yet** — wallets are custodial Postgres balances, there is no user pubkey |

## Open decisions / known gaps
1. **User pubkey.** Either wait for the embedded wallet (Privy etc.) or log a GasBack-controlled pseudonymous
   key per user. Putting a user's own wallet next to dated purchases on a public chain is a privacy choice for
   counsel (NDPR) — hash or pseudonymise first.
2. **Per-receipt vs per-batch anchoring.** Per receipt costs rent for every PDA. `carbon_batches.receipts_digest`
   (sha256 over the batch's sorted image hashes, migration 003) allows anchoring ONE hash per ~1 tCO2e batch
   instead and keeping receipts off-chain. Likely cheaper; decide with the registry requirements.
3. **Single authority key** is a single point of compromise: use a multisig / hardware key before mainnet.
4. Not covered: authority rotation, pausing, closing accounts, an off-chain indexer, tests, an audit.

## Build (once the toolchain exists)
```
anchor keys list            # then paste the id into lib.rs declare_id! and Anchor.toml
anchor build && anchor test
```
