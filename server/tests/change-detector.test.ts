import { describe, it, expect } from 'vitest';
import {
  HistoricalChangeDetector,
  type HistoricalPlan,
  type CurrentPlan,
} from '../src/services/comparison/change-detector.js';

describe('Historical Change-Detection Engine', () => {
  const detector = new HistoricalChangeDetector();

  it('calculates price difference and percentage increase for HubSpot CRM', () => {
    const historical: HistoricalPlan = {
      entity: 'HubSpot',
      planName: 'Starter',
      pricePerSeatMonthly: 20,
      billingCycle: 'monthly',
      features: ['Contact management', 'Email marketing'],
    };

    const current: CurrentPlan = {
      entity: 'HubSpot',
      planName: 'Starter',
      pricePerSeatMonthly: 25,
      billingCycle: 'monthly',
      features: ['Contact management', 'Email marketing', 'AI Assistant'],
    };

    const result = detector.comparePlan(historical, current, 20);

    expect(result.isComparable).toBe(true);
    expect(result.priceDifference).toBe(5); // 25 - 20 = 5
    expect(result.percentageChange).toBe(25); // (5 / 20) * 100 = 25%
    expect(result.teamMonthlyTotal.historicalTotal).toBe(400); // 20 * 20
    expect(result.teamMonthlyTotal.currentTotal).toBe(500); // 25 * 20
    expect(result.teamMonthlyTotal.difference).toBe(100);
    expect(result.featuresAdded).toEqual(['AI Assistant']);
    expect(result.featuresRemoved).toEqual([]);
  });

  it('calculates price difference and percentage decrease for Neon Postgres', () => {
    const historical: HistoricalPlan = {
      entity: 'Neon',
      planName: 'Launch',
      pricePerSeatMonthly: 19,
      billingCycle: 'monthly',
    };

    const current: CurrentPlan = {
      entity: 'Neon',
      planName: 'Launch',
      pricePerSeatMonthly: 15,
      billingCycle: 'monthly',
    };

    const result = detector.comparePlan(historical, current, 10);

    expect(result.isComparable).toBe(true);
    expect(result.priceDifference).toBe(-4); // 15 - 19 = -4
    expect(result.percentageChange).toBe(-21.05); // -4 / 19 = -21.05%
    expect(result.teamMonthlyTotal.difference).toBe(-40);
  });

  it('flags non-comparable tiers when billing cycles differ (monthly vs annual)', () => {
    const historical: HistoricalPlan = {
      entity: 'Salesforce',
      planName: 'Starter',
      pricePerSeatMonthly: 25,
      billingCycle: 'monthly',
    };

    const current: CurrentPlan = {
      entity: 'Salesforce',
      planName: 'Starter',
      pricePerSeatMonthly: 20,
      billingCycle: 'annual',
    };

    const result = detector.comparePlan(historical, current, 20);

    expect(result.isComparable).toBe(false);
    expect(result.nonComparableReason).toContain('Different billing cycles');
    expect(result.summaryStatement).toContain('Direct comparison invalid');
  });

  it('batch compares multiple entities and formats markdown comparison table', () => {
    const historicalList: HistoricalPlan[] = [
      { entity: 'HubSpot', planName: 'Starter', pricePerSeatMonthly: 20, billingCycle: 'monthly' },
      { entity: 'Pipedrive', planName: 'Essential', pricePerSeatMonthly: 24, billingCycle: 'monthly' },
      { entity: 'Zoho', planName: 'Standard', pricePerSeatMonthly: 14, billingCycle: 'monthly' },
    ];

    const currentList: CurrentPlan[] = [
      { entity: 'HubSpot', planName: 'Starter', pricePerSeatMonthly: 20, billingCycle: 'monthly' },
      { entity: 'Pipedrive', planName: 'Essential', pricePerSeatMonthly: 28, billingCycle: 'monthly' },
      { entity: 'Zoho', planName: 'Standard', pricePerSeatMonthly: 14, billingCycle: 'monthly' },
    ];

    const batch = detector.batchCompare(historicalList, currentList, 20);
    expect(batch.length).toBe(3);

    const table = detector.formatComparisonTable(batch);
    expect(table).toContain('HubSpot');
    expect(table).toContain('Pipedrive');
    expect(table).toContain('+$4');
    expect(table).toContain('+16.67%');
  });
});

