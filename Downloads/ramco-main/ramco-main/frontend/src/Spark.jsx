export default function Spark({ values = [4, 7, 5, 9, 6, 11, 8], accentLast = true }) {
  const max = Math.max(...values, 1);
  return (
    <div className="spark" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={accentLast && i === values.length - 1 ? 'on' : ''}
          style={{ height: `${Math.max(12, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
