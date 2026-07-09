import type { Glicko } from "../model/player.js";

/**
 * Glicko-2 rating update (Glickman, "Example of the Glicko-2 system"). Pure
 * and side-effect free — ratings/RD are stored and passed in Glicko scale
 * (~1500-centered); this module handles the internal μ/φ conversion.
 *
 * Applied once per rating period (here: once per tournament, batching every
 * set a player contested during that event) rather than incrementally per
 * game — incremental updates would let an early opponent's rating drift
 * mid-period and contaminate later games in the same period.
 */

const SCALE = 173.7178;
const DEFAULT_RATING = 1500;
const CONVERGENCE_EPSILON = 0.000001;

export interface GlickoOpponentResult {
  rating: number;
  rd: number;
  /** 1 = win, 0 = loss, 0.5 = draw */
  score: 0 | 0.5 | 1;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(mu: number, muOpp: number, phiOpp: number): number {
  return 1 / (1 + Math.exp(-g(phiOpp) * (mu - muOpp)));
}

/** Illinois-algorithm root find for the new volatility (step 5 of the spec). */
function newVolatility(phi: number, v: number, delta: number, volatility: number, tau: number): number {
  const a = Math.log(volatility * volatility);
  const deltaSq = delta * delta;
  const phiSq = phi * phi;

  const fx = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (deltaSq - phiSq - v - ex);
    const den = 2 * (phiSq + v + ex) * (phiSq + v + ex);
    return num / den - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (deltaSq > phiSq + v) {
    B = Math.log(deltaSq - phiSq - v);
  } else {
    let k = 1;
    while (fx(a - k * tau) < 0) k++;
    B = a - k * tau;
  }

  let fA = fx(A);
  let fB = fx(B);
  while (Math.abs(B - A) > CONVERGENCE_EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = fx(C);
    if (fC * fB < 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

/**
 * Updates one player's rating from every result in a single rating period.
 * `results` must use each opponent's rating as of the *start* of the period
 * (never a same-period, already-updated rating) — the caller is responsible
 * for snapshotting. An empty period only widens RD toward uncertainty, per
 * the spec's "no games this period" case.
 */
export function glicko2Update(player: Glicko, results: readonly GlickoOpponentResult[], tau: number): Glicko {
  const phi = player.rd / SCALE;

  if (results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + player.volatility * player.volatility);
    return { rating: player.rating, rd: phiStar * SCALE, volatility: player.volatility };
  }

  const mu = (player.rating - DEFAULT_RATING) / SCALE;

  let vInv = 0;
  let sum = 0;
  for (const r of results) {
    const muOpp = (r.rating - DEFAULT_RATING) / SCALE;
    const phiOpp = r.rd / SCALE;
    const gOpp = g(phiOpp);
    const e = expectedScore(mu, muOpp, phiOpp);
    vInv += gOpp * gOpp * e * (1 - e);
    sum += gOpp * (r.score - e);
  }
  const v = 1 / vInv;
  const delta = v * sum;

  const volatility = newVolatility(phi, v, delta, player.volatility, tau);
  const phiStar = Math.sqrt(phi * phi + volatility * volatility);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * sum;

  return {
    rating: newMu * SCALE + DEFAULT_RATING,
    rd: newPhi * SCALE,
    volatility,
  };
}
