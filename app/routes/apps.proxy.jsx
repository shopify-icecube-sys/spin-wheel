import { data } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  return data({ message: "Proxy is working" });
};

export const action = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.public.appProxy(request);
    
    if (!admin) {
      console.error("Proxy Error: No admin object returned (Unauthorized)");
      return data({ error: "Unauthorized access to app proxy" }, { status: 401 });
    }

    const formData = await request.formData();
    const actionType = formData.get("action");

    console.log("Proxy Action received:", actionType, "for shop:", session.shop);

    // --- Action 1: Create Customer (Lead Generation) ---
    if (actionType === "create_customer") {
      const email = formData.get("email");
      if (!email) return data({ error: "Email is required" }, { status: 400 });

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
        return data({ error: result.errors[0].message }, { status: 500 });
      }

      const userErrors = result.data?.customerCreate?.userErrors;

      if (userErrors && userErrors.length > 0) {
        console.log("Customer Creation User Errors:", userErrors);
        // Extremely permissive check for existing customer
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
        return data({ error: userErrors[0].message }, { status: 400 });
      }

      console.log("Customer created successfully.");
      return data({ success: true });
    }

    // --- Action 2: Generate Unique Discount ---
    const label = formData.get("label") || "10% OFF";
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
            }
          }
        }
      }
    );

    const result = await response.json();
    if (result.errors) {
      console.error("Discount Creation Errors:", result.errors);
      return data({ error: "GraphQL Error: " + result.errors[0].message }, { status: 500 });
    }

    const userErrors = result.data?.discountCodeBasicCreate?.userErrors;
    if (userErrors && userErrors.length > 0) {
      console.error("Discount User Errors:", userErrors);
      return data({ error: userErrors[0].message }, { status: 400 });
    }

    return data({ code: finalCode });

  } catch (err) {
    console.error("CRITICAL PROXY ERROR:", err);
    return data({ error: "Internal Server Error: " + err.message }, { status: 500 });
  }
};
