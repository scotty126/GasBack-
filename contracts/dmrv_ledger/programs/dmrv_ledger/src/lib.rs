//! GasBack dMRV ledger — OUTLINE. Written for Anchor 0.30; NOT compiled, tested, audited or deployed.
//!
//! Purpose: an append-only, publicly auditable log of verified fuel-displacement receipts.
//!   * `initialize`  creates the single global ledger account and fixes its authority.
//!   * `log_receipt` (authority only) records one receipt and adds its CO2e to the global total.
//!     Each receipt gets its own PDA seeded by the receipt hash, so the SAME hash can never be
//!     logged twice (the second `init` fails) — on-chain duplicate protection.
//!   * Every log emits `CarbonDisplaced`, the event auditors/indexers follow.
//!
//! The off-chain app (Postgres) stays the source of truth for rewards; this program only anchors
//! evidence. Receipt data on-chain is limited to a hash, grams of CO2e and a pubkey — no photo, no
//! invoice number, no phone/email.

use anchor_lang::prelude::*;

// PLACEHOLDER (the System Program id, which is a valid pubkey). Replace with the real program id
// from `anchor keys list` before the first deploy.
declare_id!("11111111111111111111111111111111");

#[program]
pub mod dmrv_ledger {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let ledger = &mut ctx.accounts.ledger;
        ledger.authority = ctx.accounts.authority.key();
        ledger.total_co2_avoided_grams = 0;
        ledger.receipts_logged = 0;
        ledger.bump = ctx.bumps.ledger;
        Ok(())
    }

    pub fn log_receipt(
        ctx: Context<LogReceipt>,
        user: Pubkey,
        co2_avoided_grams: u64,
        receipt_hash: [u8; 32],
    ) -> Result<()> {
        require!(co2_avoided_grams > 0, DmrvError::ZeroAmount);

        let now = Clock::get()?.unix_timestamp;

        let record = &mut ctx.accounts.record;
        record.user = user;
        record.co2_avoided_grams = co2_avoided_grams;
        record.receipt_hash = receipt_hash;
        record.logged_at = now;
        record.bump = ctx.bumps.record;

        let ledger = &mut ctx.accounts.ledger;
        ledger.total_co2_avoided_grams = ledger
            .total_co2_avoided_grams
            .checked_add(co2_avoided_grams)
            .ok_or(DmrvError::Overflow)?;
        ledger.receipts_logged = ledger.receipts_logged.checked_add(1).ok_or(DmrvError::Overflow)?;

        emit!(CarbonDisplaced {
            user,
            co2_avoided_grams,
            receipt_hash,
            total_co2_avoided_grams: ledger.total_co2_avoided_grams,
            timestamp: now,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + LedgerState::INIT_SPACE,
        seeds = [b"ledger"],
        bump
    )]
    pub ledger: Account<'info, LedgerState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(user: Pubkey, co2_avoided_grams: u64, receipt_hash: [u8; 32])]
pub struct LogReceipt<'info> {
    #[account(
        mut,
        seeds = [b"ledger"],
        bump = ledger.bump,
        has_one = authority @ DmrvError::Unauthorized
    )]
    pub ledger: Account<'info, LedgerState>,
    /// One PDA per receipt hash: `init` fails if this hash was already logged.
    #[account(
        init,
        payer = authority,
        space = 8 + ReceiptRecord::INIT_SPACE,
        seeds = [b"receipt", receipt_hash.as_ref()],
        bump
    )]
    pub record: Account<'info, ReceiptRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct LedgerState {
    pub authority: Pubkey,
    pub total_co2_avoided_grams: u64,
    pub receipts_logged: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReceiptRecord {
    pub user: Pubkey,
    pub co2_avoided_grams: u64,
    pub receipt_hash: [u8; 32],
    pub logged_at: i64,
    pub bump: u8,
}

#[event]
pub struct CarbonDisplaced {
    pub user: Pubkey,
    pub co2_avoided_grams: u64,
    pub receipt_hash: [u8; 32],
    pub total_co2_avoided_grams: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum DmrvError {
    #[msg("Only the ledger authority can log receipts")]
    Unauthorized,
    #[msg("CO2 amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
}
