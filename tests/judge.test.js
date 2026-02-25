/**
 * judge.test.js
 * Unit tests for the robustParseJSON function in the judge module.
 */
import { describe, it, expect } from 'vitest';
import { robustParseJSON } from '../src/core/judge.js';

describe('robustParseJSON', () => {
    it('parses valid JSON directly', () => {
        const result = robustParseJSON('{"winner": "Alpha", "score": 9}');
        expect(result).toEqual({ winner: 'Alpha', score: 9 });
    });

    it('parses JSON wrapped in markdown code fences', () => {
        const input = '```json\n{"winner": "Alpha", "score": 9}\n```';
        const result = robustParseJSON(input);
        expect(result).toEqual({ winner: 'Alpha', score: 9 });
    });

    it('parses JSON with leading/trailing whitespace', () => {
        const input = '   \n\n  {"winner": "Beta"}\n  ';
        const result = robustParseJSON(input);
        expect(result).toEqual({ winner: 'Beta' });
    });

    it('parses JSON with trailing commas', () => {
        const input = '{"items": ["a", "b",], "count": 2,}';
        const result = robustParseJSON(input);
        expect(result).toBeTruthy();
        expect(result.count).toBe(2);
    });

    it('parses JSON with leading text (preamble)', () => {
        const input = 'Here is my analysis:\n\n{"winner": "Gamma", "reason": "Best clarity"}';
        const result = robustParseJSON(input);
        expect(result).toBeTruthy();
        expect(result.winner).toBe('Gamma');
    });

    it('parses JSON with markdown fences and whitespace', () => {
        const input = '\n\n```json\n  {"winner": "Delta"}\n```\n';
        const result = robustParseJSON(input);
        expect(result).toEqual({ winner: 'Delta' });
    });

    it('handles nested JSON objects', () => {
        const input = '{"analysis": {"alpha": {"score": 8}, "beta": {"score": 6}}}';
        const result = robustParseJSON(input);
        expect(result.analysis.alpha.score).toBe(8);
        expect(result.analysis.beta.score).toBe(6);
    });

    it('returns null for completely unparseable content', () => {
        const result = robustParseJSON('This is not JSON at all');
        expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
        const result = robustParseJSON('');
        expect(result).toBeNull();
    });

    it('handles JSON with trailing text after closing brace', () => {
        const input = '{"winner": "Alpha"}\n\nLet me know if you need more details.';
        const result = robustParseJSON(input);
        expect(result).toEqual({ winner: 'Alpha' });
    });
});
