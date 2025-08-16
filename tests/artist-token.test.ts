 
// artist-token.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

type Response<T> = { value: T } | { error: number };

interface MockContract {
  admin: string;
  paused: boolean;
  totalSupply: bigint;
  balances: Map<string, bigint>;
  stakedBalances: Map<string, bigint>;
  allowances: Map<string, bigint>; // Key as `${owner}-${spender}`
  vestingSchedules: Map<string, bigint>; // Key as `${user}-${releaseHeight}`
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenUri: string | null;
  MAX_SUPPLY: bigint;
  blockHeight: number; // Mock block height for vesting

  isAdmin(caller: string): boolean;
  ensureNotPaused(): Response<void>;
  isValidPrincipal(addr: string): boolean;
  checkAmount(amount: bigint): Response<void>;

  transferAdmin(caller: string, newAdmin: string): Response<boolean>;
  setPaused(caller: string, pause: boolean): Response<boolean>;
  updateMetadata(caller: string, newName: string, newSymbol: string, newUri: string | null): Response<boolean>;

  mint(caller: string, recipient: string, amount: bigint): Response<boolean>;
  batchMint(caller: string, recipients: { to: string; amount: bigint }[]): Response<bigint>;

  burn(caller: string, amount: bigint): Response<boolean>;

  transfer(caller: string, amount: bigint, recipient: string, memo?: string): Response<boolean>;

  approve(caller: string, spender: string, amount: bigint): Response<boolean>;
  increaseAllowance(caller: string, spender: string, added: bigint): Response<boolean>;
  decreaseAllowance(caller: string, spender: string, subtracted: bigint): Response<boolean>;
  transferFrom(caller: string, owner: string, recipient: string, amount: bigint): Response<boolean>;

  stake(caller: string, amount: bigint): Response<boolean>;
  unstake(caller: string, amount: bigint): Response<boolean>;

  setVesting(caller: string, recipient: string, amount: bigint, releaseHeight: number): Response<boolean>;
  claimVesting(caller: string, releaseHeight: number): Response<bigint>;
}

