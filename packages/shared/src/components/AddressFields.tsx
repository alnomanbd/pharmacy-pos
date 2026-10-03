import { useState } from 'react';
import { DISTRICTS, DIVISIONS, findDistrict, type Division } from '../lib/districts';
import { UPAZILAS } from '../lib/upazilas';

export type Address = { district?: string; upazila?: string; street?: string; area?: string; postalCode?: string; [k: string]: string | undefined };

/**
 * A Bangladeshi address the way it is said: division, district, upazila (or
 * city corporation), then the street. Each list narrows the next; the
 * division is only a way to find the district and is not sent — the server
 * works it out. A district saved before the list existed and naming none
 * stays shown, marked, until it is changed.
 */
export default function AddressFields({
  value,
  onChange,
  bn = false,
  idPrefix = 'addr',
}: {
  value: Address;
  onChange: (next: Address) => void;
  bn?: boolean;
  idPrefix?: string;
}) {
  const known = findDistrict(value.district);
  const [divisionPick, setDivisionPick] = useState<Division | ''>('');
  const division = known?.division ?? divisionPick;
  const districts = division ? DISTRICTS.filter((d) => d.division === division) : DISTRICTS;
  const upazilas = known ? UPAZILAS[known.name] ?? [] : [];
  const w = (en: string, b: string) => (bn ? b : en);
  const id = (k: string) => `${idPrefix}-${k}`;
  const label = 'mb-1 block text-xs font-semibold text-muted-foreground';

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={label} htmlFor={id('division')}>
          {w('Division', 'বিভাগ')}
        </label>
        <select
          id={id('division')}
          className="input h-10 w-full"
          value={division}
          onChange={(e) => {
            const next = e.target.value as Division | '';
            setDivisionPick(next);
            if (known && known.division !== next) onChange({ ...value, district: '', upazila: '' });
          }}
        >
          <option value="">{w('Any division', 'যেকোনো বিভাগ')}</option>
          {(Object.keys(DIVISIONS) as Division[]).map((d) => (
            <option key={d} value={d}>
              {bn ? DIVISIONS[d] : d}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor={id('district')}>
          {w('District', 'জেলা')}
        </label>
        <select
          id={id('district')}
          className="input h-10 w-full"
          value={known?.name ?? value.district ?? ''}
          onChange={(e) => onChange({ ...value, district: e.target.value, upazila: '' })}
        >
          <option value="">{w('Pick a district', 'জেলা বাছুন')}</option>
          {value.district && !known && <option value={value.district}>{`${value.district} (${w('not on the list', 'তালিকায় নেই')})`}</option>}
          {districts.map((d) => (
            <option key={d.name} value={d.name}>
              {bn ? d.bn : d.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor={id('upazila')}>
          {w('Upazila or city', 'উপজেলা বা সিটি')}
        </label>
        <select
          id={id('upazila')}
          className="input h-10 w-full"
          value={value.upazila ?? ''}
          disabled={!known}
          onChange={(e) => onChange({ ...value, upazila: e.target.value })}
        >
          <option value="">{known ? w('Pick one', 'বাছুন') : w('Pick the district first', 'আগে জেলা বাছুন')}</option>
          {upazilas.map(([en, b]) => (
            <option key={en} value={en}>
              {bn ? b : en}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor={id('postcode')}>
          {w('Postcode', 'পোস্টকোড')}
        </label>
        <input
          id={id('postcode')}
          className="input h-10 w-full"
          inputMode="numeric"
          maxLength={20}
          value={value.postalCode ?? ''}
          onChange={(e) => onChange({ ...value, postalCode: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor={id('street')}>
          {w('Address', 'ঠিকানা')}
        </label>
        <input
          id={id('street')}
          className="input h-10 w-full"
          maxLength={160}
          value={value.street ?? ''}
          placeholder={w('Shop no., road, building', 'দোকান নং, রোড, ভবন')}
          onChange={(e) => onChange({ ...value, street: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor={id('area')}>
          {w('Area or market', 'এলাকা বা মার্কেট')}
        </label>
        <input
          id={id('area')}
          className="input h-10 w-full"
          maxLength={120}
          value={value.area ?? ''}
          placeholder={w('e.g. Satmatha, Mitford', 'যেমন: সাতমাথা, মিটফোর্ড')}
          onChange={(e) => onChange({ ...value, area: e.target.value })}
        />
      </div>
    </div>
  );
}
