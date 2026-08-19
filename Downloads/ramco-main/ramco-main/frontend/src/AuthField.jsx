export default function AuthField({ label, icon: Icon, children }) {
  return (
    <label className="auth-field">
      {label}
      <div className="auth-field-wrap">
        {Icon && (
          <span className="auth-field-ico" aria-hidden="true">
            <Icon set="light" primaryColor="currentColor" stroke="regular" size={18} />
          </span>
        )}
        {children}
      </div>
    </label>
  );
}
