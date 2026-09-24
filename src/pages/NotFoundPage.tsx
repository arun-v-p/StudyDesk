import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';

/** GitHub Pages serves this for unknown paths via 404.html (see public/). */
export function NotFoundPage() {
  return (
    <Card className="mx-auto max-w-lg">
      <EmptyState
        icon={<Compass className="h-7 w-7" aria-hidden="true" />}
        title="Page not found"
        description="That route does not exist. It may be a stale link from an older build."
        actions={
          <Link to="/" className="btn btn--primary">
            Back to Today
          </Link>
        }
      />
    </Card>
  );
}
