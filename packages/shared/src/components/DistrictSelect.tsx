import { DISTRICTS, DIVISIONS, findDistrict, type Division } from '../lib/districts';

const BY_DIVISION = (Object.keys(DIVISIONS) as Division[]).map((division) => ({
  division,
  districts: DISTRICTS.filter((d) => d.division === division),
}));

/**
 * One of Bangladesh's 64 districts, grouped by division, in English or Bangla.
 * Stores the official English name whichever is shown. A value typed before
 * the list existed and naming no district stays visible, marked, until it is
 * changed — never silently dropped.
 */
export default function DistrictSelect({
  value,
  onChange,
  bn = false,
  placeholder,
  className = 'input',
  id,
  disabled,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (district: string) => void;
  bn?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const known = findDistrict(value);
  const current = known?.name ?? value;
  return (
    <select id={id} className={className} value={current} disabled={disabled} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? (bn ? 'জেলা বাছুন' : 'Pick a district')}</option>
      {value && !known && <option value={value}>{bn ? `${value} (তালিকায় নেই)` : `${value} (not on the list)`}</option>}
      {BY_DIVISION.map((g) => (
        <optgroup key={g.division} label={bn ? `${DIVISIONS[g.division]} বিভাগ` : `${g.division} division`}>
          {g.districts.map((d) => (
            <option key={d.name} value={d.name}>
              {bn ? d.bn : d.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
