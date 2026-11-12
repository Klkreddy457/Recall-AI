import { describe, it, expect } from 'vitest';
import {
  parseTemporalDate,
  getTimezoneOffsetMinutes,
  localToUtc,
} from '../src/services/memory/temporal.js';

describe('Temporal Engine & Date Parsing', () => {
  // Reference date: Thursday, 12 November 2026 at 12:00:00 UTC
  const refDate = new Date('2026-11-12T12:00:00.000Z');

  describe('Timezone Offsets & Conversions', () => {
    it('calculates exact offsets in winter and summer (DST)', () => {
      // America/New_York is UTC-5 in winter (EST), UTC-4 in summer (EDT)
      const winterOffset = getTimezoneOffsetMinutes('America/New_York', new Date('2026-01-15T12:00:00Z'));
      const summerOffset = getTimezoneOffsetMinutes('America/New_York', new Date('2026-07-15T12:00:00Z'));
      expect(winterOffset).toBe(-300); // -5 hours
      expect(summerOffset).toBe(-240); // -4 hours

      // Asia/Kolkata is UTC+5:30 year-round
      const kolkataOffset = getTimezoneOffsetMinutes('Asia/Kolkata', new Date('2026-07-15T12:00:00Z'));
      expect(kolkataOffset).toBe(330); // +5.5 hours
    });

    it('converts local wall-clock times to UTC across timezones', () => {
      // Midnight Nov 11, 2026 in New York (EST, UTC-5) is 05:00:00 UTC on Nov 11
      const nyMidnight = localToUtc(2026, 11, 11, 0, 0, 0, 'America/New_York');
      expect(nyMidnight.toISOString()).toBe('2026-11-11T05:00:00.000Z');

      // Midnight Nov 11, 2026 in Kolkata (UTC+5:30) is 18:30:00 UTC on Nov 10
      const kolkataMidnight = localToUtc(2026, 11, 11, 0, 0, 0, 'Asia/Kolkata');
      expect(kolkataMidnight.toISOString()).toBe('2026-11-10T18:30:00.000Z');
    });

    it('correctly handles DST fall-back transition day in America/New_York', () => {
      // Nov 1, 2026 is the DST fall-back day in the US
      // At midnight Nov 1, NY was EDT (UTC-4), so UTC was 04:00:00
      const dstDay = localToUtc(2026, 11, 1, 0, 0, 0, 'America/New_York');
      expect(dstDay.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    });
  });

  describe('Exit Check: Date parsing in at least two timezones', () => {
    describe('Timezone 1: America/New_York (UTC-5)', () => {
      const tz = 'America/New_York';

      it('parses "yesterday" to exact 24-hour UTC day boundary', () => {
        // Ref: Thursday Nov 12, 2026. Yesterday is Wednesday Nov 11.
        // In NY: Nov 11 00:00:00 to Nov 12 00:00:00 -> UTC 2026-11-11T05:00:00Z to 2026-11-12T05:00:00Z
        const range = parseTemporalDate('what did I ask yesterday', tz, refDate);
        expect(range).not.toBeNull();
        expect(range!.text).toBe('yesterday');
        expect(range!.start.toISOString()).toBe('2026-11-11T05:00:00.000Z');
        expect(range!.end.toISOString()).toBe('2026-11-12T05:00:00.000Z');
      });

      it('parses "last Monday" to exact 24-hour UTC boundary', () => {
        // Ref: Thursday Nov 12, 2026. Last Monday was Nov 9, 2026.
        // In NY: Nov 9 00:00:00 to Nov 10 00:00:00 -> UTC 2026-11-09T05:00:00Z to 2026-11-10T05:00:00Z
        const range = parseTemporalDate('what did we discuss last Monday', tz, refDate);
        expect(range).not.toBeNull();
        expect(range!.start.toISOString()).toBe('2026-11-09T05:00:00.000Z');
        expect(range!.end.toISOString()).toBe('2026-11-10T05:00:00.000Z');
      });

      it('parses "last week" to 7-day range ending at today midnight', () => {
        const range = parseTemporalDate('what did I ask last week', tz, refDate);
        expect(range).not.toBeNull();
        expect(range!.end.toISOString()).toBe('2026-11-12T05:00:00.000Z');
        expect(range!.start.toISOString()).toBe('2026-11-05T05:00:00.000Z');
      });

      it('parses "on 3 March" to past calendar day', () => {
        const range = parseTemporalDate('what happened on 3 March', tz, refDate);
        expect(range).not.toBeNull();
        // March 3, 2026 in NY (EST, UTC-5): UTC 2026-03-03T05:00:00Z to 2026-03-04T05:00:00Z
        expect(range!.start.toISOString()).toBe('2026-03-03T05:00:00.000Z');
        expect(range!.end.toISOString()).toBe('2026-03-04T05:00:00.000Z');
      });
    });

    describe('Timezone 2: Asia/Kolkata (UTC+5:30)', () => {
      const tz = 'Asia/Kolkata';

      it('parses "yesterday" to exact 24-hour UTC boundary in India timezone', () => {
        // Ref: Thursday Nov 12, 2026 12:00 UTC (17:30 IST).
        // Yesterday in India is Wednesday Nov 11 (00:00 IST = Nov 10 18:30 UTC, 24:00 IST = Nov 11 18:30 UTC)
        const range = parseTemporalDate('what did I ask yesterday', tz, refDate);
        expect(range).not.toBeNull();
        expect(range!.start.toISOString()).toBe('2026-11-10T18:30:00.000Z');
        expect(range!.end.toISOString()).toBe('2026-11-11T18:30:00.000Z');
      });

      it('parses "last Monday" to exact 24-hour UTC boundary in India timezone', () => {
        // Last Monday in India is Nov 9 (00:00 IST = Nov 8 18:30 UTC, 24:00 IST = Nov 9 18:30 UTC)
        const range = parseTemporalDate('what did we discuss last Monday', tz, refDate);
        expect(range).not.toBeNull();
        expect(range!.start.toISOString()).toBe('2026-11-08T18:30:00.000Z');
        expect(range!.end.toISOString()).toBe('2026-11-09T18:30:00.000Z');
      });

      it('parses "on 3 March" in India timezone', () => {
        const range = parseTemporalDate('what did I ask on 3 March', tz, refDate);
        expect(range).not.toBeNull();
        // March 3 00:00 IST is March 2 18:30 UTC
        expect(range!.start.toISOString()).toBe('2026-03-02T18:30:00.000Z');
        expect(range!.end.toISOString()).toBe('2026-03-03T18:30:00.000Z');
      });
    });

    describe('Timezone 3: Europe/London (GMT/BST)', () => {
      const tz = 'Europe/London';

      it('parses "yesterday" in London (GMT, UTC+0 in November)', () => {
        const range = parseTemporalDate('what did I ask yesterday', tz, refDate);
        expect(range).not.toBeNull();
        expect(range!.start.toISOString()).toBe('2026-11-11T00:00:00.000Z');
        expect(range!.end.toISOString()).toBe('2026-11-12T00:00:00.000Z');
      });
    });
  });

  describe('Non-temporal queries', () => {
    it('returns null when query has no date or time references', () => {
      expect(parseTemporalDate('what is quantum computing', 'UTC', refDate)).toBeNull();
      expect(parseTemporalDate('tell me about python asyncio', 'America/New_York', refDate)).toBeNull();
    });
  });
});
