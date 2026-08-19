export default function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div className="page-header-copy">
        {subtitle && <p className="page-kicker">{subtitle}</p>}
        <h2>{title}</h2>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
