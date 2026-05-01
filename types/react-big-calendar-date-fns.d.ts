/**
 * Ambient module declaration for `react-big-calendar`'s date-fns
 * localizer subpath.
 *
 * @types/react-big-calendar declares the main entry but not the
 * `lib/localizers/date-fns` subpath, even though it ships in the
 * runtime package. Rather than monkey-patch DefinitelyTyped, we
 * declare a minimal local typing matching the function's actual
 * signature (see `node_modules/react-big-calendar/lib/localizers/
 * date-fns.js`):
 *
 *   dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales })
 *     -> DateLocalizer
 */
declare module "react-big-calendar/lib/localizers/date-fns" {
  import { DateLocalizer } from "react-big-calendar";
  import type { Locale } from "date-fns";

  type DateFnsLocalizerOptions = {
    format: (date: Date, formatString: string, options?: { locale?: Locale }) => string;
    parse: (
      dateString: string,
      formatString: string,
      backupDate: Date,
      options?: { locale?: Locale },
    ) => Date;
    startOfWeek: (date: Date, options?: { locale?: Locale }) => Date;
    getDay: (date: Date) => number;
    locales: Record<string, Locale>;
  };

  const dateFnsLocalizer: (options: DateFnsLocalizerOptions) => DateLocalizer;
  export default dateFnsLocalizer;
}
