package az.birbank.dashboard.params;

import java.util.List;

/**
 * A question variable ({{name}}) or a dashboard filter.
 *
 * @param name         variable name used in {{name}}; for dashboard filters, the URL key
 * @param label        text shown next to the input
 * @param type         text, number or date
 * @param widget       input or dropdown
 * @param options      static dropdown values (used when source is null)
 * @param source       dropdown values read from a column
 * @param defaultValue used when no value is given; dates may be relative (today, -30d, start_of_month...)
 */
public record ParameterDef(String name, String label, String type, String widget, List<String> options,
                           OptionsSource source, String defaultValue) {

    public record OptionsSource(Long dataSourceId, String table, String column) {}

    public String typeOrText() {
        return type == null || type.isBlank() ? "text" : type;
    }

    public String labelOrName() {
        return label == null || label.isBlank() ? name : label;
    }
}
