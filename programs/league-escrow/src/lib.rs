//! RoundBlock Protocol — League Escrow program.
//!
//! An escrow-first MVP for a crypto-native fantasy football platform on Solana.
//! A league admin creates a league with a fixed entry fee; players deposit that
//! fee into a per-league escrow PDA; the admin locks entries; an admin/oracle
//! authority resolves the league by declaring winner(s) and their payout split;
//! and winners claim their share directly from the escrow.
//!
//! Currency: a league is denominated in EITHER native SOL (lamports) OR an SPL
//! token (e.g. USDC), chosen at creation. The two paths are separate,
//! currency-specific instructions that share the same `League`/`PlayerEntry`
//! accounts and the same lifecycle/access control:
//!
//! * SOL path  — `create_league`, `join_league`, `claim_payout`. The `League`
//!   PDA itself custodies lamports on top of its rent-exempt reserve.
//! * SPL path  — `create_league_spl`, `join_league_spl`, `claim_payout_spl`.
//!   Funds live in an associated token account (the "vault") owned by the
//!   `League` PDA; deposits/payouts are `token::transfer` CPIs and use ATAs.
//!
//! `lock_league` and `resolve_league` move no funds and are shared by both.

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer as SplTransfer};

declare_id!("YG5dVJydevZcHJQtLNirYUseJtYQQoK83uPMznXVUbW");

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
        league.payment_mint = None;
        league.vault = Pubkey::default();
        league.winners = Vec::new();
        league.bump = ctx.bumps.league;

        emit!(LeagueCreated {
            league: league.key(),
            admin: league.admin,
            oracle: league.oracle,
            entry_fee,
            max_players,
            payment_mint: None,
        });
        Ok(())
    }

    /// Initialize a league denominated in an SPL token (e.g. USDC).
    ///
    /// Identical to [`create_league`] except `entry_fee` is in the token's base
    /// units and funds are escrowed in a program-owned associated token account
    /// (the vault) rather than in the league PDA's lamports.
    pub fn create_league_spl(
        ctx: Context<CreateLeagueSpl>,
        league_id: u64,
        entry_fee: u64,
        max_players: u16,
        oracle: Pubkey,
    ) -> Result<()> {
        require!(entry_fee > 0, EscrowError::InvalidEntryFee);
        require!(max_players >= 2, EscrowError::InvalidMaxPlayers);

        let mint_key = ctx.accounts.mint.key();
        let vault_key = ctx.accounts.vault.key();

        let league = &mut ctx.accounts.league;
        league.admin = ctx.accounts.admin.key();
        league.oracle = oracle;
        league.league_id = league_id;
        league.entry_fee = entry_fee;
        league.max_players = max_players;
        league.player_count = 0;
        league.total_pot = 0;
        league.status = LeagueStatus::Open;
        league.payment_mint = Some(mint_key);
        league.vault = vault_key;
        league.winners = Vec::new();
        league.bump = ctx.bumps.league;

        emit!(LeagueCreated {
            league: league.key(),
            admin: league.admin,
            oracle: league.oracle,
            entry_fee,
            max_players,
            payment_mint: Some(mint_key),
        });
        Ok(())
    }

    /// Deposit the entry fee and register the signer as a player.
    ///
    /// Uses an `init` per-player [`PlayerEntry`] PDA, so a wallet can only join a
    /// given league once (a second attempt fails at account creation).
    pub fn join_league(ctx: Context<JoinLeague>) -> Result<()> {
        require!(
            ctx.accounts.league.payment_mint.is_none(),
            EscrowError::WrongCurrency
        );
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

    /// Deposit the SPL-token entry fee and register the signer as a player.
    ///
    /// Transfers `entry_fee` base units from the player's ATA into the league
    /// vault. Like the SOL path, an `init`-ed per-player [`PlayerEntry`] PDA
    /// prevents joining twice.
    pub fn join_league_spl(ctx: Context<JoinLeagueSpl>) -> Result<()> {
        require!(
            ctx.accounts.league.status == LeagueStatus::Open,
            EscrowError::LeagueNotOpen
        );
        require!(
            ctx.accounts.league.player_count < ctx.accounts.league.max_players,
            EscrowError::LeagueFull
        );

        let entry_fee = ctx.accounts.league.entry_fee;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.player_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.player.to_account_info(),
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
        let league_key = ctx.accounts.league.key();

        require!(
            authority == ctx.accounts.league.admin
                || authority == ctx.accounts.league.oracle,
            EscrowError::Unauthorized
        );
        require!(
            ctx.accounts.league.status == LeagueStatus::Locked,
            EscrowError::LeagueNotLocked
        );
        require!(!winners.is_empty(), EscrowError::NoWinners);
        require!(
            winners.len() == amounts.len(),
            EscrowError::WinnerAmountMismatch
        );
        require!(
            winners.len() as u16 <= ctx.accounts.league.player_count,
            EscrowError::TooManyWinners
        );
        // One PlayerEntry PDA must be supplied per winner, in the same order.
        require!(
            ctx.remaining_accounts.len() == winners.len(),
            EscrowError::WinnerEntryMismatch
        );

        let mut total: u64 = 0;
        for amount in amounts.iter() {
            total = total.checked_add(*amount).ok_or(EscrowError::MathOverflow)?;
        }
        // Require exact full-pot allocation to prevent funds from becoming stuck.
        require!(
            total == ctx.accounts.league.total_pot,
            EscrowError::PayoutMustEqualPot
        );

        // Validate all winner entries before mutating league state.
        let mut shares: Vec<WinnerShare> = Vec::with_capacity(winners.len());
        for (i, winner) in winners.iter().enumerate() {
            require!(amounts[i] > 0, EscrowError::InvalidPayout);
            require!(
                !shares.iter().any(|s| s.player == *winner),
                EscrowError::DuplicateWinner
            );

            // Derive the expected PlayerEntry PDA and verify the supplied account.
            let expected_entry = Pubkey::find_program_address(
                &[b"entry", league_key.as_ref(), winner.as_ref()],
                &crate::ID,
            )
            .0;
            let entry_info = &ctx.remaining_accounts[i];
            require_keys_eq!(
                *entry_info.key,
                expected_entry,
                EscrowError::WinnerEntryMismatch
            );

            // Verify the account is owned by this program, then manually
            // deserialize it — avoids `Account::try_from` lifetime constraints
            // that conflict with the `#[program]` macro's dispatching.
            if entry_info.owner != &crate::ID {
                return err!(EscrowError::WinnerNotParticipant);
            }
            let data = entry_info
                .try_borrow_data()
                .map_err(|_| error!(EscrowError::WinnerNotParticipant))?;
            // Skip the 8-byte Anchor discriminator.
            let entry = PlayerEntry::try_deserialize(&mut &data[..])
                .map_err(|_| error!(EscrowError::WinnerNotParticipant))?;
            require_keys_eq!(
                entry.league,
                league_key,
                EscrowError::WinnerNotParticipant
            );
            require_keys_eq!(
                entry.player,
                *winner,
                EscrowError::WinnerNotParticipant
            );

            shares.push(WinnerShare {
                player: *winner,
                amount: amounts[i],
                claimed: false,
            });
        }

        let league = &mut ctx.accounts.league;
        league.winners = shares;
        league.status = LeagueStatus::Resolved;

        emit!(LeagueResolved {
            league: league_key,
            total_payout: total,
            winner_count: winners.len() as u16,
        });
        Ok(())
    }

    /// Withdraw the signer's payout from escrow. Each winner can claim once.
    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        let player_key = ctx.accounts.player.key();
        let league = &mut ctx.accounts.league;

        require!(league.payment_mint.is_none(), EscrowError::WrongCurrency);
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

        // Check the tracked pot is sufficient before mutating state.
        require!(
            league.total_pot >= amount,
            EscrowError::InsufficientEscrow
        );

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

    /// Cancel an under-subscribed or otherwise abandoned league. Admin only,
    /// and only while the league is still `Open` (before a lock). Players can
    /// then reclaim their deposits via [`refund`] / [`refund_spl`].
    pub fn cancel_league(ctx: Context<CancelLeague>) -> Result<()> {
        let league = &mut ctx.accounts.league;
        require!(
            league.status == LeagueStatus::Open,
            EscrowError::CancelNotAllowed
        );
        league.status = LeagueStatus::Cancelled;

        emit!(LeagueCancelled {
            league: league.key(),
            player_count: league.player_count,
            total_pot: league.total_pot,
        });
        Ok(())
    }

    /// Reclaim a player's SOL deposit from a cancelled league. Closes the
    /// caller's `PlayerEntry` PDA back to themselves (refunding its rent too),
    /// which also makes a second refund attempt impossible.
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let player_key = ctx.accounts.player.key();
        let league = &mut ctx.accounts.league;

        require!(league.payment_mint.is_none(), EscrowError::WrongCurrency);
        require!(
            league.status == LeagueStatus::Cancelled,
            EscrowError::LeagueNotCancelled
        );

        let amount = ctx.accounts.player_entry.deposited;

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

        emit!(PlayerRefunded {
            league: league.key(),
            player: player_key,
            amount,
        });
        Ok(())
    }

    /// Reclaim a player's SPL-token deposit from a cancelled league. Closes
    /// the caller's `PlayerEntry` PDA back to themselves (refunding its rent
    /// too), which also makes a second refund attempt impossible.
    pub fn refund_spl(ctx: Context<RefundSpl>) -> Result<()> {
        let player_key = ctx.accounts.player.key();
        let amount = ctx.accounts.player_entry.deposited;

        {
            let league = &mut ctx.accounts.league;
            require!(
                league.status == LeagueStatus::Cancelled,
                EscrowError::LeagueNotCancelled
            );
            require!(
                ctx.accounts.vault.amount >= amount,
                EscrowError::InsufficientEscrow
            );
            league.total_pot = league
                .total_pot
                .checked_sub(amount)
                .ok_or(EscrowError::MathOverflow)?;
        }

        let admin = ctx.accounts.league.admin;
        let league_id = ctx.accounts.league.league_id.to_le_bytes();
        let bump = ctx.accounts.league.bump;
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"league", admin.as_ref(), &league_id, &[bump]]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.player_token_account.to_account_info(),
                    authority: ctx.accounts.league.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        emit!(PlayerRefunded {
            league: ctx.accounts.league.key(),
            player: player_key,
            amount,
        });
        Ok(())
    }

    /// Withdraw the signer's SPL-token payout from the vault. Each winner can
    /// claim once. The league PDA signs the transfer out of the vault.
    pub fn claim_payout_spl(ctx: Context<ClaimPayoutSpl>) -> Result<()> {
        let player_key = ctx.accounts.player.key();

        let amount: u64;
        {
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

            amount = league.winners[idx].amount;
            // Verify vault holds enough tokens before mutating claimed state.
            require!(
                ctx.accounts.vault.amount >= amount,
                EscrowError::InsufficientEscrow
            );
            league.winners[idx].claimed = true;
            league.total_pot = league
                .total_pot
                .checked_sub(amount)
                .ok_or(EscrowError::MathOverflow)?;
        }

        // Sign the vault -> winner transfer with the league PDA seeds.
        let admin = ctx.accounts.league.admin;
        let league_id = ctx.accounts.league.league_id.to_le_bytes();
        let bump = ctx.accounts.league.bump;
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"league", admin.as_ref(), &league_id, &[bump]]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.player_token_account.to_account_info(),
                    authority: ctx.accounts.league.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        emit!(PayoutClaimed {
            league: ctx.accounts.league.key(),
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

#[derive(Accounts)]
pub struct CancelLeague<'info> {
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
pub struct Refund<'info> {
    #[account(
        mut,
        seeds = [b"league", league.admin.as_ref(), &league.league_id.to_le_bytes()],
        bump = league.bump
    )]
    pub league: Account<'info, League>,
    #[account(
        mut,
        close = player,
        seeds = [b"entry", league.key().as_ref(), player.key().as_ref()],
        bump = player_entry.bump
    )]
    pub player_entry: Account<'info, PlayerEntry>,
    #[account(mut)]
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct RefundSpl<'info> {
    #[account(
        mut,
        constraint = league.payment_mint == Some(mint.key()) @ EscrowError::WrongCurrency,
        seeds = [b"league", league.admin.as_ref(), &league.league_id.to_le_bytes()],
        bump = league.bump
    )]
    pub league: Account<'info, League>,
    #[account(
        mut,
        close = player,
        seeds = [b"entry", league.key().as_ref(), player.key().as_ref()],
        bump = player_entry.bump
    )]
    pub player_entry: Account<'info, PlayerEntry>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = league,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = player,
        associated_token::mint = mint,
        associated_token::authority = player,
    )]
    pub player_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(league_id: u64, entry_fee: u64, max_players: u16)]
