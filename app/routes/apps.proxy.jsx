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
    if (actionType === "check_coupon_status") {
      const code = formData.get("code");
      if (!code) return data({ used: false });

      try {
        const response = await admin.graphql(
          `#graphql
          query checkOrderWithDiscount($query: String!) {
            orders(first: 1, query: $query) {
              edges {
                node {
                  id
                }
              }
            }
          }
          `,
          { variables: { query: `discount_code:${code}` } }
        );
        const result = await response.json();
        
        if (result.errors) {
          console.error("GraphQL Error checking orders:", JSON.stringify(result.errors));
          return data({ used: false });
        }
        
        const hasOrder = result.data?.orders?.edges?.length > 0;
        
        return data({ used: hasOrder });
      } catch (err) {
        console.error("Check Status Error:", err);
        return data({ used: false });
      }
    }

    // --- Action 2: Process Spin Result & Record Lead ---
    const label = formData.get("label") || "";
    const customerId = formData.get("customerId");
    const isWin = formData.get("isWin") === "true";
    
    let finalCode = "NONE";
    let discountId = null;

    if (isWin) {
      // EXTREMELY STRICT matching: look for numbers followed by % or OFF or PERCENT
      const match = label.match(/(\d+)\s*(?:%|PERCENT|OFF)/i);
      if (!match) {
        console.log("No valid discount pattern found in label, recording as lead only:", label);
      } else {
        const percentageValue = parseFloat(match[1]) / 100;
        const uniqueId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const cleanValue = match[1];
        finalCode = `${cleanValue}PERCENT-${uniqueId}`;

        const discountInput = {
          title: `Spin Win ${finalCode}`,
          code: finalCode,
          startsAt: new Date().toISOString(),
          customerSelection: { all: true },
          appliesOncePerCustomer: true,
          customerGets: {
            value: { percentage: percentageValue },
            items: { all: true }
          },
          usageLimit: parseInt(formData.get("usageLimit")) || 1
        };

        if (customerId) {
          discountInput.customerSelection = {
            customers: { add: [customerId] }
          };
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
    }

    // --- Action 3: Save to Database (ALWAYS - Win or Loss) ---
    try {
      await db.lead.create({
        data: {
          shop: session.shop,
          email: email,
          prize: label,
          couponCode: finalCode
        }
      });
      console.log("Lead successfully recorded for:", email, "Prize:", label);
    } catch (dbErr) {
      console.error("Database Save Error:", dbErr);
      // Still return the code to user if we generated one
    }

    return data({ success: true, code: finalCode === "NONE" ? null : finalCode });

  } catch (err) {
    console.error("CRITICAL PROXY ERROR:", err);
    return data({ error: "Server Error: " + err.message });
  }
};
