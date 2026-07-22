//! RoundBlock Protocol — League Escrow program.
//!
//! An escrow-first MVP for a crypto-native fantasy football platform on Solana.
//! A league admin creates a league with a fixed entry fee; players deposit that
//! fee into a per-league escrow PDA; the admin locks entries; an admin/oracle
//! authority resolves the league by declaring winner(s) and their payout split;
//! and winners claim their share directly from the escrow.
//!
//! Currency: native SOL (lamports). This deliberately trades off multi-currency
//! support for simplicity — no SPL token / associated-token-account plumbing or
//! token-program CPIs. Moving to USDC later means holding an SPL token vault PDA
//! and swapping the system-program transfers for `token::transfer` CPIs; the
//! account model and access control below carry over unchanged.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("AHw96CksnrkLDHkjQUsRGPbHPpj8Xjyzh7BFrViRt6sc");

#[program]
pub mod league_escrow {
    use super::*;

    /// Initialize a new league escrow.
    ///
    /// `league_id` lets a single admin run many independent leagues (it is part
    /// of the league PDA seeds). `oracle` is a secondary authority allowed to
    /// resolve the league (e.g. an off-chain results oracle) in addition to the
    /// admin.
    pub fn create_league(
        ctx: Context<CreateLeague>,
        league_id: u64,
        entry_fee: u64,
        max_players: u16,
        oracle: Pubkey,
    ) -> Result<()> {
        require!(entry_fee > 0, EscrowError::InvalidEntryFee);
        require!(max_players >= 2, EscrowError::InvalidMaxPlayers);

        let league = &mut ctx.accounts.league;
        league.admin = ctx.accounts.admin.key();
        league.oracle = oracle;
        league.league_id = league_id;
        league.entry_fee = entry_fee;
        league.max_players = max_players;
        league.player_count = 0;
        league.total_pot = 0;
        league.status = LeagueStatus::Open;
        league.winners = Vec::new();
        league.bump = ctx.bumps.league;

        emit!(LeagueCreated {
            league: league.key(),
            admin: league.admin,
            oracle: league.oracle,
            entry_fee,
            max_players,
        });
        Ok(())
    }