const mockContract: MockContract = {
  admin: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
  paused: false,
  totalSupply: 0n,
  balances: new Map(),
  stakedBalances: new Map(),
  allowances: new Map(),
  vestingSchedules: new Map(),
  tokenName: 'Artist Token',
  tokenSymbol: 'ART',
  tokenDecimals: 6,
  tokenUri: null,
  MAX_SUPPLY: 100_000_000_000_000n,
  blockHeight: 100, // Initial mock height

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  ensureNotPaused() {
    if (this.paused) return { error: 104 };
    return { value: undefined };
  },

  isValidPrincipal(addr: string) {
    return addr !== 'SP000000000000000000002Q6VF78';
  },

  checkAmount(amount: bigint) {
    if (amount <= 0n) return { error: 106 };
    return { value: undefined };
  },

  transferAdmin(caller: string, newAdmin: string): Response<boolean> {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (!this.isValidPrincipal(newAdmin)) return { error: 105 };
    this.admin = newAdmin;
    return { value: true };
  },

  setPaused(caller: string, pause: boolean): Response<boolean> {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: true };
  },

  updateMetadata(caller: string, newName: string, newSymbol: string, newUri: string | null): Response<boolean> {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.tokenName = newName;
    this.tokenSymbol = newSymbol;
    this.tokenUri = newUri;
    return { value: true };
  },

  mint(caller: string, recipient: string, amount: bigint): Response<boolean> {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (!this.isValidPrincipal(recipient)) return { error: 105 };
    const check = this.checkAmount(amount);
    if ('error' in check) return check;
    if (this.totalSupply + amount > this.MAX_SUPPLY) return { error: 103 };
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    this.totalSupply += amount;
    return { value: true };
  },

  batchMint(caller: string, recipients: { to: string; amount: bigint }[]): Response<bigint> {
    if (!this.isAdmin(caller)) return { error: 100 };
    let totalMinted = 0n;
    for (const { to, amount } of recipients) {
      const result = this.mint(caller, to, amount);
      if ('error' in result) return result;
      totalMinted += amount;
    }
    return { value: totalMinted };
  },

  burn(caller: string, amount: bigint): Response<boolean> {
    const ensure = this.ensureNotPaused();
    if ('error' in ensure) return ensure;
    const check = this.checkAmount(amount);
    if ('error' in check) return check;
    const balance = this.balances.get(caller) || 0n;
    if (balance < amount) return { error: 101 };
    this.balances.set(caller, balance - amount);
    this.totalSupply -= amount;
    return { value: true };
  },

  transfer(caller: string, amount: bigint, recipient: string, memo?: string): Response<boolean> {
    const ensure = this.ensureNotPaused();
    if ('error' in ensure) return ensure;
    if (!this.isValidPrincipal(recipient)) return { error: 105 };
    const check = this.checkAmount(amount);
    if ('error' in check) return check;
    const balance = this.balances.get(caller) || 0n;
    if (balance < amount) return { error: 101 };
    this.balances.set(caller, balance - amount);
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    return { value: true };
  },

  approve(caller: string, spender: string, amount: bigint): Response<boolean> {
    const ensure = this.ensureNotPaused();
    if ('error' in ensure) return ensure;
    if (!this.isValidPrincipal(spender)) return { error: 105 };
    const key = `${caller}-${spender}`;
    this.allowances.set(key, amount);
    return { value: true };
  },

  increaseAllowance(caller: string, spender: string, added: bigint): Response<boolean> {
    const ensure = this.ensureNotPaused();
    if ('error' in ensure) return ensure;
    if (!this.isValidPrincipal(spender)) return { error: 105 };
    const key = `${caller}-${spender}`;
    const current = this.allowances.get(key) || 0n;
    this.allowances.set(key, current + added);
    return { value: true };
  },

  decreaseAllowance(caller: string, spender: string, subtracted: bigint): Response<boolean> {
    const ensure = this.ensureNotPaused();
    if ('error' in ensure) return ensure;
    if (!this.isValidPrincipal(spender)) return { error: 105 };
    const key = `${caller}-${spender}`;
    const current = this.allowances.get(key) || 0n;
    if (current < subtracted) return { error: 107 };
    this.allowances.set(key, current - subtracted);
    return { value: true };
  },

  transferFrom(caller: string, owner: string, recipient: string, amount: bigint): Response<boolean> {
    const ensure = this.ensureNotPaused();
    if ('error' in ensure) return ensure;
    if (!this.isValidPrincipal(recipient)) return { error: 105 };
    const check = this.checkAmount(amount);
    if ('error' in check) return check;
    const key = `${owner}-${caller}`;
    const allowance = this.allowances.get(key) || 0n;
    if (allowance < amount) return { error: 107 };
    const ownerBalance = this.balances.get(owner) || 0n;
    if (ownerBalance < amount) return { error: 101 };
    this.allowances.set(key, allowance - amount);
    this.balances.set(owner, ownerBalance - amount);
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    return { value: true };
  },

  stake(caller: string, amount: bigint): Response<boolean> {
    const ensure = this.ensureNotPaused();
    if ('error' in ensure) return ensure;
    const check = this.checkAmount(amount);
    if ('error' in check) return check;
    const balance = this.balances.get(caller) || 0n;
    if (balance < amount) return { error: 101 };
    this.balances.set(caller, balance - amount);
    this.stakedBalances.set(caller, (this.stakedBalances.get(caller) || 0n) + amount);
    return { value: true };
  },

  unstake(caller: string, amount: bigint): Response<boolean> {
    const ensure = this.ensureNotPaused();
    if ('error' in ensure) return ensure;
    const check = this.checkAmount(amount);
    if ('error' in check) return check;
    const stakeBalance = this.stakedBalances.get(caller) || 0n;
    if (stakeBalance < amount) return { error: 102 };
    this.stakedBalances.set(caller, stakeBalance - amount);
    this.balances.set(caller, (this.balances.get(caller) || 0n) + amount);
    return { value: true };
  },

  setVesting(caller: string, recipient: string, amount: bigint, releaseHeight: number): Response<boolean> {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (!this.isValidPrincipal(recipient)) return { error: 105 };
    const check = this.checkAmount(amount);
    if ('error' in check) return check;
    if (releaseHeight <= this.blockHeight) return { error: 106 };
    const key = `${recipient}-${releaseHeight}`;
    if (this.vestingSchedules.has(key)) return { error: 111 };
    const mintResult = this.mint(caller, recipient, amount);
    if ('error' in mintResult) return mintResult;
    this.vestingSchedules.set(key, amount);
    return { value: true };
  },

  claimVesting(caller: string, releaseHeight: number): Response<bigint> {
    const ensure = this.ensureNotPaused();
    if ('error' in ensure) return ensure;
    const key = `${caller}-${releaseHeight}`;
    const amount = this.vestingSchedules.get(key) || 0n;
    if (amount <= 0n) return { error: 106 };
    if (this.blockHeight < releaseHeight) return { error: 108 };
    this.vestingSchedules.delete(key);
    return { value: amount };
  },
};

