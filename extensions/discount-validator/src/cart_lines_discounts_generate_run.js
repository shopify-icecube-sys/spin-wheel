import {
  OrderDiscountSelectionStrategy,
} from '../generated/api';

// -------------------------------------------------------
// TEMPORARY DEBUG VERSION — Always blocks ALL discounts
// This confirms whether the Shopify Function is being
// called at checkout or not.
// -------------------------------------------------------

/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  */

/**
  * @param {RunInput} input
  * @returns {CartLinesDiscountsGenerateRunResult}
  */
export function cartLinesDiscountsGenerateRun(input) {
  // TEMP DEBUG: Always return no discount to confirm function is being called
  return { operations: [] };
}