    /// Deposit the entry fee and register the signer as a player.
    ///
    /// Uses an `init` per-player [`PlayerEntry`] PDA, so a wallet can only join a
    /// given league once (a second attempt fails at account creation).
    pub fn join_league(ctx: Context<JoinLeague>) -> Result<()> {
        require!(
            ctx.accounts.league.status == LeagueStatus::Open,
            EscrowError::LeagueNotOpen
        );
        require!(
            ctx.accounts.league.player_count < ctx.accounts.league.max_players,
            EscrowError::LeagueFull
        );

        let entry_fee = ctx.accounts.league.entry_fee;

        // Move the entry fee into the escrow (the league PDA itself holds the
        // pot on top of its rent-exempt reserve). The player wallet is
        // system-owned, so a plain system-program transfer is valid here.
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.league.to_account_info(),
                },
            ),
            entry_fee,
        )?;

        let league = &mut ctx.accounts.league;
        league.player_count = league
            .player_count
            .checked_add(1)
            .ok_or(EscrowError::MathOverflow)?;
        league.total_pot = league
            .total_pot
            .checked_add(entry_fee)
            .ok_or(EscrowError::MathOverflow)?;

        let league_key = league.key();
        let player_count = league.player_count;

        let entry = &mut ctx.accounts.player_entry;
        entry.league = league_key;
        entry.player = ctx.accounts.player.key();
        entry.deposited = entry_fee;
        entry.bump = ctx.bumps.player_entry;

        emit!(PlayerJoined {
            league: league_key,
            player: entry.player,
            player_count,
        });
        Ok(())
    }

    /// Close entries. Only the admin can lock, and only while the league is open.
    pub fn lock_league(ctx: Context<LockLeague>) -> Result<()> {
        let league = &mut ctx.accounts.league;
        require!(
            league.status == LeagueStatus::Open,
            EscrowError::LeagueNotOpen
        );
        league.status = LeagueStatus::Locked;

        emit!(LeagueLocked {
            league: league.key(),
            player_count: league.player_count,
            total_pot: league.total_pot,
        });
        Ok(())
    }

    /// Declare winner(s) and their payout split. Callable by the admin or the
    /// configured oracle authority, and only once the league is locked.
    ///
    /// The sum of `amounts` must not exceed the collected pot. Winners are stored
    /// on the league account so each can later `claim_payout` exactly once.
    pub fn resolve_league(
        ctx: Context<ResolveLeague>,
        winners: Vec<Pubkey>,
        amounts: Vec<u64>,
    ) -> Result<()> {
        let authority = ctx.accounts.authority.key();
        let league = &mut ctx.accounts.league;

        require!(
            authority == league.admin || authority == league.oracle,
            EscrowError::Unauthorized
        );
        require!(
            league.status == LeagueStatus::Locked,
            EscrowError::LeagueNotLocked
        );
        require!(!winners.is_empty(), EscrowError::NoWinners);
        require!(
            winners.len() == amounts.len(),
            EscrowError::WinnerAmountMismatch
        );
        require!(
            winners.len() as u16 <= league.player_count,
            EscrowError::TooManyWinners
        );

        let mut total: u64 = 0;
        for amount in amounts.iter() {
            total = total.checked_add(*amount).ok_or(EscrowError::MathOverflow)?;
        }
        require!(total <= league.total_pot, EscrowError::PayoutExceedsPot);

        let mut shares: Vec<WinnerShare> = Vec::with_capacity(winners.len());
        for (i, winner) in winners.iter().enumerate() {
            require!(amounts[i] > 0, EscrowError::InvalidPayout);
            require!(
                !shares.iter().any(|s| s.player == *winner),
                EscrowError::DuplicateWinner
            );
            shares.push(WinnerShare {
                player: *winner,
                amount: amounts[i],
                claimed: false,
            });
        }

        league.winners = shares;
        league.status = LeagueStatus::Resolved;

        emit!(LeagueResolved {
            league: league.key(),
            total_payout: total,
            winner_count: winners.len() as u16,
        });
        Ok(())
    }

    /// Withdraw the signer's payout from escrow. Each winner can claim once.
    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        let player_key = ctx.accounts.player.key();
        let league = &mut ctx.accounts.league;

        require!(
            league.status == LeagueStatus::Resolved,
            EscrowError::LeagueNotResolved
        );

        let idx = league
            .winners
            .iter()
            .position(|s| s.player == player_key)
            .ok_or(EscrowError::NotAWinner)?;
        require!(!league.winners[idx].claimed, EscrowError::AlreadyClaimed);

        let amount = league.winners[idx].amount;

        // The league PDA is program-owned, so lamports must be moved by direct
        // balance manipulation (a system-program transfer only works when the
        // source is system-owned). Keep the rent-exempt reserve intact.
        let league_ai = league.to_account_info();
        let rent_reserve = Rent::get()?.minimum_balance(league_ai.data_len());
        let escrow_balance = league_ai.lamports();
        require!(
            escrow_balance
                .checked_sub(amount)
                .ok_or(EscrowError::MathOverflow)?
                >= rent_reserve,
            EscrowError::InsufficientEscrow
        );

        league.winners[idx].claimed = true;
        league.total_pot = league
            .total_pot
            .checked_sub(amount)
            .ok_or(EscrowError::MathOverflow)?;

        **league_ai.try_borrow_mut_lamports()? = escrow_balance
            .checked_sub(amount)
            .ok_or(EscrowError::MathOverflow)?;
        let player_ai = ctx.accounts.player.to_account_info();
        let player_balance = player_ai.lamports();
        **player_ai.try_borrow_mut_lamports()? = player_balance
            .checked_add(amount)
            .ok_or(EscrowError::MathOverflow)?;

        emit!(PayoutClaimed {
            league: league.key(),
            player: player_key,
            amount,
        });
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(league_id: u64, entry_fee: u64, max_players: u16)]
pub struct CreateLeague<'info> {
    #[account(
        init,
        payer = admin,
        space = League::space(max_players),
        seeds = [b"league", admin.key().as_ref(), &league_id.to_le_bytes()],
        bump
    )]
    pub league: Account<'info, League>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinLeague<'info> {
    #[account(
        mut,
        seeds = [b"league", league.admin.as_ref(), &league.league_id.to_le_bytes()],
        bump = league.bump
    )]
    pub league: Account<'info, League>,
    #[account(
        init,
        payer = player,
        space = 8 + PlayerEntry::LEN,
        seeds = [b"entry", league.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_entry: Account<'info, PlayerEntry>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LockLeague<'info> {
    #[account(
        mut,
        has_one = admin @ EscrowError::Unauthorized,
        seeds = [b"league", league.admin.as_ref(), &league.league_id.to_le_bytes()],
        bump = league.bump
    )]
    pub league: Account<'info, League>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveLeague<'info> {
    #[account(
        mut,
        seeds = [b"league", league.admin.as_ref(), &league.league_id.to_le_bytes()],
        bump = league.bump
    )]
    pub league: Account<'info, League>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(
        mut,
        seeds = [b"league", league.admin.as_ref(), &league.league_id.to_le_bytes()],
        bump = league.bump
    )]
    pub league: Account<'info, League>,
    #[account(mut)]
    pub player: Signer<'info>,
}

