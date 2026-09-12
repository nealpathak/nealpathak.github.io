// Runs the engines off the main thread so the page stays smooth while the
// artifacts compute. Posts the artifacts first, then the quote pricing.
import { computeArtifacts, priceQuotes } from './compute.mjs';

self.onmessage = () => {
  const a = computeArtifacts();
  const { _ctx, ...artifacts } = a;
  self.postMessage({ stage: 'artifacts', data: artifacts });
  self.postMessage({ stage: 'quotes', data: priceQuotes(_ctx) });
};