describe('Artist Token Contract', () => {
  beforeEach(() => {
    mockContract.admin = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
    mockContract.paused = false;
    mockContract.totalSupply = 0n;
    mockContract.balances.clear();
    mockContract.stakedBalances.clear();
    mockContract.allowances.clear();
    mockContract.vestingSchedules.clear();
    mockContract.tokenName = 'Artist Token';
    mockContract.tokenSymbol = 'ART';
    mockContract.tokenDecimals = 6;
    mockContract.tokenUri = null;
    mockContract.blockHeight = 100;
  });

  it('should allow admin to mint tokens', () => {
    const result = mockContract.mint(mockContract.admin, 'ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 1000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV')).toBe(1000n);
    expect(mockContract.totalSupply).toBe(1000n);
  });

  it('should prevent non-admin from minting', () => {
    const result = mockContract.mint('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP', 1000n);
    expect(result).toEqual({ error: 100 });
  });

  it('should prevent minting over max supply', () => {
    const result = mockContract.mint(mockContract.admin, 'ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 200_000_000_000_000n);
    expect(result).toEqual({ error: 103 });
  });

  it('should allow batch minting by admin', () => {
    const recipients = [
      { to: 'ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', amount: 500n },
      { to: 'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP', amount: 300n },
    ];
    const result = mockContract.batchMint(mockContract.admin, recipients);
    expect(result).toEqual({ value: 800n });
    expect(mockContract.balances.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV')).toBe(500n);
    expect(mockContract.balances.get('ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP')).toBe(300n);
    expect(mockContract.totalSupply).toBe(800n);
  });

  it('should allow burning tokens', () => {
    mockContract.mint(mockContract.admin, 'ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 1000n);
    const result = mockContract.burn('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 400n);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV')).toBe(600n);
    expect(mockContract.totalSupply).toBe(600n);
  });

  it('should prevent burning more than balance', () => {
    mockContract.mint(mockContract.admin, 'ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 1000n);
    const result = mockContract.burn('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 2000n);
    expect(result).toEqual({ error: 101 });
  });

  it('should allow transfers', () => {
    mockContract.mint(mockContract.admin, 'ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 1000n);
    const result = mockContract.transfer('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 300n, 'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP');
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV')).toBe(700n);
    expect(mockContract.balances.get('ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP')).toBe(300n);
  });

  it('should prevent transfers when paused', () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.transfer('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 100n, 'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP');
    expect(result).toEqual({ error: 104 });
  });

  it('should allow approvals and transfer-from', () => {
    mockContract.mint(mockContract.admin, 'ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 1000n);
    mockContract.approve('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP', 500n);
    const result = mockContract.transferFrom('ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP', 'ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 'ST4ABCDEF', 200n);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV')).toBe(800n);
    expect(mockContract.balances.get('ST4ABCDEF')).toBe(200n);
    expect(mockContract.allowances.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV-ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP')).toBe(300n);
  });

  it('should prevent transfer-from without sufficient allowance', () => {
    mockContract.mint(mockContract.admin, 'ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 1000n);
    mockContract.approve('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP', 100n);
    const result = mockContract.transferFrom('ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP', 'ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 'ST4ABCDEF', 200n);
    expect(result).toEqual({ error: 107 });
  });

  it('should allow increasing and decreasing allowances', () => {
    mockContract.approve('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP', 100n);
    let result = mockContract.increaseAllowance('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP', 50n);
    expect(result).toEqual({ value: true });
    expect(mockContract.allowances.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV-ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP')).toBe(150n);
    result = mockContract.decreaseAllowance('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP', 30n);
    expect(result).toEqual({ value: true });
    expect(mockContract.allowances.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV-ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP')).toBe(120n);
  });

  it('should allow staking and unstaking', () => {
    mockContract.mint(mockContract.admin, 'ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 1000n);
    let result = mockContract.stake('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 400n);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV')).toBe(600n);
    expect(mockContract.stakedBalances.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV')).toBe(400n);
    result = mockContract.unstake('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 200n);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV')).toBe(800n);
    expect(mockContract.stakedBalances.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV')).toBe(200n);
  });

  it('should prevent unstaking more than staked', () => {
    mockContract.mint(mockContract.admin, 'ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 1000n);
    mockContract.stake('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 400n);
    const result = mockContract.unstake('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 500n);
    expect(result).toEqual({ error: 102 });
  });

  it('should allow setting and claiming vesting', () => {
    const resultSet = mockContract.setVesting(mockContract.admin, 'ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 1000n, 200);
    expect(resultSet).toEqual({ value: true });
    expect(mockContract.balances.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV')).toBe(1000n);
    expect(mockContract.vestingSchedules.get('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV-200')).toBe(1000n);
    mockContract.blockHeight = 150;
    let resultClaim = mockContract.claimVesting('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 200);
    expect(resultClaim).toEqual({ error: 108 }); // Locked
    mockContract.blockHeight = 250;
    resultClaim = mockContract.claimVesting('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 200);
    expect(resultClaim).toEqual({ value: 1000n });
    expect(mockContract.vestingSchedules.has('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV-200')).toBe(false);
  });

  it('should prevent claiming non-existent vesting', () => {
    const result = mockContract.claimVesting('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 200);
    expect(result).toEqual({ error: 106 });
  });

  it('should allow admin to update metadata', () => {
    const result = mockContract.updateMetadata(mockContract.admin, 'New Artist Token', 'NART', 'https://example.com');
    expect(result).toEqual({ value: true });
    expect(mockContract.tokenName).toBe('New Artist Token');
    expect(mockContract.tokenSymbol).toBe('NART');
    expect(mockContract.tokenUri).toBe('https://example.com');
  });

  it('should prevent non-admin from updating metadata', () => {
    const result = mockContract.updateMetadata('ST2CY5V39NHDP5PWE9V7FQRCL3BPG5P5GWGKR43FV', 'New Name', 'NSYM', null);
    expect(result).toEqual({ error: 100 });
  });
});