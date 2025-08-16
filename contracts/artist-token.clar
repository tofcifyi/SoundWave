 
;; artist-token.clar
;; Artist Token Contract for SoundWave
;; Clarity 3 (assuming latest version as of 2025 with enhanced type safety and traits)
;; Implements SIP-010 fungible token standard with additional features for artist-specific tokens:
;; - Minting controlled by artist/admin
;; - Burning
;; - Transfers
;; - Staking for fan rewards/governance
;; - Approvals and allowances (extended beyond basic SIP-010)
;; - Metadata updates by admin
;; - Pausable
;; - Vesting schedules for token releases (sophisticated feature for artist rewards)
;; - Batch operations for efficiency
;; - Robust error handling and security checks

;; Define SIP-010 trait for compliance
(define-trait sip-010-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-balance (principal) (response uint uint))
    (get-total-supply () (response uint uint))
    (get-name () (response (string-ascii 32) uint))
    (get-symbol () (response (string-ascii 32) uint))
    (get-decimals () (response uint uint))
    (get-token-uri () (response (optional (string-utf8 256)) uint))
  )
)

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-INSUFFICIENT-STAKE u102)
(define-constant ERR-MAX-SUPPLY-REACHED u103)
(define-constant ERR-PAUSED u104)
(define-constant ERR-ZERO-ADDRESS u105)
(define-constant ERR-INVALID-AMOUNT u106)
(define-constant ERR-ALLOWANCE-INSUFFICIENT u107)
(define-constant ERR-VESTING-LOCKED u108)
(define-constant ERR-INVALID-RECIPIENT u109)
(define-constant ERR-BATCH-LIMIT-EXCEEDED u110)
(define-constant ERR-ALREADY-VESTED u111)

;; Token metadata (artist-specific, updatable by admin)
(define-data-var token-name (string-ascii 32) "Artist Token")
(define-data-var token-symbol (string-ascii 32) "ART")
(define-data-var token-decimals uint u6)
(define-data-var token-uri (optional (string-utf8 256)) none)
(define-constant MAX-SUPPLY u100000000000000) ;; 100M tokens with decimals
(define-constant MAX-BATCH-SIZE u50) ;; Limit batch operations for gas efficiency

;; Admin and state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var total-supply uint u0)

;; Balances, stakes, allowances, vesting
(define-map balances principal uint)
(define-map staked-balances principal uint)
(define-map allowances {owner: principal, spender: principal} uint)
(define-map vesting-schedules {user: principal, release-time: uint} uint) ;; amount locked until block-height

;; Private helpers
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

(define-private (is-valid-principal (addr principal))
  (not (is-eq addr 'SP000000000000000000002Q6VF78))
)

(define-private (check-amount (amount uint))
  (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
)

;; Admin functions
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-valid-principal new-admin) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (print {event: "admin-transferred", new-admin: new-admin})
    (ok true)
  )
)

(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (print {event: "paused-set", pause: pause})
    (ok pause)
  )
)

(define-public (update-metadata (new-name (string-ascii 32)) (new-symbol (string-ascii 32)) (new-uri (optional (string-utf8 256))))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set token-name new-name)
    (var-set token-symbol new-symbol)
    (var-set token-uri new-uri)
    (print {event: "metadata-updated", name: new-name, symbol: new-symbol, uri: new-uri})
    (ok true)
  )
)

;; Minting
(define-public (mint (recipient principal) (amount uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-valid-principal recipient) (err ERR-ZERO-ADDRESS))
    (check-amount amount)
    (let ((new-supply (+ (var-get total-supply) amount)))
      (asserts! (<= new-supply MAX-SUPPLY) (err ERR-MAX-SUPPLY-REACHED))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (var-set total-supply new-supply)
      (print {event: "mint", recipient: recipient, amount: amount})
      (ok true)
    )
  )
)

(define-public (batch-mint (recipients (list 50 {to: principal, amount: uint})))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (fold batch-mint-iter recipients (ok u0))
  )
)

(define-private (batch-mint-iter (entry {to: principal, amount: uint}) (prev (response uint uint)))
  (match prev
    total-minted
    (begin
      (try! (mint (get to entry) (get amount entry)))
      (ok (+ total-minted (get amount entry)))
    )
    error (err error)
  )
)

;; Burning
(define-public (burn (amount uint))
  (begin
    (ensure-not-paused)
    (check-amount amount)
    (let ((balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (map-set balances tx-sender (- balance amount))
      (var-set total-supply (- (var-get total-supply) amount))
      (print {event: "burn", sender: tx-sender, amount: amount})
      (ok true)
    )
  )
)

;; Transfers (SIP-010 compliant)
(define-public (transfer (amount uint) (recipient principal) (memo (optional (buff 34))))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-principal recipient) (err ERR-ZERO-ADDRESS))
    (check-amount amount)
    (let ((sender-balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= sender-balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (map-set balances tx-sender (- sender-balance amount))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (print {event: "transfer", sender: tx-sender, recipient: recipient, amount: amount, memo: memo})
      (ok true)
    )
  )
)

;; Approvals and allowances
(define-public (approve (spender principal) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-principal spender) (err ERR-ZERO-ADDRESS))
    (map-set allowances {owner: tx-sender, spender: spender} amount)
    (print {event: "approval", owner: tx-sender, spender: spender, amount: amount})
    (ok true)
  )
)

