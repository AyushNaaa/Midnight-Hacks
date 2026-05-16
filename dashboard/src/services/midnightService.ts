/**
 * Midnight ZK service — mock mode (§4.3).
 * Simulates ZK proof submission and badge verification.
 * TODO: Implement real Midnight SDK integration when VITE_USE_MOCK_SDK=false.
 */

export interface ZKBadge {
  sessionId: string;
  isVerified: boolean;
  txHash: string;
  timestamp: number;
}

class MidnightService {
  private badges: Map<string, ZKBadge> = new Map();

  async mintBadge(sessionId: string, isHuman: boolean): Promise<ZKBadge> {
    // Mock: simulate proof generation delay
    await new Promise(r => setTimeout(r, 1000));

    const badge: ZKBadge = {
      sessionId,
      isVerified: isHuman,
      txHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      timestamp: Date.now(),
    };
    this.badges.set(sessionId, badge);
    return badge;
  }

  async isVerified(sessionId: string): Promise<boolean> {
    return this.badges.get(sessionId)?.isVerified ?? false;
  }
}

export const midnightService = new MidnightService();
