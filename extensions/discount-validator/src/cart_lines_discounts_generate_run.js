import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
} from '../generated/api';

// -------------------------------------------------------
// Blocked SKUs — Discount will NOT apply if any of these
// products are present in the cart
// -------------------------------------------------------
const BLOCKED_SKUS = ['top-rocks-bundle', 'paloma-prokit', 'ivory-prokit'];

/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  */

/**
  * @param {RunInput} input
  * @returns {CartLinesDiscountsGenerateRunResult}
  */
export function cartLinesDiscountsGenerateRun(input) {
  // Empty cart — no discount
  if (!input.cart.lines.length) {
    return { operations: [] };
  }

  const hasOrderDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Order,
  );

  if (!hasOrderDiscountClass) {
    return { operations: [] };
  }

  // --- Blocked SKU Check ---
  // If ANY cart line has a blocked SKU, return no discount at all
  const hasBlockedSku = input.cart.lines.some(line => {
    const sku = (line.merchandise?.sku || '').toLowerCase().trim();
    return BLOCKED_SKUS.some(blocked => sku === blocked.toLowerCase());
  });

  if (hasBlockedSku) {
    // Blocked product found — do not apply discount
    return { operations: [] };
  }

  // --- Apply Discount ---
  // Read percentage from metafield (stored at discount creation time in apps.proxy.jsx)
  const percentageStr = input.discount.metafield?.value;
  const percentage = percentageStr ? parseFloat(percentageStr) : 10;

  return {
    operations: [
      {
        orderDiscountsAdd: {
          candidates: [
            {
              message: `${Math.round(percentage)}% OFF (Spin & Win)`,
              targets: [
                {
                  orderSubtotal: {
                    excludedCartLineIds: [],
                  },
                },
              ],
              value: {
                percentage: {
                  value: percentage,
                },
              },
            },
          ],
          selectionStrategy: OrderDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}