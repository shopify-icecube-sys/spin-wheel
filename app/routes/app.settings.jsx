import { useState, useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData, useSubmit, useActionData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  try {
    const response = await admin.graphql(`
      query {
        currentAppInstallation {
          metafield(namespace: "wheelify", key: "settings") {
            value
          }
        }
      }
    `);
    const json = await response.json();
    const saved = json.data?.currentAppInstallation?.metafield?.value;
    return { savedSettings: saved ? JSON.parse(saved) : null };
  } catch (e) {
    return { savedSettings: null };
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const settingsJson = formData.get("settings");
  if (!settingsJson) return { success: false };

  try {
    const appInstResponse = await admin.graphql(`query { currentAppInstallation { id } }`);
    const appInstJson = await appInstResponse.json();
    const appInstallationId = appInstJson.data.currentAppInstallation.id;

    const saveResponse = await admin.graphql(
      `#graphql
        mutation SaveSettings($metafieldsSetInput: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafieldsSetInput) {
            userErrors { field message }
          }
        }
      `,
      {
        variables: {
          metafieldsSetInput: [{
            namespace: "wheelify",
            key: "settings",
            type: "json",
            value: settingsJson,
            ownerId: appInstallationId
          }]
        }
      }
    );
    const saveJson = await saveResponse.json();
    const userErrors = saveJson.data?.metafieldsSet?.userErrors;

    if (userErrors && userErrors.length > 0) {
      console.error("Metafield Save Errors:", userErrors);
      return { success: false, error: userErrors[0].message };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

const DEFAULT_SETTINGS = {
  popupFrequency: "once_24h",
  popupPosition: "bottom-right",
  triggerText: "Spin & Win!",
  popupTitle: "Valentine's Day Sale!",
  popupSubtitle: "Enter your email to get a chance to win a discount!",
  formButtonText: "TRY YOUR LUCK!",
  spinButtonText: " Spin to Win!",
  formDisclaimer: "From time to time, we may send you more special offers. You can unsubscribe at any time.",
  discountUsageLimit: 1,
  customCooldownDays: 30,
  couponExpiryMinutes: 60,
  triggerColor: "#ff4d6d",
};

export default function Settings() {
  const { savedSettings } = useLoaderData();
  const submit = useSubmit();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [settings, setSettings] = useState({
    ...DEFAULT_SETTINGS,
    ...(savedSettings || {})
  });
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (actionData?.success) {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(t);
    }
  }, [actionData]);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    submit({ settings: JSON.stringify(settings) }, { method: "post" });
  };

  const inputStyle = {
    padding: '8px 12px',
    border: '1px solid #c9cccf',
    borderRadius: '6px',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box'
  };

  const labelStyle = { fontSize: '13px', fontWeight: '600', color: '#202223', marginBottom: '6px', display: 'block' };
  const hintStyle = { fontSize: '12px', color: '#8c9196', marginTop: '4px' };

  const cardStyle = {
    backgroundColor: '#fff',
    border: '1px solid #e1e3e5',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '20px'
  };

  return (
    <s-page heading="Settings">
      {showToast && (
        <div style={{ backgroundColor: '#cce8d6', color: '#005f2c', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}>
          <svg viewBox="0 0 20 20" style={{ width: '20px', height: '20px', fill: 'currentColor' }}>
            <path fillRule="evenodd" d="M10 20a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm5.707-10.707a1 1 0 0 0-1.414-1.414l-5.293 5.293-2.293-2.293a1 1 0 0 0-1.414 1.414l3 3a1 1 0 0 0 1.414 0l6-6z" />
          </svg>
          Settings saved successfully!
        </div>
      )}

      {actionData?.error && (
        <div style={{ backgroundColor: '#fbeae5', color: '#8b0000', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}>
          <svg viewBox="0 0 20 20" style={{ width: '20px', height: '20px', fill: 'currentColor' }}>
            <path fillRule="evenodd" d="M10 20a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm-1-5a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm0-7a1 1 0 0 1 2 0v4a1 1 0 0 1-2 0V8z" />
          </svg>
          Error: {actionData.error}
        </div>
      )}

      <div style={{ maxWidth: '720px' }}>

        {/* Lead Generation */}
        {/* Lead Generation (Mandatory) */}
        <div style={cardStyle}>
          <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '6px', marginTop: 0 }}>Lead Generation</h3>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '0' }}>Email collection is enabled by default to create Shopify customer records before every spin.</p>



          <div style={{ borderTop: '1px solid #eee', paddingTop: '20px', marginTop: '20px' }}>
            <label style={labelStyle}>Coupon Expiry (Minutes)</label>
            <input
              type="number"
              min="0"
              value={settings.couponExpiryMinutes}
              onChange={(e) => handleChange('couponExpiryMinutes', parseInt(e.target.value) || 0)}
              style={{ ...inputStyle, maxWidth: '120px' }}
            />
            <p style={hintStyle}>How many minutes the discount code remains valid after generation. Set to 0 for no expiry.</p>
          </div>
        </div>

        {/* Spin Interval (Set Days) */}
        <div style={cardStyle}>
          <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '6px', marginTop: 0 }}>Set Days (Spin Interval)</h3>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>Specify how many days a visitor must wait before they can spin the wheel again.</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="number"
              min="1"
              step="1"
              value={settings.customCooldownDays}
              onChange={(e) => handleChange('customCooldownDays', parseInt(e.target.value) || 1)}
              style={{ ...inputStyle, maxWidth: '100px' }}
            />
            <span style={{ fontSize: '14px', color: '#666', fontWeight: '600' }}>Days</span>
          </div>
          <p style={hintStyle}>Visitors will see a warning message in the popup if they try to spin before this period ends.</p>
        </div>

        {/* Popup Position & Theme */}
        <div style={cardStyle}>
          <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '6px', marginTop: 0 }}>Appearance & Position</h3>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>Customize the look and location of your "Spin & Win" trigger.</p>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Trigger Button Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input 
                type="color" 
                value={settings.triggerColor || settings.themeColor} 
                onChange={(e) => handleChange('triggerColor', e.target.value)}
                style={{ width: '50px', height: '40px', padding: '0', border: 'none', cursor: 'pointer', backgroundColor: 'transparent' }}
              />
              <input 
                type="text" 
                value={settings.triggerColor || settings.themeColor} 
                onChange={(e) => handleChange('triggerColor', e.target.value)}
                style={{ ...inputStyle, maxWidth: '120px' }}
              />
            </div>
            <p style={hintStyle}>This color will ONLY be applied to the floating "Spin & Win" button on your storefront.</p>
          </div>

          <label style={labelStyle}>Trigger Button Position</label>
          <div style={{ display: 'flex', gap: '12px' }}>
            {[
              { value: 'bottom-right', label: 'Bottom Right' },
              { value: 'bottom-left', label: 'Bottom Left' },
            ].map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '8px', border: `2px solid ${settings.popupPosition === opt.value ? '#2b8df1' : '#e1e3e5'}`, cursor: 'pointer', backgroundColor: settings.popupPosition === opt.value ? '#f0f7ff' : '#fff', flex: 1, fontWeight: '600', fontSize: '14px' }}>
                <input type="radio" name="popupPosition" value={opt.value} checked={settings.popupPosition === opt.value} onChange={() => handleChange('popupPosition', opt.value)} style={{ accentColor: '#2b8df1' }} />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Text Customization */}
        <div style={cardStyle}>
          <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '6px', marginTop: 0 }}>Text Customization</h3>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>Customize the text shown on the trigger button and inside the popup.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Trigger Button Text</label>
              <input type="text" value={settings.triggerText} onChange={(e) => handleChange('triggerText', e.target.value)} style={inputStyle} placeholder="Spin & Win!" />
              <p style={hintStyle}>Text shown on the floating button in the bottom corner.</p>
            </div>

            <div>
              <label style={labelStyle}>Popup Title</label>
              <input type="text" value={settings.popupTitle} onChange={(e) => handleChange('popupTitle', e.target.value)} style={inputStyle} placeholder="Try Your Luck!" />
              <p style={hintStyle}>The main heading shown at the top of the wheel popup.</p>
            </div>

            <div>
              <label style={labelStyle}>Popup Subtitle</label>
              <input type="text" value={settings.popupSubtitle} onChange={(e) => handleChange('popupSubtitle', e.target.value)} style={inputStyle} placeholder="Enter your email to win!" />
              <p style={hintStyle}>Description text shown below the title.</p>
            </div>

            <div>
              <label style={labelStyle}>Submit Button Text (Email Form)</label>
              <input type="text" value={settings.formButtonText} onChange={(e) => handleChange('formButtonText', e.target.value)} style={inputStyle} placeholder="TRY YOUR LUCK!" />
              <p style={hintStyle}>Text on the button that submits the email form.</p>
            </div>

            <div>
              <label style={labelStyle}>Spin Button Text</label>
              <input type="text" value={settings.spinButtonText} onChange={(e) => handleChange('spinButtonText', e.target.value)} style={inputStyle} placeholder="🎯 Spin to Win!" />
              <p style={hintStyle}>Text on the button that actually spins the wheel.</p>
            </div>

            <div>
              <label style={labelStyle}>Disclaimer / Footer Text</label>
              <textarea
                value={settings.formDisclaimer}
                onChange={(e) => handleChange('formDisclaimer', e.target.value)}
                style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                placeholder="From time to time..."
              />
              <p style={hintStyle}>Small text shown at the bottom of the form.</p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div style={{ marginTop: '8px' }}>
          <button
            disabled={isSaving}
            onClick={handleSave}
            style={{ backgroundColor: isSaving ? '#e3e3e3' : '#2b8df1', color: isSaving ? '#8c9196' : 'white', border: 'none', padding: '12px 28px', borderRadius: '6px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
