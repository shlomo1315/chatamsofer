import { MAINTENANCE_MESSAGE } from '@/lib/maintenance'

// מסך תחזוקה: מחליף את הכניסה וההרשמה כש-MAINTENANCE_MODE=true
export default function MaintenanceNotice() {
  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: '#f5f7fb', fontFamily: 'Heebo, sans-serif',
      }}
    >
      <div
        role="status"
        style={{
          maxWidth: 480, width: '100%', textAlign: 'center', background: '#fff', borderRadius: 16,
          padding: '40px 28px', boxShadow: '0 4px 24px rgba(15,35,80,0.08)', border: '1px solid #e3e8f2',
        }}
      >
        <div style={{ width: 56, height: 56, margin: '0 auto 20px', borderRadius: 28, background: '#0f2350', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a24b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />
          </svg>
        </div>
        <h1 style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 700, color: '#0f2350' }}>שדרוג המערכת</h1>
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.7, color: '#3b4660' }}>{MAINTENANCE_MESSAGE}</p>
      </div>
    </main>
  )
}
