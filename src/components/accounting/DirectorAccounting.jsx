import { useAuth } from '../../context/AuthContext';
import PaymentTracking from './PaymentTracking';

export default function DirectorAccounting({ schoolId }) {
  const { profile } = useAuth();

  return (
    <div className="accounting-module demo-stack">
      <header className="dash-header">
        <h1 className="dash-title">Muhasebe</h1>
        <p className="dash-subtitle">Veli ödeme takibi — aylık tutar, dönem ve vade yönetimi.</p>
      </header>

      <PaymentTracking schoolId={schoolId} profile={profile} />
    </div>
  );
}
