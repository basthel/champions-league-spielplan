/* Curated Double Out recommendations; no runtime network request is needed.
 * References and selection notes: docs/checkout-routes.md.
 * A route is a recommendation, not a claim of optimality for every player.
 */
(function (root) {
  'use strict';
  const threeDarts = {
    2: 'D1', 3: '1 D1', 4: 'D2', 5: '1 D2', 6: 'D3', 7: '3 D2',
    8: 'D4', 9: '1 D4', 10: 'D5', 11: '3 D4', 12: 'D6', 13: '5 D4',
    14: 'D7', 15: '7 D4', 16: 'D8', 17: '1 D8', 18: 'D9', 19: '3 D8',
    20: 'D10', 21: '5 D8', 22: 'D11', 23: '7 D8', 24: 'D12', 25: '9 D8',
    26: 'D13', 27: '11 D8', 28: 'D14', 29: '13 D8', 30: 'D15', 31: '15 D8',
    32: 'D16', 33: '1 D16', 34: 'D17', 35: '3 D16', 36: 'D18', 37: '5 D16',
    38: 'D19', 39: '7 D16', 40: 'D20', 41: '9 D16', 42: '10 D16',
    43: '11 D16', 44: '12 D16', 45: '13 D16', 46: '6 D20', 47: '15 D16',
    48: '16 D16', 49: '9 D20', 50: '10 D20', 51: '11 D20', 52: '12 D20',
    53: '13 D20', 54: '14 D20', 55: '15 D20', 56: '16 D20', 57: '17 D20',
    58: '18 D20', 59: '19 D20', 60: '20 D20', 61: 'T15 D8', 62: 'T10 D16',
    63: 'T13 D12', 64: 'T16 D8', 65: 'T19 D4', 66: 'T10 D18', 67: 'T17 D8',
    68: 'T20 D4', 69: 'T15 D12', 70: 'T10 D20', 71: 'T13 D16',
    72: 'T16 D12', 73: 'T19 D8', 74: 'T14 D16', 75: 'T17 D12', 76: 'T20 D8',
    77: 'T19 D10', 78: 'T18 D12', 79: 'T13 D20', 80: 'T20 D10',
    81: 'T19 D12', 82: 'Bull D16', 83: 'T17 D16', 84: 'T20 D12',
    85: 'T15 D20', 86: 'T18 D16', 87: 'T17 D18', 88: 'T16 D20',
    89: 'T19 D16', 90: 'T18 D18', 91: 'T17 D20', 92: 'T20 D16',
    93: 'T19 D18', 94: 'T18 D20', 95: 'T19 D19', 96: 'T20 D18',
    97: 'T19 D20', 98: 'T20 D19', 99: 'T19 10 D16', 100: 'T20 D20',
    101: 'T20 9 D16', 102: 'T20 10 D16', 103: 'T20 3 D20',
    104: 'T18 18 D16', 105: 'T19 16 D16', 106: 'T20 14 D16',
    107: 'T19 18 D16', 108: 'T20 16 D16', 109: 'T19 20 D16',
    110: 'T20 18 D16', 111: 'T20 19 D16', 112: 'T20 12 D20',
    113: 'T20 13 D20', 114: 'T20 14 D20', 115: 'T20 15 D20',
    116: 'T20 16 D20', 117: 'T20 17 D20', 118: 'T20 18 D20',
    119: 'T19 T10 D16', 120: 'T20 20 D20', 121: 'T17 T10 D20',
    122: 'T18 T20 D4', 123: 'T19 T16 D9', 124: 'T20 T16 D8',
    125: '25 T20 D20', 126: 'T19 T19 D6', 127: 'T20 T17 D8',
    128: 'T18 T14 D16', 129: 'T19 T16 D12', 130: 'T20 20 Bull',
    131: 'T20 T13 D16', 132: 'T20 T16 D12', 133: 'T20 T19 D8',
    134: 'T20 T14 D16', 135: 'T20 T17 D12', 136: 'T20 T20 D8',
    137: 'T19 T16 D16', 138: 'T20 T18 D12', 139: 'T19 T14 D20',
    140: 'T20 T16 D16', 141: 'T20 T19 D12', 142: 'T20 T14 D20',
    143: 'T20 T17 D16', 144: 'T20 T20 D12', 145: 'T20 T15 D20',
    146: 'T20 T18 D16', 147: 'T20 T17 D18', 148: 'T20 T16 D20',
    149: 'T20 T19 D16', 150: 'T20 T18 D18', 151: 'T20 T17 D20',
    152: 'T20 T20 D16', 153: 'T20 T19 D18', 154: 'T20 T18 D20',
    155: 'T20 T19 D19', 156: 'T20 T20 D18', 157: 'T20 T19 D20',
    158: 'T20 T20 D19', 160: 'T20 T20 D20', 161: 'T20 T17 Bull',
    164: 'T20 T18 Bull', 167: 'T20 T19 Bull', 170: 'T20 T20 Bull'
  };
  // A spare dart favors an ordinary double over a bull finish on 50/101–110.
  // With only two darts, the four high finishes require the bullseye.
  const twoDarts = Object.fromEntries(Object.entries(threeDarts).filter(([, route]) => route.split(' ').length <= 2));
  Object.assign(twoDarts, {82: 'T14 D20', 101: 'T17 Bull', 104: 'T18 Bull', 107: 'T19 Bull', 110: 'T20 Bull'});
  const oneDart = Object.fromEntries(Array.from({length: 20}, (_, i) => [2 * (i + 1), `D${i + 1}`]));
  oneDart[50] = 'Bull';
  const api = Object.freeze({
    checkedAt: '2026-10-29',
    sources: Object.freeze([
      'https://www.darts-uk.co.uk/downloads/Darts-UK_Darts_Checkout_Chart.pdf',
      'https://darts501.com/Check.html',
      'https://thedarts.app/guides/checkout-chart',
      'https://dartson.app/tools/darts-checkouts/'
    ]),
    byDarts: Object.freeze({1: Object.freeze(oneDart), 2: Object.freeze(twoDarts), 3: Object.freeze(threeDarts)})
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DartsCheckoutData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
