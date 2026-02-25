/**
 * scorer.test.js
 * Unit tests for the weighted composite scoring module.
 */
import { describe, it, expect } from 'vitest';
import { computeScores, buildVerdictBreakdown } from '../src/core/scorer.js';

const mockAnonymized = [
    { label: 'Submission Alpha' },
    { label: 'Submission Beta' },
    { label: 'Submission Gamma' },
];

describe('computeScores', () => {
    it('returns scores for all submissions', () => {
        const reviews = [
            {
                reviewerId: 'r1',
                vote: 'Submission Alpha',
                ranking: ['Submission Alpha', 'Submission Beta', 'Submission Gamma'],
                detailedAnalysis: {
                    'Submission Alpha': { score: 9 },
                    'Submission Beta': { score: 7 },
                    'Submission Gamma': { score: 5 },
                },
                worstSubmission: 'Submission Gamma',
            },
        ];

        const { scores, winner } = computeScores(reviews, mockAnonymized);
        expect(scores).toHaveLength(3);
        expect(winner.label).toBe('Submission Alpha');
    });

    it('handles multiple reviewers correctly', () => {
        const reviews = [
            {
                reviewerId: 'r1',
                vote: 'Submission Alpha',
                ranking: ['Submission Alpha', 'Submission Beta', 'Submission Gamma'],
                detailedAnalysis: {
                    'Submission Alpha': { score: 8 },
                    'Submission Beta': { score: 6 },
                    'Submission Gamma': { score: 4 },
                },
                worstSubmission: 'Submission Gamma',
            },
            {
                reviewerId: 'r2',
                vote: 'Submission Beta',
                ranking: ['Submission Beta', 'Submission Alpha', 'Submission Gamma'],
                detailedAnalysis: {
                    'Submission Alpha': { score: 7 },
                    'Submission Beta': { score: 9 },
                    'Submission Gamma': { score: 3 },
                },
                worstSubmission: 'Submission Gamma',
            },
            {
                reviewerId: 'r3',
                vote: 'Submission Alpha',
                ranking: ['Submission Alpha', 'Submission Gamma', 'Submission Beta'],
                detailedAnalysis: {
                    'Submission Alpha': { score: 9 },
                    'Submission Beta': { score: 5 },
                    'Submission Gamma': { score: 6 },
                },
                worstSubmission: 'Submission Beta',
            },
        ];

        const { scores, winner } = computeScores(reviews, mockAnonymized);
        expect(winner.label).toBe('Submission Alpha'); // 2 votes vs 1
        expect(winner.votes).toBe(2);
    });

    it('detects tie when scores are equal', () => {
        const reviews = [
            {
                reviewerId: 'r1',
                vote: 'Submission Alpha',
                ranking: ['Submission Alpha', 'Submission Beta', 'Submission Gamma'],
                detailedAnalysis: {
                    'Submission Alpha': { score: 7 },
                    'Submission Beta': { score: 7 },
                    'Submission Gamma': { score: 7 },
                },
            },
            {
                reviewerId: 'r2',
                vote: 'Submission Beta',
                ranking: ['Submission Beta', 'Submission Alpha', 'Submission Gamma'],
                detailedAnalysis: {
                    'Submission Alpha': { score: 7 },
                    'Submission Beta': { score: 7 },
                    'Submission Gamma': { score: 7 },
                },
            },
        ];

        const { scores, tiebroken } = computeScores(reviews, mockAnonymized);
        // Both Alpha and Beta have 1 vote each, same scores
        expect(scores).toHaveLength(3);
    });

    it('clamps scores between 1 and 10', () => {
        const reviews = [
            {
                reviewerId: 'r1',
                vote: 'Submission Alpha',
                ranking: ['Submission Alpha'],
                detailedAnalysis: {
                    'Submission Alpha': { score: 15 }, // Over 10
                    'Submission Beta': { score: -3 },   // Under 1
                },
            },
        ];

        const { scores } = computeScores(reviews, mockAnonymized);
        const alphaScore = scores.find(s => s.label === 'Submission Alpha');
        const betaScore = scores.find(s => s.label === 'Submission Beta');
        expect(alphaScore.avgScore).toBeLessThanOrEqual(10);
        expect(betaScore.avgScore).toBeGreaterThanOrEqual(1);
    });

    it('handles missing detailedAnalysis gracefully', () => {
        const reviews = [
            {
                reviewerId: 'r1',
                vote: 'Submission Alpha',
                ranking: ['Submission Alpha', 'Submission Beta', 'Submission Gamma'],
                // No detailedAnalysis
            },
        ];

        const { scores, winner } = computeScores(reviews, mockAnonymized);
        expect(winner.label).toBe('Submission Alpha');
        expect(winner.avgScore).toBe(5); // Default neutral score
    });

    it('penalizes worst-voted submissions', () => {
        const reviews = [
            {
                reviewerId: 'r1',
                vote: 'Submission Alpha',
                ranking: ['Submission Alpha', 'Submission Beta', 'Submission Gamma'],
                detailedAnalysis: {
                    'Submission Alpha': { score: 8 },
                    'Submission Beta': { score: 8 },
                    'Submission Gamma': { score: 8 },
                },
                worstSubmission: 'Submission Beta',
            },
            {
                reviewerId: 'r2',
                vote: 'Submission Alpha',
                ranking: ['Submission Alpha', 'Submission Beta', 'Submission Gamma'],
                detailedAnalysis: {
                    'Submission Alpha': { score: 8 },
                    'Submission Beta': { score: 8 },
                    'Submission Gamma': { score: 8 },
                },
                worstSubmission: 'Submission Beta',
            },
        ];

        const { scores } = computeScores(reviews, mockAnonymized);
        const beta = scores.find(s => s.label === 'Submission Beta');
        expect(beta.worstVotes).toBe(2);
        // Beta should rank lower than Alpha despite same avg score
        const alpha = scores.find(s => s.label === 'Submission Alpha');
        expect(alpha.composite).toBeGreaterThan(beta.composite);
    });
});

describe('buildVerdictBreakdown', () => {
    it('builds a verdict with winner info', () => {
        const reviews = [
            {
                reviewerId: 'r1',
                vote: 'Submission Alpha',
                ranking: ['Submission Alpha', 'Submission Beta'],
                reason: 'Alpha has better clarity and structure',
                detailedAnalysis: {
                    'Submission Alpha': { score: 9, strengths: 'Clear', weaknesses: 'None' },
                    'Submission Beta': { score: 6, strengths: 'OK', weaknesses: 'Verbose' },
                },
                tradeoffs: 'Slightly less creative',
            },
        ];

        const { scores, winner } = computeScores(reviews, mockAnonymized);
        const revealMap = new Map([
            ['Submission Alpha', 'gemini'],
            ['Submission Beta', 'groq'],
            ['Submission Gamma', 'openrouter'],
        ]);
        const memberMap = {
            gemini: { name: 'Gemini', icon: '♦', color: '#4285F4' },
            groq: { name: 'Groq', icon: '♣', color: '#F97316' },
            openrouter: { name: 'OpenRouter', icon: '♠', color: '#10B981' },
        };

        const verdict = buildVerdictBreakdown(winner, scores, reviews, revealMap, memberMap);
        expect(verdict.winner.label).toBe('Submission Alpha');
        expect(verdict.winner.memberId).toBe('gemini');
        expect(verdict.winner.reasons).toHaveLength(1);
        expect(verdict.submissionBreakdowns).toHaveLength(3);
        expect(verdict.scoringMethod).toContain('Composite');
    });
});
