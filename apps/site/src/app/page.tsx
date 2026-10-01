import { redirect } from 'next/navigation';
import { DEFAULT_LANG } from '@/lib/site';

/**
 * The bare origin.
 *
 * A static export cannot detect a browser's language, so this is a plain
 * redirect to English and the language switch in the header is the way out. The
 * alternative — serving both from `/` and picking with a script — costs a flash
 * of the wrong language on every visit, and on a Bangla page the wrong flash is
 * a page of tofu boxes.
 */
export const dynamic = 'force-static';

export default function RootPage() {
  redirect(`/${DEFAULT_LANG}`);
}
