/**
 * Historical Change-Detection Engine for Recall AI.
 * Compares past conversational facts against current web-search discoveries.
 * Computes exact mathematical price differences, percentage shifts, team monthly totals,
 * identifies feature changes, and flags non-comparable tiers.
 */

export interface HistoricalPlan {
  entity: string;
  planName: string;
  pricePerSeatMonthly: number;
  billingCycle: 'monthly' | 'annual';
  features?: string[];
  usageLimits?: Record<string, string | number>;
  dateRecorded?: string;
}

export interface CurrentPlan {
  entity: string;
  planName: string;
  pricePerSeatMonthly: number;
  billingCycle: 'monthly' | 'annual';
  features?: string[];
  usageLimits?: Record<string, string | number>;
  verifiedFromSource?: string;
}

export interface ComparisonResult {
  entity: string;
  planName: string;
  isComparable: boolean;
  nonComparableReason?: string;
  historicalPrice: number;
  currentPrice: number;
  priceDifference: number;
  percentageChange: number;
  teamMonthlyTotal: {
    seats: number;
    historicalTotal: number;
    currentTotal: number;
    difference: number;
  };
  featuresAdded: string[];
  featuresRemoved: string[];
  summaryStatement: string;
}

export class HistoricalChangeDetector {
  /**
   * Compares a single historical plan against a verified current plan.
   */
  public comparePlan(
    historical: HistoricalPlan,
    current: CurrentPlan,
    teamSeats = 20
  ): ComparisonResult {
    // 1. Check comparability criteria
    if (historical.billingCycle !== current.billingCycle) {
      return {
        entity: historical.entity,
        planName: historical.planName,
        isComparable: false,
        nonComparableReason: `Different billing cycles (${historical.billingCycle} vs ${current.billingCycle}) make direct price comparison invalid.`,
        historicalPrice: historical.pricePerSeatMonthly,
        currentPrice: current.pricePerSeatMonthly,
        priceDifference: 0,
        percentageChange: 0,
        teamMonthlyTotal: {
          seats: teamSeats,
          historicalTotal: historical.pricePerSeatMonthly * teamSeats,
          currentTotal: current.pricePerSeatMonthly * teamSeats,
          difference: 0,
        },
        featuresAdded: [],
        featuresRemoved: [],
        summaryStatement: `${historical.entity} ${historical.planName}: Direct comparison invalid due to mismatched billing frequency (${historical.billingCycle} vs ${current.billingCycle}).`,
      };
    }

    // 2. Compute exact price difference: current - historical
    const priceDiff = Math.round((current.pricePerSeatMonthly - historical.pricePerSeatMonthly) * 100) / 100;

    // 3. Compute percentage change: ((current - historical) / historical) * 100
    const pctChange =
      historical.pricePerSeatMonthly === 0
        ? 0
        : Math.round(((current.pricePerSeatMonthly - historical.pricePerSeatMonthly) / historical.pricePerSeatMonthly) * 10000) / 100;

    // 4. Team monthly totals (e.g. 20 seats)
    const histTeam = Math.round(historical.pricePerSeatMonthly * teamSeats * 100) / 100;
    const currTeam = Math.round(current.pricePerSeatMonthly * teamSeats * 100) / 100;
    const teamDiff = Math.round((currTeam - histTeam) * 100) / 100;

    // 5. Features added and removed
    const histFeatures = new Set((historical.features || []).map((f) => f.trim().toLowerCase()));
    const currFeatures = new Set((current.features || []).map((f) => f.trim().toLowerCase()));

    const featuresAdded = (current.features || []).filter(
      (f) => !histFeatures.has(f.trim().toLowerCase())
    );
    const featuresRemoved = (historical.features || []).filter(
      (f) => !currFeatures.has(f.trim().toLowerCase())
    );

    // 6. Summary statement
    let changeDir = 'unchanged';
    if (priceDiff > 0) {
      changeDir = `increased by $${priceDiff} (+${pctChange}%)`;
    } else if (priceDiff < 0) {
      changeDir = `decreased by $${Math.abs(priceDiff)} (${pctChange}%)`;
    }

    const summaryStatement = `${historical.entity} (${historical.planName}): Price has ${changeDir} from $${historical.pricePerSeatMonthly}/seat to $${current.pricePerSeatMonthly}/seat. For a team of ${teamSeats}, monthly cost shifted from $${histTeam} to $${currTeam} (delta: ${teamDiff >= 0 ? `+$${teamDiff}` : `-$${Math.abs(teamDiff)}`}).`;

    return {
      entity: historical.entity,
      planName: historical.planName,
      isComparable: true,
      historicalPrice: historical.pricePerSeatMonthly,
      currentPrice: current.pricePerSeatMonthly,
      priceDifference: priceDiff,
      percentageChange: pctChange,
      teamMonthlyTotal: {
        seats: teamSeats,
        historicalTotal: histTeam,
        currentTotal: currTeam,
        difference: teamDiff,
      },
      featuresAdded,
      featuresRemoved,
      summaryStatement,
    };
  }

  /**
   * Compares batches of historical plans with current plans matching entity and plan names.
   */
  public batchCompare(
    historicalList: HistoricalPlan[],
    currentList: CurrentPlan[],
    teamSeats = 20
  ): ComparisonResult[] {
    const currentMap = new Map<string, CurrentPlan>();
    for (const c of currentList) {
      currentMap.set(`${c.entity.toLowerCase()}::${c.planName.toLowerCase()}`, c);
    }

    const results: ComparisonResult[] = [];
    for (const h of historicalList) {
      const match = currentMap.get(`${h.entity.toLowerCase()}::${h.planName.toLowerCase()}`);
      if (match) {
        results.push(this.comparePlan(h, match, teamSeats));
      }
    }
    return results;
  }

  /**
   * Generates a clean markdown comparison table.
   */
  public formatComparisonTable(results: ComparisonResult[]): string {
    const lines = [
      '| Entity | Plan | Historical Price | Current Price | Delta / Seat | % Change | Team Total (20 Seats) | Status |',
      '|---|---|:---:|:---:|:---:|:---:|:---:|:---:|',
    ];

    for (const r of results) {
      if (!r.isComparable) {
        lines.push(
          `| **${r.entity}** | ${r.planName} | $${r.historicalPrice} | $${r.currentPrice} | N/A | N/A | $${r.teamMonthlyTotal.currentTotal} | Non-Comparable (${r.nonComparableReason}) |`
        );
      } else {
        const deltaStr = r.priceDifference >= 0 ? `+$${r.priceDifference}` : `-$${Math.abs(r.priceDifference)}`;
        const pctStr = r.percentageChange >= 0 ? `+${r.percentageChange}%` : `${r.percentageChange}%`;
        const teamDelta = r.teamMonthlyTotal.difference >= 0 ? `+$${r.teamMonthlyTotal.difference}` : `-$${Math.abs(r.teamMonthlyTotal.difference)}`;
        lines.push(
          `| **${r.entity}** | ${r.planName} | $${r.historicalPrice} | $${r.currentPrice} | ${deltaStr} | ${pctStr} | $${r.teamMonthlyTotal.currentTotal} (${teamDelta}) | Comparable |`
        );
      }
    }

    return lines.join('\n');
  }
}

export const changeDetector = new HistoricalChangeDetector();
