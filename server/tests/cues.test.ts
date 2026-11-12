import { describe, it, expect } from 'vitest';
import { hasMemoryCue } from '../src/services/memory/cues.js';

describe('Memory Intent Cue Detection (Decision 5)', () => {
  it('detects memory intent cues accurately', () => {
    expect(hasMemoryCue('did I ask about Python?')).toBe(true);
    expect(hasMemoryCue('we discussed RAG earlier')).toBe(true);
    expect(hasMemoryCue('what did we talk about yesterday?')).toBe(true);
    expect(hasMemoryCue('what did I ask last week?')).toBe(true);
    expect(hasMemoryCue('as we discussed earlier')).toBe(true);
    expect(hasMemoryCue('what came before ML?')).toBe(true);
    expect(hasMemoryCue('do you remember the API key format?')).toBe(true);
    expect(hasMemoryCue('what did you tell me about embeddings?')).toBe(true);
    expect(hasMemoryCue('first topic we discussed')).toBe(true);
    expect(hasMemoryCue('when did I ask about Docker?')).toBe(true);
    expect(hasMemoryCue('which companies did we discuss?')).toBe(true);
  });

  it('does not trigger on general questions without memory intent', () => {
    expect(hasMemoryCue('what is the capital of France?')).toBe(false);
    expect(hasMemoryCue('how does React reconciliation work?')).toBe(false);
    expect(hasMemoryCue('write a function to reverse a linked list')).toBe(false);
    expect(hasMemoryCue('weather in San Francisco today')).toBe(false);
  });

  it('handles empty and whitespace strings gracefully', () => {
    expect(hasMemoryCue('')).toBe(false);
    expect(hasMemoryCue('   ')).toBe(false);
  });
});
