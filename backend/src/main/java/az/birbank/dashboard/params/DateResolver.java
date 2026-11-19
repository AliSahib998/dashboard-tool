package az.birbank.dashboard.params;

import az.birbank.dashboard.common.BadRequestException;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.TemporalAdjusters;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses date filter values: ISO dates (2026-11-01) or relative values that stay current,
 * such as today, yesterday, start_of_week, start_of_month, start_of_year, -30d, -2w, -6m, -1y.
 */
public final class DateResolver {

    private static final Pattern RELATIVE = Pattern.compile("^([+-]?\\d{1,4})([dwmy])$");

    private DateResolver() {}

    public static LocalDate resolve(String raw, String label) {
        String s = raw.trim().toLowerCase();
        LocalDate today = LocalDate.now();
        switch (s) {
            case "today": return today;
            case "yesterday": return today.minusDays(1);
            case "start_of_week": return today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            case "start_of_month": return today.withDayOfMonth(1);
            case "start_of_year": return today.withDayOfYear(1);
            default: break;
        }
        Matcher m = RELATIVE.matcher(s);
        if (m.matches()) {
            int n = Integer.parseInt(m.group(1));
            return switch (m.group(2)) {
                case "d" -> today.plusDays(n);
                case "w" -> today.plusWeeks(n);
                case "m" -> today.plusMonths(n);
                default -> today.plusYears(n);
            };
        }
        try {
            return LocalDate.parse(s.length() > 10 ? s.substring(0, 10) : s);
        } catch (DateTimeParseException e) {
            throw new BadRequestException("\"" + raw + "\" is not a valid date for " + label
                + ". Use YYYY-MM-DD or a relative value like today, -30d or start_of_month.");
        }
    }
}