pub struct CreateLeagueSpl<'info> {
    #[account(
        init,
        payer = admin,
        space = League::space(max_players),
        seeds = [b"league", admin.key().as_ref(), &league_id.to_le_bytes()],
        bump
    )]
    pub league: Account<'info, League>,
    pub mint: Account<'info, Mint>,
    /// Program-owned escrow vault (ATA of the league PDA) that holds the pot.
    #[account(
        init,
        payer = admin,
        associated_token::mint = mint,
        associated_token::authority = league,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinLeagueSpl<'info> {
    #[account(
        mut,
        constraint = league.payment_mint == Some(mint.key()) @ EscrowError::WrongCurrency,
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
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = league,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = player,
    )]
    pub player_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimPayoutSpl<'info> {
    #[account(
        mut,
        constraint = league.payment_mint == Some(mint.key()) @ EscrowError::WrongCurrency,
        seeds = [b"league", league.admin.as_ref(), &league.league_id.to_le_bytes()],
        bump = league.bump
    )]
    pub league: Account<'info, League>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = league,
    )]
    pub vault: Account<'info, TokenAccount>,
    /// Winner's ATA, created on demand if they don't have one yet.
    #[account(
        init_if_needed,
        payer = player,
        associated_token::mint = mint,
        associated_token::authority = player,
    )]
    pub player_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
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
    /// Total entry fees collected (lamports for SOL, base units for SPL).
    pub total_pot: u64,
    /// `None` for a native-SOL league; `Some(mint)` for an SPL-token league.
    pub payment_mint: Option<Pubkey>,
    /// Escrow vault (ATA of this PDA) for SPL leagues; default pubkey for SOL.
    pub vault: Pubkey,
    /// Winner payout table, populated on resolve.
    pub winners: Vec<WinnerShare>,
    /// PDA bump.
    pub bump: u8,
}

