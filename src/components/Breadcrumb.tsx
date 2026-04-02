import { Link } from 'react-router-dom';

type Crumb = { label: string; to?: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumb">
      {items.map((crumb, i) => (
        <span key={i}>
          {i > 0 && <span className="breadcrumb-sep"> &gt; </span>}
          {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
        </span>
      ))}
    </nav>
  );
}
