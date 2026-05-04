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

    console.log("Proxy Action received:", actionType, "for shop:", session.shop);

    // --- Action 1: Create Customer (Lead Generation) ---
    if (actionType === "create_customer") {
      const email = formData.get("email");
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
            const remainingMs = cooldownMs - diff;
            const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
            return data({ 
              error: `This email has already been used. You can spin again in ${remainingDays} ${remainingDays === 1 ? 'day' : 'days'}.` 
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

    // --- Action 2: Generate Unique Discount ---
    const label = formData.get("label") || "";
    const email = formData.get("email") || "Unknown";
    const customerId = formData.get("customerId");
    const usageLimit = parseInt(formData.get("usageLimit")) || 1;
    const expiryMinutes = parseInt(formData.get("expiryMinutes")) || 0;

    // Enhanced matching: look for numbers in the label
    const match = label.match(/(\d+)/);
    if (!match) {
        console.log("No numerical value found in label, skipping discount generation for:", label);
        return data({ error: "This segment does not carry a discount." });
    }

    const percentageValue = parseFloat(match[1]) / 100;
    
    // Safety check: ensure percentage is between 1% and 100%
    if (percentageValue <= 0 || percentageValue > 1) {
        return data({ error: "Invalid discount percentage." });
    }
    
    const uniqueId = Math.random().toString(36).substring(2, 6).toUpperCase();
    const cleanValue = match[1];
    const finalCode = `${cleanValue}PERCENT-${uniqueId}`;

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
      usageLimit: usageLimit
    };

    if (customerId) {
       discountInput.customerSelection = {
         customers: { add: [customerId] }
       };
    }

    if (expiryMinutes > 0) {
      discountInput.endsAt = new Date(Date.now() + expiryMinutes * 60000).toISOString();
    }

    console.log("Generating discount for label:", label, "code:", finalCode, "expires in:", expiryMinutes, "mins");

    const response = await admin.graphql(
      `#graphql
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          userErrors { field message }
        }
      }
      `,
      {
        variables: {
          basicCodeDiscount: discountInput
        }
      }
    );

    const result = await response.json();
    if (result.errors) {
      console.error("Discount Creation Errors:", result.errors);
      return data({ error: "GraphQL Error: " + result.errors[0].message });
    }

    const userErrors = result.data?.discountCodeBasicCreate?.userErrors;
    if (userErrors && userErrors.length > 0) {
      console.error("Discount User Errors:", userErrors);
      return data({ error: userErrors[0].message });
    }

    // --- Action 3: Save to Database ---
    try {
      await db.lead.create({
        data: {
          shop: session.shop,
          email: email,
          couponCode: finalCode,
          prize: label,
        }
      });
      console.log("Lead saved to database successfully.");
    } catch (dbErr) {
      console.error("Database Save Error:", dbErr);
      // We don't return error to user here because the coupon was already created
    }

    return data({ code: finalCode });

  } catch (err) {
    console.error("CRITICAL PROXY ERROR:", err);
    return data({ error: "Server Error: " + err.message });
  }
};
