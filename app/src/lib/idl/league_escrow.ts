/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/league_escrow.json`.
 */
export type LeagueEscrow = {
  "address": "AHw96CksnrkLDHkjQUsRGPbHPpj8Xjyzh7BFrViRt6sc",
  "metadata": {
    "name": "leagueEscrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "RoundBlock Protocol - league entry-fee escrow program"
  },
  "instructions": [
    {
      "name": "claimPayout",
      "docs": [
        "Withdraw the signer's payout from escrow. Each winner can claim once."
      ],
      "discriminator": [
        127,
        240,
        132,
        62,
        227,
        198,
        146,
        133
      ],
      "accounts": [
        {
          "name": "league",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  97,
                  103,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "league.admin",
                "account": "league"
              },
              {
                "kind": "account",
                "path": "league.league_id",
                "account": "league"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "createLeague",
      "docs": [
        "Initialize a new league escrow.",
        "",
        "`league_id` lets a single admin run many independent leagues (it is part",
        "of the league PDA seeds). `oracle` is a secondary authority allowed to",
        "resolve the league (e.g. an off-chain results oracle) in addition to the",
        "admin."
      ],
      "discriminator": [
        129,
        229,
        70,
        201,
        64,
        57,
        180,
        164
      ],
      "accounts": [
        {
          "name": "league",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  97,
                  103,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              },
              {
                "kind": "arg",
                "path": "leagueId"
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "leagueId",
          "type": "u64"
        },
        {
          "name": "entryFee",
          "type": "u64"
        },
        {
          "name": "maxPlayers",
          "type": "u16"
        },
        {
          "name": "oracle",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "joinLeague",
      "docs": [
        "Deposit the entry fee and register the signer as a player.",
        "",
        "Uses an `init` per-player [`PlayerEntry`] PDA, so a wallet can only join a",
        "given league once (a second attempt fails at account creation)."
      ],
      "discriminator": [
        32,
        4,
        179,
        25,
        65,
        34,
        15,
        127
      ],
      "accounts": [
        {
          "name": "league",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  97,
                  103,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "league.admin",
                "account": "league"
              },
              {
                "kind": "account",
                "path": "league.league_id",
                "account": "league"
              }
            ]
          }
        },
        {
          "name": "playerEntry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "league"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "lockLeague",
      "docs": [
        "Close entries. Only the admin can lock, and only while the league is open."
      ],
      "discriminator": [
        206,
        248,
        63,
        229,
        63,
        42,
        14,
        228
      ],
      "accounts": [
        {
          "name": "league",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  97,
                  103,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "league.admin",
                "account": "league"
              },
              {
                "kind": "account",
                "path": "league.league_id",
                "account": "league"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "league"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "resolveLeague",
      "docs": [
        "Declare winner(s) and their payout split. Callable by the admin or the",
        "configured oracle authority, and only once the league is locked.",
        "",
        "The sum of `amounts` must not exceed the collected pot. Winners are stored",
        "on the league account so each can later `claim_payout` exactly once."
      ],
      "discriminator": [
        156,
        52,
        95,
        78,
        229,
        120,
        250,
        160
      ],
      "accounts": [
        {
          "name": "league",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  97,
                  103,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "league.admin",
                "account": "league"
              },
              {
                "kind": "account",
                "path": "league.league_id",
                "account": "league"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "winners",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "amounts",
          "type": {
            "vec": "u64"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "league",
      "discriminator": [
        65,
        23,
        216,
        206,
        217,
        174,
        87,
        182
      ]
    },
    {
      "name": "playerEntry",
      "discriminator": [
        158,
        6,
        39,
        104,
        234,
        4,
        153,
        255
      ]
    }
  ],
  "events": [
    {
      "name": "leagueCreated",
      "discriminator": [
        179,
        29,
        55,
        122,
        26,
        184,
        110,
        126
      ]
    },
    {
      "name": "leagueLocked",
      "discriminator": [
        245,
        63,
        173,
        226,
        52,
        26,
        7,
        204
      ]
    },
    {
      "name": "leagueResolved",
      "discriminator": [
        17,
        135,
        229,
        233,
        69,
        123,
        0,
        84
      ]
    },
    {
      "name": "payoutClaimed",
      "discriminator": [
        200,
        39,
        105,
        112,
        116,
        63,
        58,
        149
      ]
    },
    {
      "name": "playerJoined",
      "discriminator": [
        39,
        144,
        49,
        106,
        108,
        210,
        183,
        38
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidEntryFee",
      "msg": "Entry fee must be greater than zero"
    },
    {
      "code": 6001,
      "name": "invalidMaxPlayers",
      "msg": "Max players must be at least 2"
    },
    {
      "code": 6002,
      "name": "leagueNotOpen",
      "msg": "League is not accepting entries"
    },
    {
      "code": 6003,
      "name": "leagueFull",
      "msg": "League is full"
    },
    {
      "code": 6004,
      "name": "leagueNotLocked",
      "msg": "League must be locked before it can be resolved"
    },
    {
      "code": 6005,
      "name": "leagueNotResolved",
      "msg": "League has not been resolved yet"
    },
    {
      "code": 6006,
      "name": "unauthorized",
      "msg": "Caller is not authorized for this action"
    },
    {
      "code": 6007,
      "name": "noWinners",
      "msg": "No winners were provided"
    },
    {
      "code": 6008,
      "name": "winnerAmountMismatch",
      "msg": "Winners and amounts length mismatch"
    },
    {
      "code": 6009,
      "name": "tooManyWinners",
      "msg": "More winners than players in the league"
    },
    {
      "code": 6010,
      "name": "invalidPayout",
      "msg": "A payout amount must be greater than zero"
    },
    {
      "code": 6011,
      "name": "duplicateWinner",
      "msg": "Duplicate winner in payout table"
    },
    {
      "code": 6012,
      "name": "payoutExceedsPot",
      "msg": "Total payout exceeds the collected pot"
    },
    {
      "code": 6013,
      "name": "notAWinner",
      "msg": "Caller is not a winner of this league"
    },
    {
      "code": 6014,
      "name": "alreadyClaimed",
      "msg": "Payout already claimed"
    },
    {
      "code": 6015,
      "name": "insufficientEscrow",
      "msg": "Escrow balance too low to cover payout"
    },
    {
      "code": 6016,
      "name": "mathOverflow",
      "msg": "Checked arithmetic overflow/underflow"
    }
  ],
  "types": [
    {
      "name": "league",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "League creator; can lock and resolve."
            ],
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "docs": [
              "Secondary authority allowed to resolve (e.g. results oracle)."
            ],
            "type": "pubkey"
          },
          {
            "name": "leagueId",
            "docs": [
              "Discriminator allowing one admin to run multiple leagues."
            ],
            "type": "u64"
          },
          {
            "name": "entryFee",
            "docs": [
              "Entry fee per player, in lamports."
            ],
            "type": "u64"
          },
          {
            "name": "maxPlayers",
            "docs": [
              "Maximum number of players allowed to join."
            ],
            "type": "u16"
          },
          {
            "name": "playerCount",
            "docs": [
              "Number of players that have joined so far."
            ],
            "type": "u16"
          },
          {
            "name": "status",
            "docs": [
              "Lifecycle status."
            ],
            "type": {
              "defined": {
                "name": "leagueStatus"
              }
            }
          },
          {
            "name": "totalPot",
            "docs": [
              "Total lamports collected from entry fees (excludes rent reserve)."
            ],
            "type": "u64"
          },
          {
            "name": "winners",
            "docs": [
              "Winner payout table, populated on resolve."
            ],
            "type": {
              "vec": {
                "defined": {
                  "name": "winnerShare"
                }
              }
            }
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "leagueCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "league",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "entryFee",
            "type": "u64"
          },
          {
            "name": "maxPlayers",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "leagueLocked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "league",
            "type": "pubkey"
          },
          {
            "name": "playerCount",
            "type": "u16"
          },
          {
            "name": "totalPot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "leagueResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "league",
            "type": "pubkey"
          },
          {
            "name": "totalPayout",
            "type": "u64"
          },
          {
            "name": "winnerCount",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "leagueStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "locked"
          },
          {
            "name": "resolved"
          }
        ]
      }
    },
    {
      "name": "payoutClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "league",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "playerEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "league",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "deposited",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "playerJoined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "league",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "playerCount",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "winnerShare",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "claimed",
            "type": "bool"
          }
        ]
      }
    }
  ]
};
