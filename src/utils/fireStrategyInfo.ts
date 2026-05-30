import type { FireTargetId } from '../types';

export interface FireStrategyInfo {
  /** One-paragraph plain-English explanation of the strategy. */
  summary: string;
  /** How the target number is derived (with placeholders filled at render time). */
  formula: string;
  /** Bullet points: who this fits / when it makes sense. */
  bestFor: string[];
  /** Bullet points: trade-offs and risks to keep in mind. */
  watchOut: string[];
}

/**
 * Static educational copy for each FIRE strategy. Kept out of the component so the
 * prose is easy to review and edit in one place. Dynamic numbers (the user's actual
 * targets) are layered in by the component, not baked in here.
 */
export const FIRE_STRATEGY_INFO: Record<FireTargetId, FireStrategyInfo> = {
  full: {
    summary:
      'Full FIRE (sometimes "Regular FIRE") is the classic target: a portfolio large enough that a safe withdrawal each year covers your entire normal spending, indefinitely, without any paycheck. Once you hit this number you are financially independent — work becomes optional.',
    formula:
      'Annual spending ÷ safe withdrawal rate. At a 4% withdrawal rate this is the well-known "25× your annual spending" rule (because 1 ÷ 0.04 = 25).',
    bestFor: [
      'People who want their current lifestyle fully funded with no compromises',
      'Anyone who wants a single, unambiguous "I can stop working" number',
      'Plans where you do not expect or want any future earned income',
    ],
    watchOut: [
      'It is the largest of the core targets, so it takes the longest to reach',
      'The 4% rule was built on a 30-year US horizon — very early retirees may want a lower rate (3.25–3.5%) for a 40–50 year retirement',
      'Sequence-of-returns risk in the first decade matters more than the average return — see the Monte Carlo tab',
    ],
  },
  lean: {
    summary:
      'Lean FIRE funds a deliberately trimmed-down lifestyle — the essentials and a little more, but with the discretionary fat cut out. Because the spending target is smaller, the portfolio you need is smaller too, so you reach independence years sooner than Full FIRE.',
    formula:
      '(Annual spending × Lean %) ÷ safe withdrawal rate. The Lean % (default 70%) is the slice of your normal spending you would live on in a lean retirement.',
    bestFor: [
      'Frugal-minded people comfortable with a minimalist or low-cost-of-living lifestyle',
      'Those who want to escape mandatory work as early as possible and optimize later',
      'People with paid-off housing or low fixed costs',
    ],
    watchOut: [
      'Little margin for surprises — a big medical bill or home repair hits harder',
      'Lifestyle inflation or a growing family can quietly break a lean plan',
      'Often pairs well with some part-time income as a buffer (see Barista FIRE)',
    ],
  },
  fat: {
    summary:
      'Fat FIRE funds a comfortable, even generous lifestyle — travel, dining, hobbies, gifting — with plenty of cushion. It is the most expensive target because you are buying both a richer lifestyle and a thicker safety margin.',
    formula:
      '(Annual spending × Fat %) ÷ safe withdrawal rate. The Fat % (default 160%) is how much more than your baseline spending you want to fund.',
    bestFor: [
      'High earners who want to retire without cutting back at all',
      'People who value a large safety buffer against market downturns and surprises',
      'Those planning expensive retirements: lots of travel, second home, supporting family',
    ],
    watchOut: [
      'The biggest number on the board — typically requires a high savings rate or a longer horizon',
      'Easy to let the target drift upward forever; lock in what "enough" actually means',
      'Reaching it later in life leaves fewer healthy years to enjoy the extra spending',
    ],
  },
  coast: {
    summary:
      'Coast FIRE is a milestone, not a finish line. It is the point where your existing investments — with zero further contributions — will grow on their own to your Full FIRE number by your retirement age. After Coast, you still work to cover current expenses, but you no longer need to save for retirement. Compounding does the rest.',
    formula:
      'The portfolio today that, growing at your real return with no new contributions, equals your Full FIRE number by your target retirement age. Earlier retirement ages and lower returns push this number higher.',
    bestFor: [
      'People earlier in their career who want to "front-load" saving then ease off',
      'Anyone wanting to switch to lower-paying but more fulfilling work',
      'Parents or career-changers who want to stop retirement saving without falling behind',
    ],
    watchOut: [
      'You still need income to cover today\'s expenses — it is not retirement',
      'Depends heavily on the assumed return; a weak decade can knock you off the coast path',
      'Stopping contributions early leaves less flexibility if plans change',
    ],
  },
  barista: {
    summary:
      'Barista FIRE blends a smaller portfolio with ongoing part-time income (the classic example being a part-time job for the health benefits, hence "barista"). Your investments cover most of your spending; modest earned income covers the rest — so the portfolio you need is meaningfully smaller than Full FIRE.',
    formula:
      '(Annual spending − part-time income) ÷ safe withdrawal rate. Every dollar of reliable part-time income is one less dollar your portfolio has to produce.',
    bestFor: [
      'People who enjoy some work but want to drop the full-time grind',
      'Early retirees bridging the gap to Social Security or pension age',
      'Anyone who wants health benefits or social structure from part-time work',
    ],
    watchOut: [
      'Relies on continued ability and willingness to earn — health or job markets can change',
      'Part-time income is often less stable and rarely inflation-protected',
      'If the part-time income stops, you may fall back on a portfolio sized below Full FIRE',
    ],
  },
};
