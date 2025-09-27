import { useSearchParams, Link } from "react-router-dom";

export default function Success() {
  const [q] = useSearchParams();
  const id = q.get("booking");
  return (
    <div style={{ padding: 24 }}>
      <h2>Payment Successful</h2>
      <p>Your booking #{id} is confirmed.</p>
      <p><Link to="/trips">Go to My Trips →</Link></p>
    </div>
  );
}
