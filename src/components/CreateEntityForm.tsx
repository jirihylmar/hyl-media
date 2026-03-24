import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createItem } from '../lib/queries';

type FieldDef = {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
};

type Props = {
  entityType: string;
  title: string;
  fields: FieldDef[];
  detailPath: string;
  onCancel: () => void;
};

function slugify(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function shortHash(): string {
  return Math.random().toString(36).substring(2, 6);
}

export function CreateEntityForm({ entityType, title, fields, detailPath, onCancel }: Props) {
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: string, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const name = values['name']?.trim();
    if (!name) { setError('Name is required'); return; }

    const id = `${slugify(name)}_${shortHash()}`;
    setSaving(true);
    try {
      const item: Record<string, unknown> = { id, entityType };
      for (const field of fields) {
        const val = values[field.name]?.trim();
        if (val) item[field.name] = val;
      }
      await createItem(item);
      navigate(`${detailPath}/${id}`);
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <div style={{
      margin: '16px 0', padding: 16,
      background: 'var(--bg-card)', border: '1px solid var(--border-bright)', maxWidth: 500,
    }}>
      <h3 style={{ marginTop: 0 }}>New {title}</h3>
      <form onSubmit={handleSubmit}>
        {fields.map(f => (
          <div key={f.name} style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
              {f.label}{f.required && ' *'}
            </label>
            <input
              value={values[f.name] || ''}
              onChange={e => handleChange(f.name, e.target.value)}
              placeholder={f.placeholder}
              required={f.required}
              style={{ width: '100%' }}
            />
          </div>
        ))}
        {error && <p style={{ color: 'var(--red)', fontSize: '0.85em' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" disabled={saving} className="btn btn-primary">{saving ? 'Creating...' : 'Create'}</button>
          <button type="button" onClick={onCancel} className="btn btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}
