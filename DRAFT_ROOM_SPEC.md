# RoundBlock Fantasy Draft Room: Technical Specification

## 1. Interface Layout

### Left Sidebar (The 'Anchored Roster')
*   **Persistent View:** A non-scrollable, vertically anchored panel displaying the user’s current roster.
*   **Real-time Opponent Switcher:** A drop-down menu or tab system that allows the user to instantly view any opponent’s roster without navigating away from the draft room.
*   **Visual Roster Limits:** Real-time trackers for each positional limit (e.g., QB 0/4, RB 3/8). These trackers are directly bound to the smart contract state and update synchronously within milliseconds as picks are confirmed on the blockchain.

### Center/Right Panel (Tabbed Workspace)
A highly modular, centralized panel utilizing a tabbed interface to organize critical draft operations:

1.  **'Available Players' (Searchable/Filterable Grid):**
    *   Rich data grid displaying key metrics: Projected Points, Bye Weeks, and Average Draft Position (ADP).
    *   Real-time filtering by position and search by player name.
2.  **'Pick Queue':**
    *   A drag-and-drop prioritization space. Users can drag players from the 'Available' grid into their queue to establish a fallback order.
3.  **'Pick History':**
    *   A chronological ledger of all draft selections.
    *   Each entry is indexed by its verifying block height and transaction hash to enforce transparency.
4.  **'Draft Board':**
    *   A comprehensive, full-league matrix view displaying every team's picks side-by-side.

### Top 'Draft Train'
*   **Horizontal High-Visibility Tracker:** An anchored horizontal bar spanning the top of the interface.
*   **Lookahead:** Displays the next 5 upcoming picks.
*   **'On the Clock' Highlight:** Distinct visual styling (e.g., pulsing border, highlighted timer) for the currently active picker.
*   **'Auto-Pick' Identification:** Clear visual indicators for teams currently relying on auto-pick or who have timed out, ensuring total transparency of the draft flow.

---

## 2. Technical Requirements (Web3 Protocol)

### State Management & Synchronization
*   **Contract-Driven State:** The ultimate source of truth for the draft is the smart contract. Local state acts strictly as an optimistic representation of the chain.
*   **WebSocket Event Listener:** Implement a low-latency WebSocket connection to listen for `PickCommitted` events on the blockchain. When an event fires, the UI updates the global board, available player pool, and roster UI for all connected users in milliseconds.

### Smart Contract Guardrails
*   **Positional Integrity:** Hard-coded logic at the smart contract level enforces positional roster limits (e.g., rejecting a transaction if a user attempts to draft a 5th QB when the limit is 4).
*   **Immutability:** Rejections happen on-chain, preventing any client-side manipulation of roster constraints.

### Timeout & Autopick Logic
*   **Contract-Enforced Timers:** A block-timestamp-based timer tracks the 'On the Clock' window.
*   **Fallback Trigger:** If a user fails to broadcast a valid pick transaction before their window expires, any participant (or a decentralized keeper network) can trigger the contract's `executeAutopick` function.
*   **Deterministic Selection:** The autopick logic resolves deterministically by selecting the highest available player based on a pre-set, immutable ADP ranking array stored on-chain or via a trusted Oracle. This prevents draft stalling.

### Transaction Speed & UX Optimization
*   **Optimistic UI with 'Pending' States:** When a user submits a pick, the UI instantly updates to a 'Pending' or 'Confirming' state for that asset. 
*   **Congestion Handling:** Visual loading indicators (e.g., spinners or progress bars matching block propagation) inform the user that their transaction is traversing the mempool, mitigating friction during high network congestion.
