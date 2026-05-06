import { useState, useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useSubmit, useLoaderData, useActionData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import WheelPreview from "../components/WheelPreview";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(`
      query {
        currentAppInstallation {
          metafield(namespace: "wheelify", key: "config") {
            value
          }
        }
      }
    `);
    const json = await response.json();
    const savedConfigStr = json.data?.currentAppInstallation?.metafield?.value;

    if (savedConfigStr) {
      return { savedSlices: JSON.parse(savedConfigStr) };
    }
  } catch (error) {
    console.error("Failed to load metafield config:", error);
  }

  return { savedSlices: null };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const slicesJson = formData.get("slices");

  if (!slicesJson) return { success: false };

  const slices = JSON.parse(slicesJson);

  try {
    // 1. Get App Installation ID for Metafields
    const appInstResponse = await admin.graphql(`
      query {
        currentAppInstallation {
          id
        }
      }
    `);
    const appInstJson = await appInstResponse.json();
    const appInstallationId = appInstJson.data.currentAppInstallation.id;

    // 2. Save Slices configuration to App Metafield
    await admin.graphql(
      `#graphql
        mutation CreateAppDataMetafield($metafieldsSetInput: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafieldsSetInput) {
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          metafieldsSetInput: [
            {
              namespace: "wheelify",
              key: "config",
              type: "json",
              value: slicesJson,
              ownerId: appInstallationId
            }
          ]
        }
      }
    );

    // 3. Generate Discount Codes
    for (const slice of slices) {
      if (slice.type === 'Win' && slice.coupon) {
        const match = slice.label.match(/(\d+)%/);
        const percentage = match ? parseFloat(match[1]) / 100 : 0.10;

        await admin.graphql(
          `#graphql
            mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
              discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
                userErrors {
                  field
                  message
                }
              }
            }
          `,
          {
            variables: {
              basicCodeDiscount: {
                title: slice.coupon,
                code: slice.coupon,
                startsAt: new Date().toISOString(),
                customerSelection: { all: true },
                appliesOncePerCustomer: true,
                customerGets: {
                  value: { percentage: percentage },
                  items: { all: true }
                }
              }
            }
          }
        );
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to save settings or create coupons:", error);
    return { success: false, error: error.message };
  }
};

const DEFAULT_SLICES = [
  { type: 'Win', label: '10% OFF', winText: '10% OFF', coupon: '10PERCENT', gravity: '35', color: '#ff4d6d' },
  { type: 'Win', label: '20% OFF', winText: '20% OFF', coupon: '20PERCENT', gravity: '25', color: '#ff758f' },
  { type: 'Win', label: '30% OFF', winText: '30% OFF', coupon: '30PERCENT', gravity: '20', color: '#ff85a1' },
  { type: 'Win', label: '40% OFF', winText: '40% OFF', coupon: '40PERCENT', gravity: '15', color: '#ff99ac' },
  { type: 'Win', label: '50% OFF', winText: '50% OFF', coupon: '50PERCENT', gravity: '5', color: '#ff4d6d' },
];

export default function SpinTheWheel() {
  const { savedSlices } = useLoaderData();
  const submit = useSubmit();
  const actionData = useActionData();
  const navigation = useNavigation();

  const [slices, setSlices] = useState(savedSlices || DEFAULT_SLICES);
  const [showToast, setShowToast] = useState(false);

  const isSaving = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.success) {
      setShowToast(true);
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionData]);

  const handleSliceChange = (index, field, value) => {
    const newSlices = [...slices];
    newSlices[index][field] = value;
    setSlices(newSlices);
  };

  const handleAddSlice = () => {
    if (slices.length < 10) {
      setSlices([...slices, { type: 'Win', label: '10% OFF', winText: '10% OFF', coupon: '10PERCENT', gravity: '10', color: '#ff4d6d' }]);
    }
  };

  const handleRemoveSlice = (index) => {
    if (slices.length > 2) {
      const newSlices = slices.filter((_, i) => i !== index);
      setSlices(newSlices);
    }
  };

  const handleSave = () => {
    // Ensure all slices are 'Win' before saving
    const finalSlices = slices.map(s => ({ ...s, type: 'Win' }));
    submit({ slices: JSON.stringify(finalSlices) }, { method: "post" });
  };

  return (
    <s-page heading="Spin the Wheel">
      {showToast && (
        <div style={{ backgroundColor: '#cce8d6', color: '#005f2c', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}>
          <svg viewBox="0 0 20 20" style={{ width: '20px', height: '20px', fill: 'currentColor' }}>
            <path fillRule="evenodd" d="M10 20a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm5.707-10.707a1 1 0 0 0-1.414-1.414l-5.293 5.293-2.293-2.293a1 1 0 0 0-1.414 1.414l3 3a1 1 0 0 0 1.414 0l6-6z" />
          </svg>
          Settings and coupons saved successfully!
        </div>
      )}

      <div style={{ display: 'flex', gap: '40px', padding: '0 20px', alignItems: 'flex-start' }}>

        {/* Settings Form (Left Side - Scrollable) */}
        <div style={{ flex: '1', maxWidth: '800px' }}>
          <p style={{ color: '#666', marginBottom: '24px' }}>Boost sales with engaging spin wheel themes for festivals and special events.</p>

          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ fontWeight: 'bold', marginBottom: '12px' }}>Slice customizations</h3>
            <p style={{ color: '#666', marginBottom: '16px', fontSize: '14px' }}>Customize the experience by adjusting text, coupons, colors, probabilities, and alignment for all slices.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              {slices.map((slice, i) => (
                <div key={i} style={{ border: '1px solid #e1e3e5', borderRadius: '8px', padding: '16px', display: 'flex', gap: '16px', alignItems: 'flex-start', backgroundColor: '#fff' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '60px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>{String(i + 1).padStart(2, '0')}</span>
                    <button onClick={() => handleRemoveSlice(i)} style={{ background: 'none', border: 'none', color: '#e74c3c', fontSize: '10px', cursor: 'pointer', marginTop: '4px', textDecoration: 'underline' }}>Remove</button>
                    <span style={{ fontSize: '11px', color: '#27ae60', fontWeight: 'bold', marginTop: '4px' }}>
                      {((parseInt(slice.gravity) || 0) / (slices.reduce((acc, s) => acc + (parseInt(s.gravity) || 0), 0) || 1) * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div style={{ flex: 1, display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1', minWidth: '120px' }}>
                      <label style={{ fontSize: '12px' }}>Label</label>
                      <input type="text" value={slice.label} onChange={(e) => handleSliceChange(i, 'label', e.target.value)} style={{ padding: '6px 8px', border: '1px solid #c9cccf', borderRadius: '4px' }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '80px' }}>
                      <label style={{ fontSize: '12px' }}>Gravity*</label>
                      <input type="number" value={slice.gravity} onChange={(e) => handleSliceChange(i, 'gravity', e.target.value)} style={{ padding: '6px 8px', border: '1px solid #c9cccf', borderRadius: '4px' }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1', minWidth: '120px' }}>
                      <label style={{ fontSize: '12px' }}>Win text</label>
                      <input type="text" value={slice.winText} onChange={(e) => handleSliceChange(i, 'winText', e.target.value)} style={{ padding: '6px 8px', border: '1px solid #c9cccf', borderRadius: '4px' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1', minWidth: '120px' }}>
                      <label style={{ fontSize: '12px' }}>Coupon</label>
                      <input type="text" value={slice.coupon} onChange={(e) => handleSliceChange(i, 'coupon', e.target.value)} style={{ padding: '6px 8px', border: '1px solid #c9cccf', borderRadius: '4px' }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100px' }}>
                      <label style={{ fontSize: '12px' }}>Slice color</label>
                      <div style={{ display: 'flex', border: '1px solid #c9cccf', borderRadius: '4px', padding: '4px', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', flex: 1, fontFamily: 'monospace' }}>{slice.color}</span>
                        <input type="color" value={slice.color} onChange={(e) => handleSliceChange(i, 'color', e.target.value)} style={{ width: '20px', height: '20px', padding: 0, border: 'none', cursor: 'pointer' }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <button onClick={handleAddSlice} disabled={slices.length >= 10} style={{ background: '#fff', border: '1px dashed #c9cccf', padding: '12px', borderRadius: '8px', cursor: slices.length >= 10 ? 'not-allowed' : 'pointer', width: '100%', color: '#666', fontWeight: '500' }}>
                + Add new slice (Max 10)
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', marginTop: '24px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e1e3e5' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: slices.reduce((acc, s) => acc + (parseInt(s.gravity) || 0), 0) === 100 ? '#27ae60' : '#e74c3c' }}>
                Total Gravity: {slices.reduce((acc, s) => acc + (parseInt(s.gravity) || 0), 0)}%
              </div>
              {slices.reduce((acc, s) => acc + (parseInt(s.gravity) || 0), 0) !== 100 && (
                <p style={{ margin: 0, fontSize: '13px', color: '#e74c3c', fontWeight: '500' }}>
                  ⚠️ Warning: Total gravity must be exactly 100% for the best winning logic.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '32px' }}>
              <button disabled={isSaving} onClick={handleSave} style={{ backgroundColor: isSaving ? '#e3e3e3' : '#202223', color: isSaving ? '#8c9196' : 'white', border: 'none', padding: '12px 24px', borderRadius: '4px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '16px' }}>
                {isSaving ? 'Saving...' : 'Save settings'}
              </button>
            </div>
          </div>
        </div>

        {/* Live Preview (Right Side - Sticky) */}
        <div style={{ flex: '1', maxWidth: '500px', position: 'sticky', top: '20px', height: 'calc(100vh - 40px)' }}>
          <WheelPreview slices={slices} />
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