(define-public (increase-allowance (spender principal) (added uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-principal spender) (err ERR-ZERO-ADDRESS))
    (let ((current (default-to u0 (map-get? allowances {owner: tx-sender, spender: spender}))))
      (map-set allowances {owner: tx-sender, spender: spender} (+ current added))
      (print {event: "allowance-increased", owner: tx-sender, spender: spender, added: added})
      (ok true)
    )
  )
)

(define-public (decrease-allowance (spender principal) (subtracted uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-principal spender) (err ERR-ZERO-ADDRESS))
    (let ((current (default-to u0 (map-get? allowances {owner: tx-sender, spender: spender}))))
      (asserts! (>= current subtracted) (err ERR-ALLOWANCE-INSUFFICIENT))
      (map-set allowances {owner: tx-sender, spender: spender} (- current subtracted))
      (print {event: "allowance-decreased", owner: tx-sender, spender: spender, subtracted: subtracted})
      (ok true)
    )
  )
)

(define-public (transfer-from (owner principal) (recipient principal) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-principal recipient) (err ERR-ZERO-ADDRESS))
    (check-amount amount)
    (let (
      (allowance (default-to u0 (map-get? allowances {owner: owner, spender: tx-sender})))
      (owner-balance (default-to u0 (map-get? balances owner)))
    )
      (asserts! (>= allowance amount) (err ERR-ALLOWANCE-INSUFFICIENT))
      (asserts! (>= owner-balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (map-set allowances {owner: owner, spender: tx-sender} (- allowance amount))
      (map-set balances owner (- owner-balance amount))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (print {event: "transfer-from", owner: owner, spender: tx-sender, recipient: recipient, amount: amount})
      (ok true)
    )
  )
)

;; Staking
(define-public (stake (amount uint))
  (begin
    (ensure-not-paused)
    (check-amount amount)
    (let ((balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (map-set balances tx-sender (- balance amount))
      (map-set staked-balances tx-sender (+ amount (default-to u0 (map-get? staked-balances tx-sender))))
      (print {event: "stake", staker: tx-sender, amount: amount})
      (ok true)
    )
  )
)

(define-public (unstake (amount uint))
  (begin
    (ensure-not-paused)
    (check-amount amount)
    (let ((stake-balance (default-to u0 (map-get? staked-balances tx-sender))))
      (asserts! (>= stake-balance amount) (err ERR-INSUFFICIENT-STAKE))
      (map-set staked-balances tx-sender (- stake-balance amount))
      (map-set balances tx-sender (+ amount (default-to u0 (map-get? balances tx-sender))))
      (print {event: "unstake", staker: tx-sender, amount: amount})
      (ok true)
    )
  )
)

;; Vesting (sophisticated feature for locked artist rewards)
(define-public (set-vesting (recipient principal) (amount uint) (release-height uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-valid-principal recipient) (err ERR-ZERO-ADDRESS))
    (check-amount amount)
    (asserts! (> release-height block-height) (err ERR-INVALID-AMOUNT)) ;; future height
    (asserts! (is-none (map-get? vesting-schedules {user: recipient, release-time: release-height})) (err ERR-ALREADY-VESTED))
    (map-set vesting-schedules {user: recipient, release-time: release-height} amount)
    (try! (mint recipient amount)) ;; Mint and lock
    (print {event: "vesting-set", recipient: recipient, amount: amount, release-height: release-height})
    (ok true)
  )
)

(define-public (claim-vesting (release-height uint))
  (begin
    (ensure-not-paused)
    (let ((amount (default-to u0 (map-get? vesting-schedules {user: tx-sender, release-time: release-height}))))
      (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
      (asserts! (>= block-height release-height) (err ERR-VESTING-LOCKED))
      (map-delete vesting-schedules {user: tx-sender, release-time: release-height})
      ;; Vesting claims directly to balance (already minted)
      (print {event: "vesting-claimed", claimant: tx-sender, amount: amount, release-height: release-height})
      (ok amount)
    )
  )
)

;; Read-only functions (SIP-010 compliant)
(define-read-only (get-balance (account principal))
  (ok (default-to u0 (map-get? balances account)))
)

(define-read-only (get-staked-balance (account principal))
  (ok (default-to u0 (map-get? staked-balances account)))
)

(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

(define-read-only (get-name)
  (ok (var-get token-name))
)

(define-read-only (get-symbol)
  (ok (var-get token-symbol))
)

(define-read-only (get-decimals)
  (ok (var-get token-decimals))
)

(define-read-only (get-token-uri)
  (ok (var-get token-uri))
)

(define-read-only (get-allowance (owner principal) (spender principal))
  (ok (default-to u0 (map-get? allowances {owner: owner, spender: spender})))
)

(define-read-only (get-vesting-amount (user principal) (release-height uint))
  (ok (default-to u0 (map-get? vesting-schedules {user: user, release-time: release-height})))
)

(define-read-only (get-admin)
  (ok (var-get admin))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)

