/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import data from "../demo-candidates.json";
import type { Achievement } from "../types";

/** Replace this adapter only after the real FSP contract is supplied. */
export interface FspProvider {
  source: string;
  getAchievements(participantId: string): Promise<Achievement[]>;
}
export class MockFspProvider implements FspProvider {
  source = "mock-fsp";
  async getAchievements(participantId: string) {
    const candidate = data.find((c) => c.id === participantId);
    if (!candidate) throw new Error("DEMO_PARTICIPANT_NOT_FOUND");
    return structuredClone(candidate.achievements) as Achievement[];
  }
}
export const fspProvider: FspProvider = new MockFspProvider();
