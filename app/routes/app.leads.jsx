import { useState } from "react";
import { useLoaderData, useSearchParams, useSubmit } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page")) || 1;
  const pageSize = 50;

  const totalLeads = await db.lead.count({
    where: { shop: session.shop }
  });

  const leads = await db.lead.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize
  });

  return {
    leads,
    currentPage: page,
    totalPages: Math.ceil(totalLeads / pageSize),
    totalLeads
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "clear_leads") {
    await db.lead.deleteMany({
      where: { shop: session.shop }
    });
    return { success: true };
  }

  return { success: false };
};

export default function Leads() {
  const { leads, currentPage, totalPages, totalLeads } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showConfirm, setShowConfirm] = useState(false);

  const submit = useSubmit();

  const handlePageChange = (newPage) => {
    setSearchParams({ page: newPage });
  };

  const handleClearLeads = () => {
    setShowConfirm(true);
  };

  const confirmDelete = () => {
    submit({ intent: "clear_leads" }, { method: "POST" });
    setShowConfirm(false);
  };

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

  const btnStyle = {
    padding: '8px 16px',
    backgroundColor: '#fff',
    border: '1px solid #e1e3e5',
    borderRadius: '6px',
    color: '#202223',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    margin: '0 4px',
    transition: 'all 0.2s'
  };

  const redBtnStyle = {
    ...btnStyle,
    color: '#fff',
    backgroundColor: '#ff051e',
    border: 'none',
    boxShadow: '0 2px 4px rgba(255, 5, 30, 0.2)'
  };

  const disabledBtnStyle = {
    ...btnStyle,
    color: '#babec3',
    cursor: 'not-allowed',
    backgroundColor: '#f6f6f7'
  };

  return (
    <s-page heading="Collected Leads">
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <p style={{ marginBottom: '24px', color: '#6d7175' }}>
          Showing {leads.length} of {totalLeads} customers who have spin the wheel.
        </p>

        {leads.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e1e3e5' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
            <h3 style={{ fontWeight: '600', fontSize: '16px' }}>No leads yet</h3>
            <p style={{ color: '#6d7175' }}>Once customers start spinning the wheel, their details will appear here.</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '50px' }}>S.No</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Customer Email</th>
                    <th style={thStyle}>Prize Won</th>
                    <th style={thStyle}>Coupon Code</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <tr key={lead.id} style={{ transition: 'background 0.2s' }}>
                      <td style={{ ...tdStyle, color: '#6d7175' }}>{(currentPage - 1) * 50 + i + 1}</td>
                      <td style={tdStyle}>
                        {new Date(lead.createdAt).getDate().toString().padStart(2, '0')}-
                        {(new Date(lead.createdAt).getMonth() + 1).toString().padStart(2, '0')}-
                        {new Date(lead.createdAt).getFullYear()}
                      </td>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: '1px solid #e1e3e5' }}>
              {/* Left Side: Clear All Button */}
              <div>
                <button
                  onClick={handleClearLeads}
                  style={redBtnStyle}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#d9041a'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#ff051e'}
                >
                  Clear All Data
                </button>
              </div>

              {/* Right Side: Pagination Controls */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    style={currentPage <= 1 ? disabledBtnStyle : btnStyle}
                  >
                    Previous
                  </button>
                  <span style={{ margin: '0 16px', fontSize: '14px', color: '#6d7175', fontWeight: '500' }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    style={currentPage >= totalPages ? disabledBtnStyle : btnStyle}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '32px', borderRadius: '12px', width: '400px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>Are you sure?</h2>
            <p style={{ color: '#6d7175', marginBottom: '24px', lineHeight: '1.5' }}>
              Do you really want to delete all collected leads? This action cannot be undone and all history will be lost.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{ padding: '10px 20px', border: '1px solid #e1e3e5', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: '600' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{ padding: '10px 20px', border: 'none', borderRadius: '8px', backgroundColor: '#ff051e', color: '#fff', cursor: 'pointer', fontWeight: '600' }}
              >
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </s-page>
  );
}