impl League {
    /// Fixed field bytes (excludes the 8-byte discriminator and the winners vec).
    /// admin + oracle + league_id + entry_fee + max_players + player_count
    /// + status + total_pot + payment_mint(Option<Pubkey>) + vault + bump.
    pub const BASE_LEN: usize = 32 + 32 + 8 + 8 + 2 + 2 + 1 + 8 + (1 + 32) + 32 + 1;

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
    Cancelled,
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
    pub payment_mint: Option<Pubkey>,
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

#[event]
pub struct LeagueCancelled {
    pub league: Pubkey,
    pub player_count: u16,
    pub total_pot: u64,
}

#[event]
pub struct PlayerRefunded {
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
    #[msg("Total payout must equal the full collected pot")]
    PayoutMustEqualPot,
    #[msg("Winner entry accounts do not match the winner list")]
    WinnerEntryMismatch,
    #[msg("Winner is not a participant in this league")]
    WinnerNotParticipant,
    #[msg("Caller is not a winner of this league")]
    NotAWinner,
    #[msg("Payout already claimed")]
    AlreadyClaimed,
    #[msg("Escrow balance too low to cover payout")]
    InsufficientEscrow,
    #[msg("Checked arithmetic overflow/underflow")]
    MathOverflow,
    #[msg("Instruction currency does not match the league's currency")]
    WrongCurrency,
    #[msg("League can only be cancelled while still open (before locking)")]
    CancelNotAllowed,
    #[msg("League must be cancelled before deposits can be refunded")]
    LeagueNotCancelled,
}
