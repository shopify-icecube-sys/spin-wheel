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
        // If it's a permission error, we show a helpful message
        if (result.errors[0].message.includes("access the Customer object")) {
           return data({ error: "PERMISSION REQUIRED: Please go to your Shopify Partner Dashboard -> App -> API Access and request access to 'Protected Customer Data' to allow creating customers." });
        }
        return data({ error: "Shopify API Error: " + result.errors[0].message });
      }

      const userErrors = result.data?.customerCreate?.userErrors;

      if (userErrors && userErrors.length > 0) {
        console.log("Customer Creation User Errors:", userErrors);
        const isAlreadyExists = userErrors.some(e => 
          e.message.toLowerCase().includes("taken") || 
          e.message.toLowerCase().includes("exists") ||
          e.message.toLowerCase().includes("already") ||
          (e.field && e.field.includes("email"))
        );
        
        if (isAlreadyExists) {
          console.log("Customer already exists, allowing spin.");
          return data({ success: true, existing: true });
        }
        return data({ error: userErrors[0].message });
      }

      console.log("Customer created successfully.");
      return data({ success: true });
    }

    // --- Action 2: Generate Unique Discount ---
    const label = formData.get("label") || "10% OFF";
    const email = formData.get("email") || "Unknown";
    const usageLimit = parseInt(formData.get("usageLimit")) || 1;
    const match = label.match(/(\d+)%/);
    const percentageValue = match ? parseFloat(match[1]) / 100 : 0.1;
    
    const uniqueId = Math.random().toString(36).substring(2, 6).toUpperCase();
    const cleanValue = label.replace(/[^0-9]/g, "");
    const finalCode = `${cleanValue}PERCENT-${uniqueId}`;

    console.log("Generating discount for label:", label, "code:", finalCode);

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
          basicCodeDiscount: {
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
          }
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