#[account]
pub struct League {
    /// League creator; can lock and resolve.
    pub admin: Pubkey,
    /// Secondary authority allowed to resolve (e.g. results oracle).
    pub oracle: Pubkey,
    /// Discriminator allowing one admin to run multiple leagues.
    pub league_id: u64,
    /// Entry fee per player, in lamports.
    pub entry_fee: u64,
    /// Maximum number of players allowed to join.
    pub max_players: u16,
    /// Number of players that have joined so far.
    pub player_count: u16,
    /// Lifecycle status.
    pub status: LeagueStatus,
    /// Total lamports collected from entry fees (excludes rent reserve).
    pub total_pot: u64,
    /// Winner payout table, populated on resolve.
    pub winners: Vec<WinnerShare>,
    /// PDA bump.
    pub bump: u8,
}

impl League {
    /// Fixed field bytes (excludes the 8-byte discriminator and the winners vec).
    pub const BASE_LEN: usize = 32 + 32 + 8 + 8 + 2 + 2 + 1 + 8 + 1;

    /// Account size, sized to hold up to `max_players` winner shares.
    pub fn space(max_players: u16) -> usize {
        8 + Self::BASE_LEN + 4 + (max_players as usize) * WinnerShare::LEN
    }
}

#[account]
pub struct PlayerEntry {
    pub league: Pubkey,
    pub player: Pubkey,
    pub deposited: u64,
    pub bump: u8,
}

impl PlayerEntry {
    pub const LEN: usize = 32 + 32 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum LeagueStatus {
    Open,
    Locked,
    Resolved,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub struct WinnerShare {
    pub player: Pubkey,
    pub amount: u64,
    pub claimed: bool,
}

impl WinnerShare {
    pub const LEN: usize = 32 + 8 + 1;
}

#[event]
pub struct LeagueCreated {
    pub league: Pubkey,
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub entry_fee: u64,
    pub max_players: u16,
}

#[event]
pub struct PlayerJoined {
    pub league: Pubkey,
    pub player: Pubkey,
    pub player_count: u16,
}

#[event]
pub struct LeagueLocked {
    pub league: Pubkey,
    pub player_count: u16,
    pub total_pot: u64,
}

#[event]
pub struct LeagueResolved {
    pub league: Pubkey,
    pub total_payout: u64,
    pub winner_count: u16,
}

#[event]
pub struct PayoutClaimed {
    pub league: Pubkey,
    pub player: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum EscrowError {
    #[msg("Entry fee must be greater than zero")]
    InvalidEntryFee,
    #[msg("Max players must be at least 2")]
    InvalidMaxPlayers,
    #[msg("League is not accepting entries")]
    LeagueNotOpen,
    #[msg("League is full")]
    LeagueFull,
    #[msg("League must be locked before it can be resolved")]
    LeagueNotLocked,
    #[msg("League has not been resolved yet")]
    LeagueNotResolved,
    #[msg("Caller is not authorized for this action")]
    Unauthorized,
    #[msg("No winners were provided")]
    NoWinners,
    #[msg("Winners and amounts length mismatch")]
    WinnerAmountMismatch,
    #[msg("More winners than players in the league")]
    TooManyWinners,
    #[msg("A payout amount must be greater than zero")]
    InvalidPayout,
    #[msg("Duplicate winner in payout table")]
    DuplicateWinner,
    #[msg("Total payout exceeds the collected pot")]
    PayoutExceedsPot,
    #[msg("Caller is not a winner of this league")]
    NotAWinner,
    #[msg("Payout already claimed")]
    AlreadyClaimed,
    #[msg("Escrow balance too low to cover payout")]
    InsufficientEscrow,
    #[msg("Checked arithmetic overflow/underflow")]
    MathOverflow,
}
