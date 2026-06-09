import { data } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  return data({ message: "Proxy is working" });
};

export const action = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.public.appProxy(request);

    if (!admin || !session) {
      console.error("Proxy Error: No admin or session object returned");
      return data({ error: "Unauthorized access to app proxy. Please refresh the page." });
    }

    const formData = await request.formData();
    const actionType = formData.get("action");
    const rawEmail = formData.get("email") || "";
    const email = rawEmail.trim().toLowerCase(); // NORMALIZE: Always lowercase

    console.log("Proxy Action received:", actionType, "for email:", email);

    // --- Action 1: Create Customer & Check Cooldown ---
    if (actionType === "create_customer") {
      if (!email) return data({ error: "Email is required" }, { status: 400 });

      // --- Action 1a: Check Server-Side Cooldown (Database) ---
      try {
        const existingLead = await db.lead.findFirst({
          where: { email, shop: session.shop },
          orderBy: { createdAt: 'desc' }
        });

        if (existingLead) {
          const cooldownDays = parseInt(formData.get("cooldownDays")) || 30;
          const diff = Date.now() - new Date(existingLead.createdAt).getTime();
          const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;

          if (diff < cooldownMs) {
            const remainingDays = Math.ceil((cooldownMs - diff) / (24 * 60 * 60 * 1000));
            console.log(`Cooldown active for ${email}: ${remainingDays} days left.`);
            return data({
              error: `This email has already been used. You can spin again in ${remainingDays} days.`
            });
          }
        }
      } catch (dbErr) {
        console.error("Database Cooldown Check Error:", dbErr);
      }

      console.log("Attempting to create customer for email:", email);

      const response = await admin.graphql(
        `#graphql
        mutation customerCreate($input: CustomerInput!) {
          customerCreate(input: $input) {
            customer { id }
            userErrors { field message }
          }
        }
        `,
        {
          variables: {
            input: {
              email,
              tags: ["Spin-Win-User"],
              emailMarketingConsent: {
                marketingState: "SUBSCRIBED",
                marketingOptInLevel: "SINGLE_OPT_IN"
              }
            }
          }
        }
      );

      const result = await response.json();

      if (result.errors) {
        console.error("GraphQL Execution Errors:", JSON.stringify(result.errors, null, 2));
        if (result.errors[0].message.includes("access the Customer object")) {
          return data({ error: "PERMISSION REQUIRED: Please go to your Shopify Partner Dashboard -> App -> API Access and request access to 'Protected Customer Data'." });
        }
        return data({ error: "Shopify API Error: " + result.errors[0].message });
      }

      const customer = result.data?.customerCreate?.customer;
      const userErrors = result.data?.customerCreate?.userErrors;

      if (userErrors && userErrors.length > 0) {
        const isAlreadyExists = userErrors.some(e =>
          e.message.toLowerCase().includes("taken") ||
          e.message.toLowerCase().includes("exists") ||
          e.message.toLowerCase().includes("already")
        );

        if (isAlreadyExists) {
          // Fetch the existing customer ID
          const searchRes = await admin.graphql(
            `#graphql
            query($query: String!) {
              customers(first: 1, query: $query) {
                nodes { id }
              }
            }
            `,
            { variables: { query: `email:${email}` } }
          );
          const searchData = await searchRes.json();
          const existingId = searchData.data?.customers?.nodes[0]?.id;
          return data({ success: true, existing: true, customerId: existingId });
        }
        return data({ error: userErrors[0].message });
      }

      return data({ success: true, customerId: customer?.id });
    }

    // --- Action 4: Check Coupon Status ---
    if (actionType === "check_coupon_status" || actionType === "expire_coupon" || actionType === "cleanup_expired") {
      try {
        const rawExpiry = formData.get("expiryMinutes");
        let expiryMinutes = rawExpiry ? parseInt(rawExpiry) : null;
        const code = formData.get("code");

        // Only fetch settings if expiryMinutes was not passed from frontend
        if (expiryMinutes === null) {
          const appInstRes = await admin.graphql(`
            query { currentAppInstallation { metafield(namespace: "wheelify", key: "settings") { value } } }
          `);
          const appInstJson = await appInstRes.json();
          const settings = JSON.parse(appInstJson.data?.currentAppInstallation?.metafield?.value || '{}');
          expiryMinutes = settings.couponExpiryMinutes || 60;
        }

        // Helper function to delete a discount by its code
        const deleteDiscountByCode = async (targetCode) => {
          if (!targetCode || targetCode === "NONE") return;
          console.log(`Attempting to delete coupon: ${targetCode}`);

          // Try multiple search strategies
          const searchQueries = [
            `code:'${targetCode}'`,
            `title:'Spin Win ${targetCode}'`
          ];

          for (const query of searchQueries) {
            const findRes = await admin.graphql(
              `#graphql
              query findDiscount($query: String!) {
                codeDiscountNodes(first: 1, query: $query) {
                  nodes { id }
                }
              }
              `,
              { variables: { query } }
            );
            const findJson = await findRes.json();
            const discountId = findJson.data?.codeDiscountNodes?.nodes[0]?.id;

            if (discountId) {
              const updateRes = await admin.graphql(
                `#graphql
                mutation expireDiscount($id: ID!, $basicCodeDiscount: DiscountCodeBasicInput!) {
                  discountCodeBasicUpdate(id: $id, basicCodeDiscount: $basicCodeDiscount) {
                    codeDiscountNode { id }
                    userErrors { field message }
                  }
                }
                `,
                {
                  variables: {
                    id: discountId,
                    basicCodeDiscount: {
                      endsAt: new Date(Date.now() - 60000).toISOString() // Expire 1 minute ago
                    }
                  }
                }
              );
              const updateJson = await updateRes.json();
              if (updateJson.data?.discountCodeBasicUpdate?.codeDiscountNode?.id) {
                console.log(`Successfully expired coupon: ${targetCode}`);
                return true;
              }
            }
          }
          return false;
        };

        // --- Action: cleanup_expired ---
        if (actionType === "cleanup_expired") {
          if (expiryMinutes <= 0) return data({ success: true });
          const threshold = new Date(Date.now() - (expiryMinutes * 60 * 1000));
          const expiredLeads = await db.lead.findMany({
            where: {
              shop: session.shop,
              createdAt: { lt: threshold }
            },
            take: 10,
            orderBy: { createdAt: 'asc' }
          });

          for (const lead of expiredLeads) {
            await deleteDiscountByCode(lead.couponCode);
          }
          return data({ success: true });
        }

        // --- Action: check_coupon_status ---
        let hasOrder = false;
        if (actionType === "check_coupon_status") {
          if (!code) return data({ used: false });

          // We use order search because it is the most reliable source of truth
          // across all Shopify API versions and handles sync delays better.
          const orderRes = await admin.graphql(
            `#graphql
            query checkOrderWithDiscount($query: String!) {
              orders(first: 1, query: $query) {
                nodes { id }
              }
            }
            `,
            { variables: { query: `discount_code:${code}` } }
          );
          const orderJson = await orderRes.json();

          if (orderJson.errors) {
            console.error("Order Search Error:", JSON.stringify(orderJson.errors));
          }

          hasOrder = orderJson.data?.orders?.nodes?.length > 0;

          // If found used, we can return early
          if (hasOrder) return data({ used: true });
        }

        // --- Action: expire_coupon or self-healing check ---
        const lead = await db.lead.findFirst({
          where: { couponCode: code, shop: session.shop }
        });

        if (lead || actionType === "expire_coupon") {
          const createdAt = lead ? new Date(lead.createdAt).getTime() : 0;
          const isExpired = lead && expiryMinutes > 0 && (Date.now() - createdAt > expiryMinutes * 60 * 1000);

          if (isExpired || actionType === "expire_coupon") {
            await deleteDiscountByCode(code);
            if (isExpired) return data({ used: false, expired: true });
          }
        }

        return data({ used: hasOrder });
      } catch (err) {
        console.error("Coupon Proxy Error:", err.message || err);
        return data({ used: false, error: "Something went wrong" });
      }
    }

    // --- Action 2: Process Spin Result & Record Lead ---
    if (actionType === "record_lead" || !actionType) {
      const label = formData.get("label") || "";
      const customerId = formData.get("customerId");
      const isWin = formData.get("isWin") === "true";

      let finalCode = "NONE";
      let discountId = null;

      if (isWin) {
        const discountValueStr = formData.get("discountValue") || "10";
        let numericValue = parseFloat(discountValueStr);
        if (isNaN(numericValue) || numericValue <= 0) numericValue = 10;

        const percentageValue = numericValue / 100;
        const cleanValue = Math.round(numericValue).toString();
        const uniqueId = Math.random().toString(36).substring(2, 8).toUpperCase();
        finalCode = `${cleanValue}PERCENT-${uniqueId}`;

        console.log(`Creating discount: ${cleanValue}% OFF → code: ${finalCode}`);

        const expiryMinutes = parseInt(formData.get("expiryMinutes")) || 0;

        let effectiveCustomerId = customerId;
        if (!effectiveCustomerId || !effectiveCustomerId.includes("Customer")) {
          try {
            const searchRes = await admin.graphql(
              `#graphql
              query($query: String!) {
                customers(first: 1, query: $query) {
                  nodes { id }
                }
              }
              `,
              { variables: { query: `email:${email}` } }
            );
            const searchData = await searchRes.json();
            effectiveCustomerId = searchData.data?.customers?.nodes[0]?.id;
          } catch (e) {
            console.error("Fallback Customer Search Error:", e);
          }
        }

        const discountInput = {
          title: `Spin Win ${finalCode}`,
          code: finalCode,
          startsAt: new Date().toISOString(),
          customerSelection: effectiveCustomerId ? {
            customers: { add: [effectiveCustomerId] }
          } : { all: true },
          appliesOncePerCustomer: true,
          customerGets: {
            value: { percentage: percentageValue },
            items: { all: true }
          },
          usageLimit: 1
        };

        if (expiryMinutes > 0) {
          const endsAt = new Date(Date.now() + (expiryMinutes * 60 * 1000));
          discountInput.endsAt = endsAt.toISOString();
        }

        const response = await admin.graphql(
          `#graphql
          mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
            discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
              codeDiscountNode { id }
              userErrors { field message }
            }
          }
          `,
          { variables: { basicCodeDiscount: discountInput } }
        );

        const result = await response.json();

        if (result.errors) {
          console.error("Shopify GraphQL Error:", JSON.stringify(result.errors));
          return data({ error: result.errors[0].message });
        }

        if (result.data?.discountCodeBasicCreate?.codeDiscountNode) {
          discountId = result.data.discountCodeBasicCreate.codeDiscountNode.id;
        } else if (result.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
          console.error("Shopify Discount User Error:", JSON.stringify(result.data.discountCodeBasicCreate.userErrors));
          return data({ error: result.data.discountCodeBasicCreate.userErrors[0].message });
        }
      }

      try {
        await db.lead.create({
          data: {
            shop: session.shop,
            email: email,
            prize: label,
            couponCode: finalCode,
            discountId: discountId
          }
        });
        console.log("Lead successfully recorded for:", email, "Prize:", label);
      } catch (dbErr) {
        console.error("Database Save Error:", dbErr);
      }

      return data({ success: true, code: finalCode === "NONE" ? null : finalCode });
    }

    return data({ error: "Invalid action type" });

  } catch (err) {
    console.error("CRITICAL PROXY ERROR:", err);
    return data({ error: "Server Error: " + err.message });
  }
};
