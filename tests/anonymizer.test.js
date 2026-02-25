/**
 * anonymizer.test.js
 * Unit tests for the cryptographic anonymization module.
 */
import { describe, it, expect } from 'vitest';
import { anonymizeOutputs, revealIdentity, revealAll } from '../src/core/anonymizer.js';

const mockOutputs = [
    { memberId: 'gemini', content: 'Output from Gemini', requestId: 'g1' },
    { memberId: 'groq', content: 'Output from Groq', requestId: 'g2' },
    { memberId: 'openrouter', content: 'Output from OpenRouter', requestId: 'g3' },
];

describe('anonymizeOutputs', () => {
    it('returns the correct number of anonymized outputs', () => {
        const { anonymized } = anonymizeOutputs(mockOutputs);
        expect(anonymized).toHaveLength(3);
    });

    it('assigns unique labels to each output', () => {
        const { anonymized } = anonymizeOutputs(mockOutputs);
        const labels = anonymized.map(a => a.label);
        expect(new Set(labels).size).toBe(3);
    });

    it('does NOT include memberId in anonymized outputs', () => {
        const { anonymized } = anonymizeOutputs(mockOutputs);
        for (const output of anonymized) {
            expect(output).not.toHaveProperty('memberId');
        }
    });

    it('preserves content in anonymized outputs', () => {
        const { anonymized } = anonymizeOutputs(mockOutputs);
        const allContent = anonymized.map(a => a.content);
        expect(allContent).toContain('Output from Gemini');
        expect(allContent).toContain('Output from Groq');
        expect(allContent).toContain('Output from OpenRouter');
    });

    it('creates a valid revealMap', () => {
        const { revealMap } = anonymizeOutputs(mockOutputs);
        expect(revealMap.size).toBe(3);
        const memberIds = [...revealMap.values()];
        expect(memberIds).toContain('gemini');
        expect(memberIds).toContain('groq');
        expect(memberIds).toContain('openrouter');
    });

    it('shuffles outputs (non-deterministic, but labels differ from insertion order)', () => {
        // Run multiple times to check randomness — at least 1 of 10 should differ
        let hasShuffled = false;
        for (let i = 0; i < 10; i++) {
            const { anonymized } = anonymizeOutputs(mockOutputs);
            const firstContent = anonymized[0].content;
            if (firstContent !== 'Output from Gemini') {
                hasShuffled = true;
                break;
            }
        }
        // With crypto-random shuffle, this should almost always be true for 10 trials
        // but we'll be lenient (it CAN fail with probability (1/3)^10 ≈ 0.002%)
        expect(hasShuffled).toBe(true);
    });
});

describe('revealIdentity', () => {
    it('reveals the correct memberId for a label', () => {
        const { anonymized, revealMap } = anonymizeOutputs(mockOutputs);
        const firstLabel = anonymized[0].label;
        const memberId = revealIdentity(revealMap, firstLabel);
        expect(['gemini', 'groq', 'openrouter']).toContain(memberId);
    });

    it('throws for unknown labels', () => {
        const { revealMap } = anonymizeOutputs(mockOutputs);
        expect(() => revealIdentity(revealMap, 'Submission Zeta')).toThrow('Unknown label');
    });
});

describe('revealAll', () => {
    it('returns all label-memberId pairs', () => {
        const { revealMap } = anonymizeOutputs(mockOutputs);
        const revealed = revealAll(revealMap);
        expect(revealed).toHaveLength(3);
        for (const entry of revealed) {
            expect(entry).toHaveProperty('label');
            expect(entry).toHaveProperty('memberId');
        }
    });
});
