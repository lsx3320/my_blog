export const TEMPLATES = [
  { id: 'paper', label: '备忘录白', dot: '#ffffff', ring: '#e5e5ea' },
  { id: 'yellow', label: '便签黄', dot: '#fff7d6', ring: '#e8d98a' },
  { id: 'dark', label: '深色极简', dot: '#1a1a1e', ring: '#3a3a40' },
];

export default function TemplatePicker({ value, onChange }) {
  return (
    <div className="template-picker">
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          className={`template-dot ${value === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
          style={{ background: t.dot, borderColor: value === t.id ? '#0a84ff' : t.ring }}
          aria-label={`模板：${t.label}`}
        />
      ))}
    </div>
  );
}
