import { useState, useEffect } from "react";
import { useLoaderData, useRevalidator, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  let isEmbedEnabled = false;
  const clientId = process.env.SHOPIFY_API_KEY || "";
  
  try {
    const response = await admin.graphql(
      `#graphql
        query {
          themes(roles: [MAIN], first: 1) {
            nodes {
              id
              files(filenames: ["config/settings_data.json"], first: 1) {
                nodes {
                  body {
                    ... on OnlineStoreThemeFileBodyText {
                      content
                    }
                  }
                }
              }
            }
          }
        }`
    );
    
    const responseJson = await response.json();
    const theme = responseJson.data?.themes?.nodes?.[0];
    const settingsDataStr = theme?.files?.nodes?.[0]?.body?.content || "{}";
    
    // Strip comments from settings_data.json safely
    let cleanJson = "";
    let inString = false;
    let inComment = false;
    let inBlockComment = false;
    for (let i = 0; i < settingsDataStr.length; i++) {
      const c = settingsDataStr[i];
      const next = settingsDataStr[i+1];
      if (!inComment && !inBlockComment) {
        if (c === '"' && settingsDataStr[i-1] !== '\\') {
          inString = !inString;
          cleanJson += c;
        } else if (!inString && c === '/' && next === '/') {
          inComment = true;
          i++;
        } else if (!inString && c === '/' && next === '*') {
          inBlockComment = true;
          i++;
        } else {
          cleanJson += c;
        }
      } else if (inComment && c === '\\n') {
        inComment = false;
        cleanJson += c;
      } else if (inBlockComment && c === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
    }
    
    const settingsData = JSON.parse(cleanJson);
    
    if (settingsData?.current?.blocks) {
      const blocks = settingsData.current.blocks;
      for (const key in blocks) {
        if (blocks[key].type && blocks[key].type.includes("wheelify")) {
          if (blocks[key].disabled !== true) {
            isEmbedEnabled = true;
            break;
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to query theme settings:", error);
  }

  return {
    shop: session.shop,
    apiKey: clientId,
    isEmbedEnabled
  };
};

export default function Index() {
  const { shop, apiKey, isEmbedEnabled } = useLoaderData();
  const [showSuccessBanner, setShowSuccessBanner] = useState(isEmbedEnabled);
  const revalidator = useRevalidator();
  const navigate = useNavigate();

  useEffect(() => {
    setShowSuccessBanner(isEmbedEnabled);
  }, [isEmbedEnabled]);

  useEffect(() => {
    const handleFocus = () => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [revalidator]);

  const enableEmbedUrl = `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${apiKey}/wheelify`;

  return (
    <s-page heading="Spin the Wheel">
      <s-section>
        <s-paragraph>Welcome to Spin the Wheel Application</s-paragraph>
        
        {isEmbedEnabled && showSuccessBanner && (
          <div style={{ backgroundColor: '#e3f1df', color: '#20402e', padding: '12px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg viewBox="0 0 20 20" style={{ width: '20px', height: '20px', fill: '#20402e' }}>
                <path fillRule="evenodd" d="M10 20a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm-1.5-5.5L17 6l-1.5-1.5L8.5 11.5 4.5 7.5 3 9l5.5 5.5z"/>
              </svg>
              <span style={{ fontWeight: 500 }}>Wheelify script is enabled</span>
            </div>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowSuccessBanner(false)}>
              <svg viewBox="0 0 20 20" style={{ width: '16px', height: '16px', fill: '#20402e' }}>
                <path d="M11.414 10l4.293-4.293a1 1 0 0 0-1.414-1.414L10 8.586 5.707 4.293a1 1 0 0 0-1.414 1.414L8.586 10l-4.293 4.293a1 1 0 1 0 1.414 1.414L10 11.414l4.293 4.293a1 1 0 0 0 1.414-1.414L11.414 10z" />
              </svg>
            </button>
          </div>
        )}

        <div style={{ marginTop: "16px" }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '16px 0 8px 0' }}>Add the app to your theme</h2>
          <s-paragraph>
            To show the Wheelify popup on your store, enable the Wheelify in your Shopify theme.
          </s-paragraph>
          
          <div style={{ margin: "12px 0 16px 0" }}>
            <s-paragraph>1. To enable the Wheelify, click the button below.</s-paragraph>
            <s-paragraph>2. Click &quot;Save&quot;</s-paragraph>
          </div>

          {!isEmbedEnabled ? (
            <s-button onClick={() => window.open(enableEmbedUrl, '_blank')}>
              Enable App Embed
            </s-button>
          ) : (
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <button
                onClick={() => window.open(enableEmbedUrl, '_blank')}
                style={{
                  backgroundColor: '#d9d9d9',
                  color: '#ffffff',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                App embed enabled!
                <svg viewBox="0 0 20 20" style={{ width: '16px', height: '16px', fill: '#ffffff' }}>
                  <path d="M11 3a1 1 0 1 0 0 2h2.586l-6.293 6.293a1 1 0 1 0 1.414 1.414L15 6.414V9a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1h-5z"/>
                  <path d="M5 5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3a1 1 0 1 0-2 0v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 1 0 0-2H5z"/>
                </svg>
              </button>
              
              <s-button variant="primary" onClick={() => navigate('/app/spin-the-wheel')}>
                Continue
              </s-button>
            </div>
          )}
          
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
