import { ArbitragePanel } from '../../src/components/ArbitragePanel';
import { RequireSignIn } from '../../src/components/RequireSignIn';

export default function ArbScreen() {
  return (
    <RequireSignIn>
      <ArbitragePanel />
    </RequireSignIn>
  );
}
