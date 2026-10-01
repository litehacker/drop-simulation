interface ParamFieldProps {
  id: string
  label: string
  value: number
  unit: string
  tooltip: string
  source: string
  locked: boolean
  step?: number
  min?: number
  max?: number
  onChange: (value: number) => void
  onLock: (locked: boolean) => void
}

export function ParamField({
  id,
  label,
  value,
  unit,
  tooltip,
  source,
  locked,
  step = 0.1,
  min,
  max,
  onChange,
  onLock,
}: ParamFieldProps) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-top">
        <span className="field-label">
          {label}
          <span className="info" tabIndex={0} title={tooltip}>
            i
          </span>
        </span>
        <span className="source">{source}</span>
      </span>
      <span className="field-control">
        <input
          type="checkbox"
          checked={!locked}
          aria-label={`Edit ${label}`}
          title="Uncheck to keep this value fixed"
          onChange={(event) => onLock(!event.target.checked)}
        />
        <input
          id={id}
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          disabled={locked}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
        />
        <span className="unit">{unit}</span>
      </span>
    </label>
  )
}

interface ChoiceProps {
  label: string
  value: string
  tooltip: string
  source: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

export function ChoiceField({ label, value, tooltip, source, options, onChange }: ChoiceProps) {
  return (
    <label className="field">
      <span className="field-top">
        <span className="field-label">
          {label}
          <span className="info" tabIndex={0} title={tooltip}>
            i
          </span>
        </span>
        <span className="source">{source}</span>
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ToggleField({
  label,
  checked,
  tooltip,
  source,
  onChange,
}: {
  label: string
  checked: boolean
  tooltip: string
  source: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="field toggle">
      <span className="field-top">
        <span className="field-label">
          {label}
          <span className="info" tabIndex={0} title={tooltip}>
            i
          </span>
        </span>
        <span className="source">{source}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

export function TextField({
  label,
  value,
  tooltip,
  source,
  onChange,
}: {
  label: string
  value: string
  tooltip: string
  source: string
  onChange: (value: string) => void
}) {
  return (
    <label className="field">
      <span className="field-top">
        <span className="field-label">
          {label}
          <span className="info" tabIndex={0} title={tooltip}>
            i
          </span>
        </span>
        <span className="source">{source}</span>
      </span>
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
