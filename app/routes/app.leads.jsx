import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  const leads = await db.lead.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });

  return { leads };
};

export default function Leads() {
  const { leads } = useLoaderData();

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: '#fff',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  };

  const thStyle = {
    textAlign: 'left',
    padding: '16px',
    backgroundColor: '#f6f6f7',
    borderBottom: '1px solid #e1e3e5',
    fontSize: '13px',
    fontWeight: '600',
    color: '#6d7175'
  };

  const tdStyle = {
    padding: '16px',
    borderBottom: '1px solid #f1f1f1',
    fontSize: '14px',
    color: '#202223'
  };

  return (
    <s-page heading="Collected Leads">
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <p style={{ marginBottom: '24px', color: '#6d7175' }}>
          View all customers who have spun the wheel and the prizes they won.
        </p>

        {leads.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e1e3e5' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
            <h3 style={{ fontWeight: '600', fontSize: '16px' }}>No leads yet</h3>
            <p style={{ color: '#6d7175' }}>Once customers start spinning the wheel, their details will appear here.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Customer Email</th>
                  <th style={thStyle}>Prize Won</th>
                  <th style={thStyle}>Coupon Code</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td style={tdStyle}>{new Date(lead.createdAt).toLocaleDateString()}</td>
                    <td style={{ ...tdStyle, fontWeight: '600' }}>{lead.email}</td>
                    <td style={tdStyle}>
                      <span style={{ backgroundColor: '#f0f7ff', color: '#005f2c', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                        {lead.prize}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{lead.couponCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </s-page>
  );
}
